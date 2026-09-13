# proxy/Dockerfile
FROM python:3.11-slim

RUN pip install --no-cache-dir \
    mitmproxy \
    "psycopg[binary,pool]"

WORKDIR /app

COPY db.py tokens.py addon.py /app/

EXPOSE 8080

# stream_large_bodies=0 keeps bodies available for token parsing.
# If your mitmproxy version complains about this option, remove that --set flag.
CMD ["mitmdump", "--listen-host", "0.0.0.0", "--listen-port", "8080", "-s", "/app/addon.py", "--set", "stream_large_bodies=0"]