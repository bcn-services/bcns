#!/bin/bash
# Blocks history-destroying git commands in Claude Code sessions.
# Normal `git push` is intentionally ALLOWED so the PR workflow keeps working;
# only force-pushes and destructive/discard operations are blocked.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command')

DANGEROUS_PATTERNS=(
  "push .*--force"
  "push .*-f( |$)"
  "reset --hard"
  "git clean -fd"
  "git clean -f"
  "git branch -D"
  "git checkout \."
  "git restore \."
)

for pattern in "${DANGEROUS_PATTERNS[@]}"; do
  if echo "$COMMAND" | grep -qE "$pattern"; then
    echo "BLOCKED: '$COMMAND' matches dangerous pattern '$pattern'. The user has prevented you from doing this." >&2
    exit 2
  fi
done

exit 0
