#!/usr/bin/env bash

set -euo pipefail

if [[ "$#" -ne 2 ]]; then
  echo "usage: github-api-read-optional.sh <endpoint> <output-json>" >&2
  exit 2
fi

endpoint="$1"
output_path="$2"
api_url="${GITHUB_API_URL:-https://api.github.com}"

if [[ -z "${GITHUB_TOKEN:-}" ]]; then
  echo "GitHub API token is required" >&2
  exit 2
fi
if [[ -z "$endpoint" || "$endpoint" == /* || "$endpoint" == *$'\n'* || "$endpoint" == *$'\r'* ]]; then
  echo "GitHub API endpoint is invalid" >&2
  exit 2
fi
if [[ "$api_url" != https://* ]]; then
  if [[ "${STEPHEN_ALLOW_INSECURE_API_URL:-0}" != "1" || "$api_url" != http://127.0.0.1:* ]]; then
    echo "GitHub API URL must use HTTPS" >&2
    exit 2
  fi
fi

api_url="${api_url%/}"
set +e
http_status=$(curl \
  --silent \
  --show-error \
  --connect-timeout 15 \
  --max-time 60 \
  --request GET \
  --header "Accept: application/vnd.github+json" \
  --header "Authorization: Bearer $GITHUB_TOKEN" \
  --header "X-GitHub-Api-Version: 2022-11-28" \
  --output "$output_path" \
  --write-out '%{http_code}' \
  "$api_url/$endpoint")
curl_status=$?
set -e

if [[ "$curl_status" -ne 0 ]]; then
  echo "GitHub API transport failed closed (curl exit $curl_status)" >&2
  exit "$curl_status"
fi

case "$http_status" in
  200)
    if ! jq -e '
      type == "object"
      and (.ref | type == "string" and startswith("refs/"))
      and (.object | type == "object")
      and (.object.type | type == "string" and length > 0)
      and (.object.sha | type == "string" and test("^[0-9a-f]{40}$"))
    ' "$output_path" >/dev/null 2>&1; then
      echo "GitHub API success payload failed closed" >&2
      exit 1
    fi
    ;;
  404)
    printf 'null\n' > "$output_path"
    ;;
  *)
    echo "GitHub API GET failed closed (HTTP $http_status)" >&2
    exit 1
    ;;
esac
