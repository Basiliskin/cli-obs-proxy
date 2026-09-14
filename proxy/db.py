# proxy/db.py
from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime
from typing import Optional

from psycopg_pool import AsyncConnectionPool
from psycopg.types.json import Jsonb

logger = logging.getLogger(__name__)


CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS http_metrics (
    id BIGSERIAL PRIMARY KEY,
    observed_at TIMESTAMPTZ NOT NULL,
    method TEXT NOT NULL,
    scheme TEXT NOT NULL,
    host TEXT NOT NULL,
    port INTEGER NOT NULL,
    path TEXT NOT NULL,
    status INTEGER,
    request_bytes INTEGER NOT NULL,
    response_bytes INTEGER NOT NULL,
    duration_ms INTEGER,
    error TEXT,

    model TEXT,
    input_tokens INTEGER,
    output_tokens INTEGER,
    total_tokens INTEGER,
    token_source TEXT,
    request_body TEXT,
    response_body TEXT,
    request_headers JSONB,
    response_headers JSONB
);
"""

CREATE_OBSERVED_AT_INDEX = """
CREATE INDEX IF NOT EXISTS idx_metrics_observed_at
    ON http_metrics (observed_at);
"""

CREATE_HOST_INDEX = """
CREATE INDEX IF NOT EXISTS idx_metrics_host
    ON http_metrics (host);
"""

CREATE_MODEL_INDEX = """
CREATE INDEX IF NOT EXISTS idx_metrics_model
    ON http_metrics (model);
"""

MIGRATIONS = [
    "ALTER TABLE http_metrics ADD COLUMN IF NOT EXISTS model TEXT",
    "ALTER TABLE http_metrics ADD COLUMN IF NOT EXISTS input_tokens INTEGER",
    "ALTER TABLE http_metrics ADD COLUMN IF NOT EXISTS output_tokens INTEGER",
    "ALTER TABLE http_metrics ADD COLUMN IF NOT EXISTS total_tokens INTEGER",
    "ALTER TABLE http_metrics ADD COLUMN IF NOT EXISTS token_source TEXT",
    "ALTER TABLE http_metrics ADD COLUMN IF NOT EXISTS request_body TEXT",
    "ALTER TABLE http_metrics ADD COLUMN IF NOT EXISTS response_body TEXT",
    "ALTER TABLE http_metrics ADD COLUMN IF NOT EXISTS request_headers JSONB",
    "ALTER TABLE http_metrics ADD COLUMN IF NOT EXISTS response_headers JSONB",
]


class MetricRepository:
    def __init__(self):
        dsn = os.getenv(
            "DATABASE_URL",
            "postgresql://cliobs:cliobs@postgres:5432/cliobs",
        )

        self.pool = AsyncConnectionPool(
            dsn,
            min_size=1,
            max_size=5,
            open=False,
        )

    async def initialize(self) -> None:
        """
        Wait for PostgreSQL and ensure schema exists.
        """
        last_error: Exception | None = None

        statements = [
            CREATE_TABLE,
            CREATE_OBSERVED_AT_INDEX,
            CREATE_HOST_INDEX,
            CREATE_MODEL_INDEX,
            *MIGRATIONS,
        ]

        for attempt in range(30):
            try:
                await self.pool.open()

                async with self.pool.connection() as conn:
                    for statement in statements:
                        await conn.execute(statement)

                logger.info("Database connected and schema ensured.")
                return

            except Exception as exc:
                last_error = exc
                logger.warning(
                    "Database not ready yet, retrying... attempt=%s error=%s",
                    attempt + 1,
                    exc,
                )
                await asyncio.sleep(1)

        raise RuntimeError("PostgreSQL is not ready") from last_error

    async def save(
        self,
        observed_at: datetime,
        method: str,
        scheme: str,
        host: str,
        port: int,
        path: str,
        status: Optional[int],
        request_bytes: int,
        response_bytes: int,
        duration_ms: Optional[int],
        error: Optional[str],
        model: Optional[str] = None,
        input_tokens: Optional[int] = None,
        output_tokens: Optional[int] = None,
        total_tokens: Optional[int] = None,
        token_source: Optional[str] = None,
        request_body: Optional[str] = None,
        response_body: Optional[str] = None,
        request_headers: Optional[dict[str, str]] = None,
        response_headers: Optional[dict[str, str]] = None,
    ) -> None:
        query = """
            INSERT INTO http_metrics (
                observed_at,
                method,
                scheme,
                host,
                port,
                path,
                status,
                request_bytes,
                response_bytes,
                duration_ms,
                error,
                model,
                input_tokens,
                output_tokens,
                total_tokens,
                token_source,
                request_body,
                response_body,
                request_headers,
                response_headers
            )
            VALUES (
                %s,
                %s,
                %s,
                %s,
                %s,
                %s,
                %s,
                %s,
                %s,
                %s,
                %s,
                %s,
                %s,
                %s,
                %s,
                %s,
                %s,
                %s,
                %s,
                %s
            )
        """

        async with self.pool.connection() as conn:
            await conn.execute(
                query,
                (
                    observed_at,
                    method,
                    scheme,
                    host,
                    port,
                    path,
                    status,
                    request_bytes,
                    response_bytes,
                    duration_ms,
                    error,
                    model,
                    input_tokens,
                    output_tokens,
                    total_tokens,
                    token_source,
                    request_body,
                    response_body,
                    Jsonb(request_headers) if request_headers is not None else None,
                    Jsonb(response_headers) if response_headers is not None else None,
                ),
            )

            history_limit = max(int(os.getenv("CALL_HISTORY_LIMIT", "50")), 0)
            await conn.execute(
                """
                UPDATE http_metrics
                SET request_body = NULL,
                    response_body = NULL,
                    request_headers = NULL,
                    response_headers = NULL
                WHERE id NOT IN (
                    SELECT id FROM http_metrics
                    ORDER BY observed_at DESC, id DESC
                    LIMIT %s
                )
                """,
                (history_limit,),
            )

    async def close(self) -> None:
        await self.pool.close()