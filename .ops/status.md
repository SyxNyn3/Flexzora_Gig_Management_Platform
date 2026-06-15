# FlexZora - Professional Gig Management Platform - MVP Finish Plan

Last updated: 2026-06-15

## Current status

The repository is a React/Vite/TypeScript frontend for a professional gig management platform for the freelance production industry.

Verified status:
- Local Supabase is running on the VPS.
- Production Vite build successfully compiles and bundles the React app (`npm run build` exits 0).
- Local container for FlexZora is running on port 8082.

Verified commands:
- `npm run build`: passes and emits bundled static assets (2.2MB bundle, 79KB CSS).

## Missing pieces

MVP blockers before public launch:
1. Verify database schema: Check if migrations in `supabase/migrations/` (including waitlist onboarding) are fully applied to the local Supabase container.
2. Form testing: Verify waitlist onboarding flow (signing up, email verification edge function, completing onboarding).
3. Connect external services (Gmail, Google Calendar, Stripe, AuthKit) or document local fallback configurations.
4. Set up Caddy/Nginx reverse proxy for SSL and domain routing on the VPS.
5. Create a validation smoke test.

## Task plan

### Orchestrator
- Keep this plan current.
- Prioritize Project C (FlexZora) as top priority, followed by Project A (Gator Car Customs) and Project B (Illuminate Your Holiday).

### Scout
- Gather keys and credentials for Stripe, AuthKit, and Google APIs.
- Confirm target public domains, reverse proxy configuration, and SSL requirements.

### Scribe
- Document waitlist onboarding architecture and database schema in `DOCUMENTATION.md`.

### Reach
- Draft public messaging and outreach copy for early signups.

### Dev
- Verify and apply any pending Supabase migrations on the VPS.
- Implement and verify waitlist pre-onboarding flows.
- Add local healthchecks and configure reverse proxy.

## Deployment plan

Local VPS deployment:
1. Rebuild and run container:
   `docker compose up -d --build`
2. App runs on port 8082 on host.
3. Configure domain proxying to route public traffic securely to 8082.

## Validation checklist

- [x] `npm run build` passes.
- [x] Supabase migrations applied. (Verified: all 25 migrations applied up to 20251008000000)
- [x] Waitlist signup flow validated. (Verified: validate_onboarding.py passed)
- [x] Email verification edge function works locally. (Verified: validate_onboarding.py passed)
- [x] Docker image builds and starts.
- [ ] Public domain and SSL configured.
