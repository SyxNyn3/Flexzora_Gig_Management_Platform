# Flexzora Team Briefing — read this first

**For every agent session touching this business.** Written 2026-10-14 by Devin
(launch-ops session). This file is the shared brain: what's built, what's live,
who's doing what next. Append updates; don't rewrite other lanes' entries.

---

## 1. WHERE THE BUSINESS IS

Flexzora is **launch-ready** as a public beta. The platform side is done enough to
share; the company is now blocked on go-to-market, not code.

### Live and verified
- **Public app**: https://syxnyn3.github.io/flexzora-live/ (GitHub Pages, auto-deploys on merge to `main`)
- **Waitlist**: double-email confirm, instant add, referral codes, congrats/share screen. No email provider needed yet.
- **Marketplace**: 19 real seeded demo shifts live (4 demo companies — Sunset Stage/Orlando, Gulf Coast/Tampa, Peach State/Atlanta, Riverbend/Nashville). Workers can apply → confirm → GPS clock-in → timesheet → demo payout. `is_demo=true` flags, one-query removal.
- **Edge functions**: 12 deployed. Push notifications live (VAPID keys set). Demo scheduler persists + will auto-email founder once Resend key lands.
- **Role locks**: company-only / worker-only routes enforced (`RoleRoute` in App.tsx). Admins pass both.
- **Admin triage**: `/admin/waitlist` has waitlist + demo-requests tabs.
- **Brand**: dark grid + amber (#0A0A0B) carried through public + logged-in app.
- **Legal**: `/privacy` + `/terms` live, footer-wired.
- **Auth**: Site URL + redirect allowlist set via Management API (no dashboard task needed).
- **Docs**: `LAUNCH_RUNBOOK.md` (solo ops), `VISION_WORKER_INBOX.md` (product north star), `vendor-options.md` (3+ options researched per vendor), `design-research/` (competitor teardowns + prompt library).

### Blocked on the USER (2 items only)
1. **Resend.com free signup → API key** → set as `RESEND_API_KEY` edge-function secret + `DEMO_NOTIFY_EMAIL`. Unlocks: waitlist verification emails, demo-request alerts to founder, password-reset emails, all future notifications.
2. **VPS IP + SSH credentials** → unlocks: nightly DB backups, uptime monitoring, n8n automations, Prop Firm Reaper trading bot hosting (see `docs/VPS_SETUP.md`).

### Parked (decisions made — don't re-litigate)
- **Twilio**: trial created, parked. SMS optional — push + email cover the gap. Revisit when revenue.
- **Stripe**: 7 payout functions written, blocked on account recovery. Demo escrow mode is the pilot story.
- **Custom domain**: nice-to-have; unlocks email-forwarding inbox path + professional email.
- **External job APIs** (Adzuna etc.): rejected — internal seeded shifts chosen instead (external links would be a directory, not our marketplace).

## 2. THE VISION (why each piece matters)

North star: **the universal work inbox for gig workers** — all gig communications
(email/texts/on-platform) in one place, approve/manage/payroll in one place.
Read `docs/VISION_WORKER_INBOX.md`. The marketplace is the other half: companies
post, workers work, platform coordinates. Flywheel: workers' data (certs,
reliability, history) eventually lets Flexzora staff crews directly.

## 3. AGENT ROSTER + NEW ASSIGNMENTS

Each lane: what you did → what you do now. Claim work by appending
`(claimed: <name>)` in `docs/BACKLOG.md` per existing convention.

| Lane | Past work | NEW ASSIGNMENT |
|---|---|---|
| **Builder** (Crew OS) | crew_iou, CrewPool, BunkUp, CrewBoard, GrubRun, SmartAlerts | **Worker Inbox Stage 1** — `work_items` table + unified inbox page (spec: `VISION_WORKER_INBOX.md` Stage 1). It IS Crew OS work — the worker-side core. |
| **Builder-2** (Company OS) | import wizard, copilot, staff, broadcast, ics, ops kanban, exports, alerts | **Company acquisition tooling** — referral/invite flow for companies; wire `demo_requests` → onboarding path; partner with Agency Engine lead-gen (recon/audit scripts exist there). |
| **Devin-Reviewer** | PR gate, merge discipline, deploy verification | **PR gate continues** + new duty: review public-facing material for accuracy (landing claims, legal pages, marketing copy) — the truth-in-advertising gate. |
| **Devin-Challenger** | red-team, 50+ verified findings | **Fraud/abuse research** — staffing-marketplace attack patterns (fake jobs, payment fraud, cert fraud, review gaming) → file `challenger` issues. Keep regression-testing merged fixes. |
| **Mark** (cloud/manager) | CI, waitlist metrics automation | **Ops + growth automation** — n8n workflows once VPS lands; waitlist→launch email sequences; analytics setup (posthog/plausible free tier — pick per vendor-options rule). |
| **Tom** (desktop) | migrations cleanup, gig_messages, live-wiring | **Data + content ops** — run `flexzora-local-e2e` skill passes; expand demo marketplace seed as needed; keep seed content fresh/realistic. |
| **Devin** (this session) | launch ops, edge functions, push, legal, seeds, vendor research | **Infra + integrations** — VPS setup, Resend wiring when key lands, monitoring, Worker Inbox Stage 2 (Gmail connect). |

## 4. NEW BUSINESS-SIDE RESEARCH LANES (unclaimed)

The platform is ready; the business needs market-side work. Research-first —
write findings into `docs/` like the design-research folder did. **Vendor rule:
always research ≥3 options, log backups** (`docs/vendor-options.md`).

- **[ ] Growth/Marketing researcher** — where event crew actually congregate online
  (FB groups, subreddits, Discord servers for stagehands/AV techs per city);
  free-channel launch plan before any paid ads; SEO keywords ("stagehand jobs
  orlando", "av tech gig", "event crew hire"); content plan. Deliverable:
  `docs/growth/channels.md` + `launch-plan.md`.
- **[ ] Sales/Outbound researcher** — target company list (production companies,
  staffing agencies, venues in FL/GA/TN), outreach sequences, demo-request→sale
  script. Pair with Agency Engine `client-dossier` tooling. Deliverable:
  `docs/sales/pipeline.md`.
- **[ ] Monetization researcher** — pricing models vs NeedaCrew (5% hirer fee),
  Booked AV ($25/post), Staff Me Up ($20/mo worker-side); worker-vs-company-side
  revenue; what the first 10 paying customers look like. Deliverable:
  `docs/monetization.md`.
- **[ ] Ops researcher** (Mark-adjacent) — business entity/LLC options, contractor
  vs W-2 classification rules for crew (1099 rules, state variances — research
  only, flag for human legal review), insurance requirements companies expect.

## 5. OTHER BUSINESS LINES (non-Flexzora agents)

Shared root: `C:\Users\Knoble\OneDrive\Documents\Project Devin's Way\`
- **Prop Firm Reaper** — quant trading (quant_bot, quant_terminal, docker-compose).
  → VPS deployment per `docs/VPS_SETUP.md` here.
- **Agency Engine** — client-dossier (recon/audit/capture) + command-center.
  → Feeds Flexzora sales pipeline: point recon tooling at event-production companies.
- **Wedding Memory Studio**, **Card Game Scanner**, others — independent lines;
  not part of this briefing's scope.

## 6. RULES OF ENGAGEMENT (existing, still in force)

- Claim before work in `BACKLOG.md`; append-only coordination docs.
- `AGENT_LOG.md` — journal what shipped after every session.
- Never touch another lane's worktree/checkout (see multi-agent-repo-ops skill).
- Contents-API pattern for shared-doc edits when lanes are live.
- Vendor decisions: ≥3 options researched, logged in `vendor-options.md`.
- No secrets in chat/commits. `.env.local` stays local.
