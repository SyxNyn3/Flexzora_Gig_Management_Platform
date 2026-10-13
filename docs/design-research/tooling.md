# Design Tooling Map

Where each tool/MCP fits in the Flexzora design workflow. Configured MCPs live in
`mcp_config.json` — they activate per-session after restart.

## Configured MCPs

| Server | What it gives | Best use in our workflow |
|---|---|---|
| **21st** | Registry of polished React components (shadcn-compatible) | Pull a proven component (stat card, kanban, timeline) instead of hand-rolling — then re-skin to our tokens. Pair with the component prompt in `prompt-library.md`. |
| **mobbin** | Real-product UI pattern library (screenshots + flows from shipping apps) | Paid product — replaced by the free alternatives below. Leave configured; ignore unless a paid plan ever makes sense. |
| **cloudflare-docs** | CF docs lookup | Edge/domain/analytics setup — not design, but in the same config. |
| **github-mcp-server** | Issues/PRs/CI | Design feedback as tracked issues; CI checks on UI PRs. |
| **n8n-mcp** | Automation | Later: auto-collect competitor screenshots on a schedule; funnel metrics to a dashboard. |
| **supabase-mcp-server** | Direct project data | Verify real data shapes while designing (what fields actually exist on a shift card). |

## Free Mobbin alternatives (UI pattern research — verified 2026-10)

| Tool | Cost | What it gives | Best use |
|---|---|---|---|
| **VP0** (vp0.com) | Free forever, no signup to browse | Real app designs with **AI-readable source pages** — copy a link, agent rebuilds the screen. `npx vp0com add <design>`. iOS-flavored but patterns translate | **Primary pick** — built for the copy-link-to-code workflow we already use. Dashboards, profiles, calendars, settings categories all covered |
| **UIguana** (uiguana.com) | 100% free | Real mobile app screens organized by complete user flows (onboarding → checkout) | Following whole flows end-to-end, not just single screens |
| **Banani references** (banani.co/references) | Free | 100+ real app UI screens, AI-editable | Quick single-screen reference + iterate on it |
| **Gummble** (gummble.com) | Free browse tier; from $9.99/mo | 300k+ real app screenshots, 21k+ flows, search by pattern type; MCP on paid plans | Closest to Mobbin's scale when free tiers elsewhere run dry — free tier first |
| **Lapa Ninja** (lapa.ninja) | Free | Landing-page gallery by category | Landing/marketing page reference specifically |
| **Page Flows** (pageflows.com) | Free tier | Recorded user-flow videos + screenshots | Watching flows in motion, not just statics |

Research rule stays the same: find the pattern → adapt to our tokens — never ship
screenshot aesthetics wholesale.

## External tools worth knowing (no integration needed yet)

| Tool | Use for |
|---|---|
| **v0.dev** | Generating full page drafts from the prompts in `prompt-library.md` — it outputs Tailwind+shadcn, same stack as ours |
| **Figma / Penpot** | Only if we need shareable mocks for investors/testers — otherwise skip design-tool round trips, design in code |
| **Mobbin (web)** | Manual browsing alternative if MCP lags |
| **PageSpeed / Lighthouse** | After redesigns — marketplaces live on mobile performance |

## Workflow pattern (when we do design)

```
1. RESEARCH   → this folder + VP0/UIguana/Gummble: what do shippers do for this pattern?
2. DRAFT      → 21st component or v0 draft, prompted via prompt-library.md
3. FIT        → adapt to our tokens + real Supabase field names
4. VERIFY     → local e2e against the real schema (skills exist for this)
5. SHIP       → PR → CI → Pages deploy
```

## Reuse rules

- Every new pattern we adopt gets a row added to `marketplace-patterns.md` with its source
- Every successful prompt gets committed back to `prompt-library.md` — the library compounds
- Component pulls from 21st must be re-tokened (`bg-card`, `text-zinc-*`, amber accent) — never ship registry defaults
