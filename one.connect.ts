import { defineConnectApp } from "@withone/connect/config";

/**
 * Flexzora's One Connect app — the successor to Pica AuthKit.
 *
 * `one connect create` reads this file and opens an approval page in the
 * signed-in browser. The client secret and connect key are shown there
 * once and never pass through the CLI or this file.
 *
 * Ask scope: crew-facing integrations only. Gmail read-only (parse crew
 * emails into the feed later); Google Calendar read-write (push shifts
 * to crew calendars and read personal events for conflict detection).
 */
export default defineConnectApp({
  name: "Flexzora",
  description:
    "Crew OS and Company OS for live-event production — shifts, schedules, deal memos, and payouts.",
  homepageUrl: "https://flexzora.pro",
  reason:
    "Flexzora syncs your shifts to your calendar and helps crew and companies coordinate schedules.",
  branding: {
    panelColor: "#18181b",
    buttonColor: "#f59e0b",
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
  },
});
