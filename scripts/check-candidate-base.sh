#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -ne 1 ]]; then
  echo "usage: check-candidate-base.sh <fetched-base-ref>" >&2
  exit 1
fi

# Inspect the fetched base, not the current same-day candidate working tree.
# Keep the assignment separate so a failed Git read cannot mean a clean base.
candidate_paths=$(git ls-tree -r --name-only "$1" -- review-candidates)
if [[ -n "$candidate_paths" ]]; then
  echo "target base contains unapproved review candidates; stop before collecting or writing candidates" >&2
  echo "preserve edited drafts and restore a candidate-free base through a reviewed cleanup; see docs/daily-editorial-runbook.md" >&2
  exit 1
fi
