1. docker compose up -d --build (docker compose down)
2. Copy the cert out of the running proxy container:

```
docker compose cp proxy:/root/.mitmproxy/mitmproxy-ca-cert.pem ./mitmproxy-ca-cert.pem
```

The cert lives in the `mitmproxy_certs` volume, mounted at `/root/.mitmproxy` — root's
home directory, since the image runs as root. (`docker compose cp` needs the proxy
container to be running.)

3. Add it to your macOS Keychain and trust it:

```
security add-trusted-cert -d -r trustRoot -k ~/Library/Keychains/login.keychain-db ~/workspace/cli-obs-proxy/mitmproxy-ca-cert.pem
```

4. add to ~/.zshrc

```
# --- LLM observability wrapper ---
# Usage:
#   llmobs claude -p "hello"
#   llmobs -- claude --some-flag
#   llmobs curl https://api.anthropic.com
#
# Only the wrapped command receives proxy environment variables.
llmobs() {
  if [[ "${1-}" == "--" ]]; then
    shift
  fi

  if (( $# == 0 )); then
    echo "Usage: llmobs [--] command [args...]" >&2
    return 2
  fi

  local proxy="http://127.0.0.1:8080"
  local ca="$HOME/workspace/cli-obs-proxy/mitmproxy-ca-cert.pem"

  if [[ ! -f "$ca" ]]; then
    echo "llmobs: missing MITM CA certificate: $ca" >&2
    echo "Re-run the certificate extraction step from the Docker proxy setup." >&2
    return 1
  fi

  if command -v nc >/dev/null 2>&1 && ! nc -z 127.0.0.1 8080 >/dev/null 2>&1; then
    echo "llmobs: proxy is not listening on 127.0.0.1:8080" >&2
    echo "Start it with: cd ~/workspace/cli-obs-proxy && docker compose up -d" >&2
    return 1
  fi

  (
    export HTTP_PROXY="$proxy"
    export HTTPS_PROXY="$proxy"
    export ALL_PROXY="$proxy"
    export http_proxy="$proxy"
    export https_proxy="$proxy"
    export all_proxy="$proxy"

    export NO_PROXY="localhost,127.0.0.1,::1,.local"
    export no_proxy="localhost,127.0.0.1,::1,.local"

    # Required for many Node.js CLIs, including Claude Code if it uses Node TLS.
    export NODE_EXTRA_CA_CERTS="$ca"

    # Optional:
    # Some Python/OpenSSL tools do not use macOS keychain.
    # Use only when needed:
    #
    #   LLMOBS_INJECT_CA_ENV=1 llmobs some-python-tool
    #
    if [[ "${LLMOBS_INJECT_CA_ENV:-0}" == "1" ]]; then
      export SSL_CERT_FILE="$ca"
      export REQUESTS_CA_BUNDLE="$ca"
      export CURL_CA_BUNDLE="$ca"
    fi

    "$@"
  )
}

# Optional convenience aliases.
alias llmobs-up='docker compose -f "$HOME/workspace/cli-obs-proxy/docker-compose.yml" up -d'
alias llmobs-logs='docker compose -f "$HOME/workspace/cli-obs-proxy/docker-compose.yml" logs -f proxy'
alias claudeobs='llmobs claude'
# --- end LLM observability wrapper ---

```

source ~/.zshrc

5. Querying the Metrics

```
docker compose exec postgres psql -U cliobs -d cliobs

SELECT
    observed_at,
    host,
    model,
    status,
    input_tokens,
    output_tokens,
    total_tokens,
    token_source
FROM http_metrics
ORDER BY observed_at DESC
LIMIT 20;


SELECT
    host,
    COUNT(*) AS requests,
    SUM(input_tokens) AS input_tokens,
    SUM(output_tokens) AS output_tokens,
    SUM(total_tokens) AS total_tokens
FROM http_metrics
GROUP BY host
ORDER BY total_tokens DESC NULLS LAST;

SELECT
    model,
    COUNT(*) AS requests,
    SUM(input_tokens) AS input_tokens,
    SUM(output_tokens) AS output_tokens,
    SUM(total_tokens) AS total_tokens
FROM http_metrics
WHERE model IS NOT NULL
GROUP BY model
ORDER BY total_tokens DESC NULLS LAST;

SELECT
    date_trunc('hour', observed_at) AS hour,
    host,
    model,
    SUM(input_tokens) AS input_tokens,
    SUM(output_tokens) AS output_tokens,
    SUM(total_tokens) AS total_tokens
FROM http_metrics
WHERE input_tokens IS NOT NULL
   OR output_tokens IS NOT NULL
GROUP BY hour, host, model
ORDER BY hour DESC;


SELECT
    observed_at,
    host,
    path,
    status,
    token_source,
    error
FROM http_metrics
WHERE input_tokens IS NULL
  AND output_tokens IS NULL
ORDER BY observed_at DESC
LIMIT 50;

```
