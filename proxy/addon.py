# proxy/addon.py
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone

from mitmproxy import http

from db import MetricRepository
from tokens import extract_token_usage, maybe_inject_openai_stream_usage

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# Paths that carry no observability value but arrive in high volume (browser
# probes such as /favicon.ico). Recorded metrics are dropped for these.
IGNORED_PATHS = {
    entry.strip()
    for entry in os.getenv("METRICS_IGNORE_PATHS", "/favicon.ico").split(",")
    if entry.strip()
}


def _get_length(content: bytes | None, headers) -> int:
    if content is not None:
        return len(content)

    raw = headers.get("content-length")
    return int(raw) if raw and raw.isdigit() else 0


class ObservabilityAddon:
    def __init__(self):
        self.repo = MetricRepository()

    async def running(self):
        # Called when mitmproxy starts.
        await self.repo.initialize()

    async def request(self, flow: http.HTTPFlow):
        """
        Optional request mutation.

        Currently only used to add OpenAI streaming usage request option
        when explicitly enabled.
        """
        maybe_inject_openai_stream_usage(flow)

    async def response(self, flow: http.HTTPFlow):
        await self._record(flow, None)

    async def error(self, flow: http.HTTPFlow):
        err_msg = str(flow.error) if flow.error else "unknown"
        await self._record(flow, err_msg)

    def _safe_text(self, message) -> str | None:
        try:
            return message.get_text(strict=False)
        except Exception:
            return None

    def _headers(self, message) -> dict[str, str]:
        return {str(key): str(value) for key, value in message.headers.items()}

    async def _record(self, flow: http.HTTPFlow, error: str | None):
        if not flow.request:
            return

        req = flow.request
        res = flow.response

        # Strip query params to avoid leaking API keys/tokens in logs.
        path = req.path.split("?", 1)[0]

        if path in IGNORED_PATHS:
            return

        # Calculate duration.
        duration_ms = None
        if req.timestamp_start and res and res.timestamp_end:
            duration_ms = int((res.timestamp_end - req.timestamp_start) * 1000)

        # Extract request/response text only for likely LLM/API payloads.
        request_text = None
        if req:
            req_ct = req.headers.get("content-type", "").lower()
            if "application/json" in req_ct:
                request_text = self._safe_text(req)

        response_text = None
        content_type = None

        if res:
            content_type = res.headers.get("content-type", "")
            ct = content_type.lower()

            if any(
                marker in ct
                for marker in (
                    "application/json",
                    "text/event-stream",
                    "text/plain",
                )
            ):
                response_text = self._safe_text(res)

        usage = extract_token_usage(
            request_text=request_text,
            response_text=response_text,
            content_type=content_type,
        )

        try:
            await self.repo.save(
                observed_at=datetime.now(timezone.utc),
                method=req.method,
                scheme=req.scheme,
                host=req.pretty_host,
                port=int(req.port or 0),
                path=path,
                status=res.status_code if res else None,
                request_bytes=_get_length(req.raw_content, req.headers),
                response_bytes=_get_length(
                    res.raw_content if res else None,
                    res.headers if res else {},
                ),
                duration_ms=duration_ms,
                error=error,
                model=usage.model if usage else None,
                input_tokens=usage.input_tokens if usage else None,
                output_tokens=usage.output_tokens if usage else None,
                total_tokens=usage.total_tokens if usage else None,
                cache_creation_input_tokens=(
                    usage.cache_creation_input_tokens if usage else None
                ),
                cache_read_input_tokens=(
                    usage.cache_read_input_tokens if usage else None
                ),
                token_source=usage.source if usage else None,
                request_body=request_text,
                response_body=response_text,
                request_headers=self._headers(req),
                response_headers=self._headers(res) if res else None,
            )
        except Exception as e:
            logger.error(f"Failed to save metric: {e}")

    async def done(self):
        await self.repo.close()


# mitmproxy looks for an 'addons' list in the global scope.
addons = [ObservabilityAddon()]