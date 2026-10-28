# Domains and DNS — the field guide

You own domains now. This is the reference for every "point a name at a
thing" task you'll hit. It maps registrar vocabulary (Porkbun) to what
the target (Vercel, the VPS, an email provider) actually needs.

## The mental model

Three separate systems, three different jobs:

- **Registrar** (Porkbun) — you bought the name here. Its DNS panel
  decides where the name points. Owning a domain changes nothing on
  its own; records are what give it meaning.
- **DNS records** — a phone book entry per name. A browser asks
  "where is flexzora.pro?", DNS answers "76.76.21.21", the browser
  connects there.
- **The target** (Vercel, your VPS, a mail server) — the box that
  actually serves traffic once the name resolves to it.

A domain with no records goes nowhere. A record pointing at the wrong
place silently serves the wrong thing. That's the whole game.

## Record types you'll actually use

| Type | What it does | Typical use |
|------|--------------|-------------|
| **A** | name → IPv4 address | apex domain → server IP |
| **AAAA** | name → IPv6 address | same, for IPv6 hosts |
| **CNAME** | name → another name | `www` → your host's name; subdomains |
| **TXT** | name → text string | verification proofs, SPF/DKIM for email |
| **MX** | name → mail server(s) | receiving email at the domain |
| **ALIAS/ANAME** | like CNAME but legal at apex | some registrars offer it where CNAME is banned |

One hard rule: **a name can't hold a CNAME and other records at once.**
That's why apex (`flexzora.pro` itself) gets an **A** record while
`www.flexzora.pro` gets a **CNAME** — apex can't be a CNAME.

## The Vercel recipe (any domain)

Two records, every time:

```
Type    Host    Answer
A       (blank) 76.76.21.21
CNAME   www     cname.vercel-dns.com
```

Blank host = the apex/root domain itself. Some registrars write it as
`@` — same thing. `www` as host means `www.yourdomain`.

After saving, Vercel verifies automatically (minutes to ~1h). Then the
domain serves the project and TLS provisions itself. Check with:
`npx vercel domains verify yourdomain`.

## Porkbun field names → what they mean

Their form labels differ from Vercel's docs:

| Porkbun shows | Vercel/docs call it | You put |
|---------------|---------------------|---------|
| Type | Record type | A / CNAME / TXT / MX |
| Host | Name / Host | `www`, `api`, blank or `@` for apex |
| IPv4 address (or "Answer") | Value / Points to | the IP or name it resolves to |
| TTL | TTL | leave default (600) — how long resolvers cache |
| Note | — | cosmetic label, does nothing |

**Watch for parked-domain defaults.** Porkbun ships new domains with
records pointing at `pixie.porkbun.com` (a parking page). Delete them
before adding yours — leftover records cause silent weirdness.

## Recipes you'll hit

**New product domain → Vercel** — the two records above. Done.

**Subdomain for an API or app** — e.g. `api.flexzora.pro`:
- Vercel project: CNAME `api` → `cname.vercel-dns.com`
- Your own server: A `api` → your VPS IP

**Domain → your VPS** — A record, host blank or `@`, answer = VPS IP.
TLS is your problem then (Caddy/nginx handle it on the box).

**Verification TXT** — services (Google, Stripe, SES) ask for a TXT
record to prove ownership. Type TXT, host = what they tell you (often
blank/`@` or a subdomain), answer = their token string, paste it
exactly — quotes included only if they say so.

**Email at the domain** (Google Workspace, etc.) — their MX records
go in as Type MX, plus TXT records they give you (SPF). Never delete
MX records on a domain that receives mail.

**Pointing a domain somewhere else later** — edit the record's answer,
don't stack duplicates. Two A records = the browser picks at random.

## TTL and propagation

- TTL 600 = resolvers may cache the old answer for 10 min. Changes
  feel "slow" because other people's caches lag, not yours.
- Before a planned cutover, lower TTL to 60 a day early so the flip
  propagates fast. Raise it back after.
- "It works for me but not my friend" = propagation lag, always.

## Safety

- Records are public. Anyone can read them — never put secrets in TXT.
- Keep registrar 2FA on. Registrar account = ownership of everything.
- Changing **nameservers** (NS) is a bigger move: it hands all DNS for
  the domain to another provider (e.g. Cloudflare). Deliberate, not a
  record edit. If a service asks for nameserver changes, that's what
  they mean — it replaces every record in this panel.

## flexzora.pro right now

- `flexzora.pro` → A `76.76.21.21` (Vercel)
- `www.flexzora.pro` → CNAME `cname.vercel-dns.com`
- Serves the Vite build of `main` on `SyxNyn3/Flexzora_Gig_Management_Platform`
