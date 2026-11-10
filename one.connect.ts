import { defineConnectApp } from "@withone/connect/config";

/**
 * Flexzora's One Connect app (WithOne org space).
 *
 * `one connect create` reads this file and opens an approval page in the
 * signed-in browser. The client secret and connect key are shown there
 * once and live only in .env.local / Supabase secrets — never in code.
 *
 * Ask scope — mapped to real Flexzora workflows:
 *  - gmail (read-only):        parse crew/company email into the feed
 *  - google-calendar (rw):     push shifts to crew calendars, conflict checks
 *  - google-drive (full):      store deal memos, W-9s, receipts, contracts
 *  - google-sheets (full):     import company roster sheets / export timesheets
 *  - quickbooks (full):        push invoices + expenses into company books
 *  - slack (rw):               shift alerts and call notifications in Slack
 */
export default defineConnectApp({
  name: "Flexzora",
  description:
    "Crew OS and Company OS for live-event production — shifts, schedules, deal memos, and payouts.",
  homepageUrl: "https://flexzora.pro",
  reason:
    "Flexzora syncs shifts, documents, and invoices between your calendar, drive, sheets, accounting, and team chat.",
  branding: {
    panelColor: "#0A0C0B",
    buttonColor: "#FBBF24",
    cobrandEmail: true,
  },
  // The callback is the one-connect edge function; `action=callback` is
  // part of the URI because Supabase functions route by name only.
  redirectUris: [
    "http://127.0.0.1:54321/functions/v1/one-connect?action=callback",
    "https://qgjtrosadftjrplubjaw.supabase.co/functions/v1/one-connect?action=callback",
  ],
  ask: {
    gmail: { access: "read-only" },
    "google-calendar": { access: "read-write" },
    "google-drive": { access: "full-access" },
    "google-sheets": { access: "full-access" },
    quickbooks: { access: "full-access" },
    slack: { access: "read-write" },
  },
});
