ALTER TABLE "http_metrics"
ADD COLUMN IF NOT EXISTS "request_body" TEXT,
ADD COLUMN IF NOT EXISTS "response_body" TEXT,
ADD COLUMN IF NOT EXISTS "request_headers" JSONB,
ADD COLUMN IF NOT EXISTS "response_headers" JSONB;
