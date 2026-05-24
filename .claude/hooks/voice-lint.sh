#!/usr/bin/env bash
# voice-keeper hook
# fires after every Write|Edit|MultiEdit
# blocks em-dashes (—) in source files ... use "..." for pauses
# exits 2 to block the change if em-dash detected

FILE="${1:-${CLAUDE_TOOL_INPUT_FILE_PATH:-}}"

# nothing to check if path is empty
if [[ -z "$FILE" ]]; then
  exit 0
fi

# skip files outside the repo, lockfiles, or binary blobs
case "$FILE" in
  *.lock|*.lockb|*.png|*.jpg|*.jpeg|*.gif|*.webp|*.ico|*.zip|*.gz|*node_modules*|*.next*)
    exit 0
    ;;
esac

# only lint code, docs, config
case "$FILE" in
  *.ts|*.tsx|*.js|*.jsx|*.md|*.mdx|*.json|*.css|*.sh)
    ;;
  *)
    exit 0
    ;;
esac

# bail if file doesn't exist (could have been deleted)
[[ -f "$FILE" ]] || exit 0

# search for em-dash
if grep -q '—' "$FILE"; then
  echo "voice-keeper: em-dash detected in $FILE"
  echo "rule: lunari voice forbids em-dashes. use '...' for pauses."
  echo ""
  grep -n '—' "$FILE" | head -5
  exit 2
fi

exit 0
