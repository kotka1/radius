# Radius

**Say the site. Watch it appear. Keep or undo.**

Radius is an everyday-user AI platform. v1 is a Visual Website Studio: you describe a website, watch agents build it on a live stage, and Keep / Undo / Tweak — no code, no file tree, no model picker.

## Brand

- **Product name:** Radius
- **Reserved alt:** Archibold (`archibold.ai`) — do not ship as primary brand; hold for possible redirect / secondary brand later
- **Logotype assets:** [`Logotype/`](Logotype/) — gold Fibonacci spiral mark + geometric RADIUS wordmark (light & dark)

## Design tokens

| Token | Value | Use |
|-------|--------|-----|
| `--radius-void` | `#050505` | Stage background |
| `--radius-ink` | `#0a0a0c` | Panels |
| `--radius-gold` | `#c9a54a` → `#e8d18a` | Mark, accents |
| `--radius-steel` | `#6b7a8f` | Dark-blue logotype chrome |
| `--radius-fog` | `#c8c8d0` | Secondary text |
| `--radius-snow` | `#f4f4f6` | Primary text |

Typography: geometric sans for UI (`Syne` display + `DM Sans` body). Avoid default Inter/system stacks.

## Run locally

```bash
export PATH="$HOME/.local/node/bin:$PATH"
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Env (optional — real agent loop)

Copy `.env.example` to `.env.local`:

- Without `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`, Radius uses a high-quality **mock generator** so the Visual Stage always works.
- With a key set, the planner → builder → critic orchestrator calls the API and streams HTML into the preview.

## Architecture (v1)

- **Client:** Next.js App Router — home ask → Visual Stage (agent feed + live iframe preview)
- **Agents:** `/api/generate` SSE — planner → builder → critic; speculative-style full HTML apply to preview
- **Context:** optional uploads (logo / brief / images) with priority packing into the prompt budget
- **Persist:** filesystem JSON projects under `data/projects/`, share at `/p/[id]`, export ZIP at `/api/projects/[id]/export`

## Product principles

1. Outcomes first — show the site, not the tokens
2. Watch agents work — plain English feed
3. Three actions: Keep, Undo, Tweak
4. Advanced power stays hidden until asked
