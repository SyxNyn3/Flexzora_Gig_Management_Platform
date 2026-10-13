# Design Tooling Map

Where each tool/MCP fits in the Flexzora design workflow. Configured MCPs live in
`mcp_config.json` — they activate per-session after restart.

## Configured MCPs

| Server | What it gives | Best use in our workflow |
|---|---|---|
| **21st** | Registry of polished React components (shadcn-compatible) | Pull a proven component (stat card, kanban, timeline) instead of hand-rolling — then re-skin to our tokens. Pair with the component prompt in `prompt-library.md`. |
| **mobbin** | Real-product UI pattern library (screenshots + flows from shipping apps) | "How do real staffing/dispatch apps handle X?" — check booking flows, rating UX, empty states before we invent our own. |
| **cloudflare-docs** | CF docs lookup | Edge/domain/analytics setup — not design, but in the same config. |
| **github-mcp-server** | Issues/PRs/CI | Design feedback as tracked issues; CI checks on UI PRs. |
| **n8n-mcp** | Automation | Later: auto-collect competitor screenshots on a schedule; funnel metrics to a dashboard. |
| **supabase-mcp-server** | Direct project data | Verify real data shapes while designing (what fields actually exist on a shift card). |

## External tools worth knowing (no integration needed yet)

| Tool | Use for |
|---|---|
| **v0.dev** | Generating full page drafts from the prompts in `prompt-library.md` — it outputs Tailwind+shadcn, same stack as ours |
| **Figma / Penpot** | Only if we need shareable mocks for investors/testers — otherwise skip design-tool round trips, design in code |
| **Mobbin (web)** | Manual browsing alternative if MCP lags |
| **PageSpeed / Lighthouse** | After redesigns — marketplaces live on mobile performance |

## Workflow pattern (when we do design)

```
1. RESEARCH   → this folder + mobbin MCP: what do shippers do for this pattern?
2. DRAFT      → 21st component or v0 draft, prompted via prompt-library.md
3. FIT        → adapt to our tokens + real Supabase field names
4. VERIFY     → local e2e against the real schema (skills exist for this)
5. SHIP       → PR → CI → Pages deploy
```

## Reuse rules

- Every new pattern we adopt gets a row added to `marketplace-patterns.md` with its source
- Every successful prompt gets committed back to `prompt-library.md` — the library compounds
- Component pulls from 21st must be re-tokened (`bg-card`, `text-zinc-*`, amber accent) — never ship registry defaults
