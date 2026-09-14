# proxy/tokens.py
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any, Optional


MAX_PARSE_BYTES = int(os.getenv("MAX_TOKEN_PARSE_BYTES", "10000000"))

# Disabled by default because it mutates OpenAI-compatible streaming requests.
# Enable if you need streaming token usage from OpenAI-compatible providers.
ENABLE_OPENAI_USAGE_INJECTION = os.getenv(
    "ENABLE_OPENAI_USAGE_INJECTION",
    "false",
).lower() in ("1", "true", "yes", "on")


@dataclass(frozen=True, slots=True)
class TokenUsage:
    model: Optional[str]
    input_tokens: Optional[int]
    output_tokens: Optional[int]
    total_tokens: Optional[int]
    # Anthropic prompt-caching breakdown. `input_tokens` on its own hides where
    # the bytes actually go: cache writes (creation) vs. cache hits (read) vs.
    # tokens that missed the cache entirely. Both are None for providers/paths
    # that don't report them, which is distinct from "zero".
    cache_creation_input_tokens: Optional[int]
    cache_read_input_tokens: Optional[int]
    source: Optional[str]


def _safe_json(text: Optional[str]) -> Any:
    if not text:
        return None

    try:
        return json.loads(text)
    except Exception:
        return None


def _int(value: Any) -> Optional[int]:
    if value is None:
        return None

    try:
        return int(value)
    except Exception:
        return None


def _limit_text(text: Optional[str]) -> str:
    """
    Avoid unbounded memory usage when parsing very large streaming bodies.

    For large payloads, keep the beginning and the end.

    Beginning often contains Anthropic message_start.input_tokens.
    End often contains final usage/message_delta.output_tokens.
    """
    if not text:
        return ""

    if len(text) <= MAX_PARSE_BYTES:
        return text

    half = MAX_PARSE_BYTES // 2
    return text[:half] + "\n" + text[-half:]


def _iter_sse_json(text: str):
    """
    Parse JSON objects from SSE lines like:

        data: {...}

    Used by Anthropic/OpenAI streaming responses.
    """
    for line in text.splitlines():
        line = line.strip()

        if not line.startswith("data:"):
            continue

        payload = line[5:].strip()

        if payload == "[DONE]":
            continue

        obj = _safe_json(payload)
        if obj is not None:
            yield obj


@dataclass(frozen=True, slots=True)
class _UsageFields:
    input_tokens: Optional[int]
    output_tokens: Optional[int]
    total_tokens: Optional[int]
    cache_creation_input_tokens: Optional[int]
    cache_read_input_tokens: Optional[int]


def _usage_tuple_from_dict(obj: Any) -> Optional[_UsageFields]:
    """
    Supports:

    Anthropic:
      usage.input_tokens
      usage.output_tokens
      usage.cache_creation_input_tokens  (tokens written to the prompt cache)
      usage.cache_read_input_tokens      (tokens served from the prompt cache)

    OpenAI:
      usage.prompt_tokens
      usage.completion_tokens
      usage.total_tokens
      usage.prompt_tokens_details.cached_tokens (mapped to cache_read, the
        closest analog: tokens served from OpenAI's own prompt cache)
    """
    if not isinstance(obj, dict):
        return None

    usage = obj.get("usage")
    if not isinstance(usage, dict):
        return None

    input_tokens = _int(usage.get("input_tokens"))
    if input_tokens is None:
        input_tokens = _int(usage.get("prompt_tokens"))

    output_tokens = _int(usage.get("output_tokens"))
    if output_tokens is None:
        output_tokens = _int(usage.get("completion_tokens"))

    total_tokens = _int(usage.get("total_tokens"))

    if total_tokens is None and (input_tokens is not None or output_tokens is not None):
        total_tokens = (input_tokens or 0) + (output_tokens or 0)

    cache_creation_input_tokens = _int(usage.get("cache_creation_input_tokens"))
    cache_read_input_tokens = _int(usage.get("cache_read_input_tokens"))

    if cache_read_input_tokens is None:
        prompt_details = usage.get("prompt_tokens_details")
        if isinstance(prompt_details, dict):
            cache_read_input_tokens = _int(prompt_details.get("cached_tokens"))

    if (
        input_tokens is None
        and output_tokens is None
        and total_tokens is None
        and cache_creation_input_tokens is None
        and cache_read_input_tokens is None
    ):
        return None

    return _UsageFields(
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        total_tokens=total_tokens,
        cache_creation_input_tokens=cache_creation_input_tokens,
        cache_read_input_tokens=cache_read_input_tokens,
    )


def _extract_non_stream(obj: Any) -> Optional[TokenUsage]:
    """
    Extract token usage from normal JSON responses.
    """
    if not isinstance(obj, dict):
        return None

    model = obj.get("model") if isinstance(obj.get("model"), str) else None

    usage = _usage_tuple_from_dict(obj)
    if usage:
        return TokenUsage(
            model=model,
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
            total_tokens=usage.total_tokens,
            cache_creation_input_tokens=usage.cache_creation_input_tokens,
            cache_read_input_tokens=usage.cache_read_input_tokens,
            source="response_usage",
        )

    # Some providers wrap the message object.
    message = obj.get("message")
    if isinstance(message, dict):
        if not model and isinstance(message.get("model"), str):
            model = message.get("model")

        usage = _usage_tuple_from_dict(message)
        if usage:
            return TokenUsage(
                model=model,
                input_tokens=usage.input_tokens,
                output_tokens=usage.output_tokens,
                total_tokens=usage.total_tokens,
                cache_creation_input_tokens=usage.cache_creation_input_tokens,
                cache_read_input_tokens=usage.cache_read_input_tokens,
                source="response_usage",
            )

    return None


def _extract_sse(text: str) -> Optional[TokenUsage]:
    """
    Extract token usage from streaming responses.

    Anthropic streaming:
      message_start.message.usage.input_tokens
      message_start.message.usage.cache_creation_input_tokens
      message_start.message.usage.cache_read_input_tokens
      message_delta.usage.output_tokens

    OpenAI streaming:
      final chunk usage.prompt_tokens
      final chunk usage.completion_tokens
    """
    input_tokens: Optional[int] = None
    output_tokens: Optional[int] = None
    total_tokens: Optional[int] = None
    cache_creation_input_tokens: Optional[int] = None
    cache_read_input_tokens: Optional[int] = None
    model: Optional[str] = None
    found = False

    for obj in _iter_sse_json(text):
        if not isinstance(obj, dict):
            continue

        if isinstance(obj.get("model"), str):
            model = obj.get("model")

        obj_type = obj.get("type")

        # Anthropic streaming start. This is the only event carrying the
        # cache-creation/cache-read split — message_delta only ever reports
        # cumulative output_tokens.
        if obj_type == "message_start":
            message = obj.get("message")
            if isinstance(message, dict):
                if isinstance(message.get("model"), str):
                    model = message.get("model")

                usage = message.get("usage")
                if isinstance(usage, dict):
                    it = _int(usage.get("input_tokens"))
                    ot = _int(usage.get("output_tokens"))
                    cc = _int(usage.get("cache_creation_input_tokens"))
                    cr = _int(usage.get("cache_read_input_tokens"))

                    if it is not None:
                        input_tokens = it
                        found = True

                    if ot is not None:
                        output_tokens = (
                            ot
                            if output_tokens is None
                            else max(output_tokens, ot)
                        )
                        found = True

                    if cc is not None:
                        cache_creation_input_tokens = cc
                        found = True

                    if cr is not None:
                        cache_read_input_tokens = cr
                        found = True

        # Anthropic streaming delta/final usage.
        elif obj_type == "message_delta":
            usage = obj.get("usage")
            if isinstance(usage, dict):
                it = _int(usage.get("input_tokens"))
                ot = _int(usage.get("output_tokens"))

                if it is not None:
                    input_tokens = it
                    found = True

                if ot is not None:
                    output_tokens = (
                        ot
                        if output_tokens is None
                        else max(output_tokens, ot)
                    )
                    found = True

        # OpenAI / generic streaming chunk usage.
        chunk_usage = _usage_tuple_from_dict(obj)
        if chunk_usage:
            if chunk_usage.input_tokens is not None:
                input_tokens = chunk_usage.input_tokens

            if chunk_usage.output_tokens is not None:
                output_tokens = (
                    chunk_usage.output_tokens
                    if output_tokens is None
                    else max(output_tokens, chunk_usage.output_tokens)
                )

            if chunk_usage.total_tokens is not None:
                total_tokens = chunk_usage.total_tokens

            if chunk_usage.cache_read_input_tokens is not None:
                cache_read_input_tokens = chunk_usage.cache_read_input_tokens

            found = True

    if not found:
        return None

    if total_tokens is None and (input_tokens is not None or output_tokens is not None):
        total_tokens = (input_tokens or 0) + (output_tokens or 0)

    return TokenUsage(
        model=model,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        total_tokens=total_tokens,
        cache_creation_input_tokens=cache_creation_input_tokens,
        cache_read_input_tokens=cache_read_input_tokens,
        source="sse_usage",
    )


def extract_token_usage(
    request_text: Optional[str],
    response_text: Optional[str],
    content_type: Optional[str],
) -> Optional[TokenUsage]:
    """
    Main entrypoint used by the mitmproxy addon.
    """
    request_obj = _safe_json(request_text)

    request_model = (
        request_obj.get("model")
        if isinstance(request_obj, dict)
        and isinstance(request_obj.get("model"), str)
        else None
    )

    if not response_text:
        return None

    text = _limit_text(response_text)
    ct = (content_type or "").lower()

    usage: Optional[TokenUsage] = None

    if "text/event-stream" in ct:
        usage = _extract_sse(text)

    elif "application/json" in ct:
        usage = _extract_non_stream(_safe_json(text))

    else:
        # Some providers return JSON with non-standard content types.
        usage = _extract_non_stream(_safe_json(text))

        if usage is None:
            usage = _extract_sse(text)

    # Prefer model from response if available.
    # If response did not include model, fallback to request model.
    if usage is not None and request_model and not usage.model:
        usage = TokenUsage(
            model=request_model,
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
            total_tokens=usage.total_tokens,
            cache_creation_input_tokens=usage.cache_creation_input_tokens,
            cache_read_input_tokens=usage.cache_read_input_tokens,
            source=usage.source,
        )

    return usage


def maybe_inject_openai_stream_usage(flow) -> None:
    """
    Optional best-effort mutation for OpenAI-compatible streaming APIs.

    OpenAI streaming usually returns usage only if the request contains:

        "stream_options": {
            "include_usage": true
        }

    This is disabled by default because it changes the outgoing request.
    Enable it only if your provider supports it.
    """
    if not ENABLE_OPENAI_USAGE_INJECTION:
        return

    try:
        req = flow.request

        ct = req.headers.get("content-type", "").lower()
        if "application/json" not in ct:
            return

        if "/chat/completions" not in req.path:
            return

        text = req.get_text(strict=False)
        obj = _safe_json(text)

        if not isinstance(obj, dict):
            return

        if obj.get("stream") is not True:
            return

        stream_options = obj.get("stream_options")
        if not isinstance(stream_options, dict):
            stream_options = {}

        if stream_options.get("include_usage") is True:
            return

        stream_options["include_usage"] = True
        obj["stream_options"] = stream_options

        req.text = json.dumps(obj)

    except Exception:
        # Observability must not break the main request.
        pass