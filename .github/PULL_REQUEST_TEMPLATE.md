## What & why

<!-- One paragraph: what changed and the problem it solves. Link issues:
Fixes #__, Closes #__. -->

## How verified

- [ ] `npm run lint` clean
- [ ] `npx tsc --noEmit -p tsconfig.app.json` clean
- [ ] `npm run test` passes
- [ ] `supabase test db` passes (if `supabase/` touched)
- [ ] Manually exercised the affected screens/flows

## Risk & rollback

<!-- What could this break? How do you back it out — migration reversal,
flag off, revert? -->

## Security notes

<!-- New env vars? RLS/policy changes? Auth surface touched?
Write "none" if truly none. -->

## Screenshots / evidence

<!-- UI changes: before/after. Data changes: query output or test tail. -->
