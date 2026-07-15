#!/usr/bin/env bash
# One-time: gh auth login
# Then run: bash scripts/create-pr.sh

set -euo pipefail
export PATH="$HOME/.local/bin:$HOME/.local/node/bin:$PATH"
cd "$(dirname "$0")/.."

# main on GitHub = first commit (PR carries the follow-up work)
git push origin 25e0c84:refs/heads/main

gh pr create \
  --base main \
  --head cursor/radius-v1-visual-studio \
  --title "Radius v1 — Visual Website Studio" \
  --body "$(cat <<'EOF'
## Summary
- Ship Radius v1: everyday-user Visual Website Studio (ask → agent feed → live preview → Keep/Undo/Tweak)
- Add Router (quality/speed/balanced) and Radius Spiral Spinner for magical-thinking UX
- Include brand assets, context engine, orchestrator, persistence, share links, and ZIP export

## Test plan
- [ ] `npm install && npm run dev` — home ask loads with Radius branding
- [ ] Build a site from a plain-English prompt — agents stream into live preview
- [ ] Keep / Undo / Tweak work on generated HTML
- [ ] Spiral spinner shows during routing and generation
- [ ] Share link `/p/[id]` and Export ZIP download correctly
EOF
)"
