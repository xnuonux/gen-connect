#!/usr/bin/env bash
# voice-check ... fails ci if the em-dash unicode character is detected in source.
# lunari voice rule: never that character. use "..." for pauses.
# uses the unicode codepoint directly so this script itself stays clean.
#
# file enumeration runs through `git ls-files` ... fast, deterministic, and it
# respects .gitignore so node_modules / .next / .env never get scanned. the old
# `find` walk hung on windows because bare `find` resolved to the system find.

set -e

DASH=$(printf '\xe2\x80\x94')   # the forbidden character, computed not embedded

FOUND=0
EXT_RE='\.(ts|tsx|js|jsx|md|mdx|json|css|sh)$'

# tracked + untracked-but-not-ignored, scoped to source dirs + root docs.
FILES=$(git ls-files --cached --others --exclude-standard \
  -- src docs .claude scripts CLAUDE.md AGENTS.md README.md 2>/dev/null || true)

while IFS= read -r file; do
  [[ -z "$file" ]] && continue
  [[ "$file" =~ $EXT_RE ]] || continue
  [[ -f "$file" ]] || continue
  # skip the files that document the character on purpose.
  case "$file" in
    scripts/check-em-dash.sh|.claude/hooks/voice-lint.sh|.claude/hooks/ship-check.sh|*voice-keeper/SKILL.md)
      continue
      ;;
  esac
  if grep -q "$DASH" "$file" 2>/dev/null; then
    echo "em-dash found in: $file"
    grep -n "$DASH" "$file" | head -3 | sed 's/^/  /'
    FOUND=1
  fi
done <<< "$FILES"

if (( FOUND == 1 )); then
  echo ""
  echo "voice-check failed. lunari rule: no forbidden dash character. use \"...\" for pauses."
  exit 1
fi

echo "voice-check passed."
exit 0
