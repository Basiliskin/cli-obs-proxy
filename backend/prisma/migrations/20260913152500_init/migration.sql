-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "http_metrics" (
    "id" BIGSERIAL NOT NULL,
    "observed_at" TIMESTAMPTZ NOT NULL,
    "method" TEXT NOT NULL,
    "scheme" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "path" TEXT NOT NULL,
    "status" INTEGER,
    "request_bytes" INTEGER NOT NULL,
    "response_bytes" INTEGER NOT NULL,
    "duration_ms" INTEGER,
    "error" TEXT,
    "model" TEXT,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "total_tokens" INTEGER,
    "token_source" TEXT,
    "request_body" TEXT,
    "response_body" TEXT,
    "request_headers" JSONB,
    "response_headers" JSONB,

    CONSTRAINT "http_metrics_pkey" PRIMARY KEY ("id")
);
