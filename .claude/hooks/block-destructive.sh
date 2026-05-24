#!/usr/bin/env bash
# block-destructive hook
# fires before any Bash tool call
# blocks destructive commands that could nuke the repo or database

INPUT="${CLAUDE_TOOL_INPUT:-}"

# patterns we never let through
DESTRUCTIVE_PATTERNS=(
  'rm -rf /'
  'rm -rf ~'
  'rm -rf \*'
  'rm -rf \.'
  ':\(\)\{ :\|: &\};:'
  'DROP TABLE'
  'DROP DATABASE'
  'DROP SCHEMA'
  'TRUNCATE TABLE'
  'mkfs\.'
  'dd if=/dev/zero'
  '> /dev/sda'
)

for pattern in "${DESTRUCTIVE_PATTERNS[@]}"; do
  if echo "$INPUT" | grep -qE "$pattern"; then
    echo "block-destructive: refused command matching pattern: $pattern"
    echo "if you need this, ask dom directly."
    exit 2
  fi
done

exit 0
