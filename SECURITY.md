# Security Policy

## Reporting a Vulnerability

Flexzora handles payroll-adjacent data — worker PII, shift records,
payment intent metadata — so we take disclosure seriously.

**Please do not open a public issue for security reports.**

- Use GitHub's **private vulnerability reporting** on this repository
  (Security → Advisories → "Report a vulnerability"), or
- Contact the maintainer through the GitHub profile.

Please include: affected component, reproduction steps, and (if known)
the data boundary crossed — e.g. RLS bypass, auth weakness, or
cross-tenant visibility.

We aim to acknowledge reports within **72 hours** and will keep you
updated on remediation status.

## Scope

| In scope | Out of scope |
|---|---|
| RLS policy bypass on any table | Social engineering |
| Auth/session weaknesses | DoS against hosted Supabase infra |
| Cross-tenant data visibility | Self-XSS / issues requiring a victim's device |
| Payment-flow manipulation (Stripe/IOU) | Vulnerabilities in upstream deps with no exploit path in Flexzora |
| Secrets accidentally committed | Missing best-practice headers on static assets |

## Secrets & environment

- Client code must only ever see `VITE_*` (publishable) keys — the anon
  key is protected by Row Level Security, never by secrecy.
- Service-role keys, webhook secrets, and DB credentials are **never**
  committed — they live in deployment secrets. If you find one in git
  history, that is a valid report.
- CI runs `gitleaks` on every push and PR.

## Supported versions

| Version | Supported |
|---|---|
| `main` | ✅ actively maintained |
| tags/releases | ✅ latest release only |
| everything else | ❌ |
