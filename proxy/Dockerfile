# proxy/Dockerfile
FROM python:3.11-slim

RUN pip install --no-cache-dir \
    mitmproxy \
    "psycopg[binary,pool]"

WORKDIR /app

COPY db.py tokens.py addon.py /app/

EXPOSE 8080

# Bodies must stay buffered for the token parser to see them: a streamed body is
# discarded entirely and can never be parsed. mitmproxy streams anything larger
# than this threshold; unset means "never stream". 10m matches MAX_TOKEN_PARSE_BYTES.
CMD ["mitmdump", "--listen-host", "0.0.0.0", "--listen-port", "8080", "-s", "/app/addon.py", "--set", "stream_large_bodies=10m"]