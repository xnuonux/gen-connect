#!/usr/bin/env bash
# ship-discipline hook
# fires when claude code completes a turn
# soft-warns if typecheck or voice-check would fail
# does NOT block (exit 0) so dom can still work iteratively
# real blocking happens in pnpm ship before commit

# only run if pnpm + node_modules exist
if ! command -v pnpm >/dev/null 2>&1; then
  exit 0
fi

if [[ ! -d "node_modules" ]]; then
  exit 0
fi

# fast checks only ... no full test suite (would slow down iteration)
ISSUES=()

# em-dash sweep over src/ and docs/
if grep -rln '—' src/ docs/ 2>/dev/null | grep -v node_modules | grep -v .next | head -1 >/dev/null; then
  ISSUES+=("voice-keeper: em-dashes detected in source. run pnpm voice-check.")
fi

if (( ${#ISSUES[@]} > 0 )); then
  echo ""
  echo "ship-check warnings:"
  for issue in "${ISSUES[@]}"; do
    echo "  · $issue"
  done
  echo ""
fi

exit 0
