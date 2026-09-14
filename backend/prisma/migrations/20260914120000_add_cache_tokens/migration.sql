ALTER TABLE "http_metrics"
ADD COLUMN IF NOT EXISTS "cache_creation_input_tokens" INTEGER,
ADD COLUMN IF NOT EXISTS "cache_read_input_tokens" INTEGER;
