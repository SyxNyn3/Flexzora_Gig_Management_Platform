// ics-feed — GET /functions/v1/ics-feed?token=<uuid>
//
// Capability-URL calendar feeds: the unguessable token is the auth (calendar
// clients can't hold JWTs), scoped by calendar_feeds.scope. Reads via the
// service role — feeds only ever read. Times are emitted as UTC instants;
// the event's IANA timezone is named in each DESCRIPTION so crew see the
// wall-clock zone regardless of where their calendar sits.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
);

const CAL_NAME = "Flexzora";

// -- ICS serialization ------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, "0");

const dtUtc = (iso: string) => {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
};

const dtDate = (iso: string) => iso.slice(0, 10).replace(/-/g, "");

const escapeText = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Fold a content line at 75 octets (continuation = leading space). */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [line.slice(0, 75)];
  let i = 75;
  while (i < line.length) {
    parts.push(" " + line.slice(i, i + 74));
    i += 74;
  }
  return parts.join("\r\n");
}

interface VEvent {
  uid: string;
  summary: string;
  startUtc?: string;   // timed event (timestamptz iso)
  endUtc?: string;
  startDate?: string;  // all-day event (date iso)
  endDateExclusive?: string;
  location?: string;
  description?: string;
}

function toIcs(events: VEvent[], calName: string): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Flexzora//Company OS//EN",
    `X-WR-CALNAME:${escapeText(calName)}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  const stamp = dtUtc(new Date().toISOString());
  for (const ev of events) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${ev.uid}@flexzora`);
    lines.push(`DTSTAMP:${stamp}`);
    if (ev.startUtc) {
      lines.push(`DTSTART:${dtUtc(ev.startUtc)}`);
      lines.push(`DTEND:${dtUtc(ev.endUtc ?? ev.startUtc)}`);
    } else if (ev.startDate) {
      lines.push(`DTSTART;VALUE=DATE:${dtDate(ev.startDate)}`);
      // ICS end dates are exclusive — +1 day so a 3-day show covers all 3.
      const end = new Date(`${(ev.endDateExclusive ?? ev.startDate)}T00:00:00Z`);
      end.setUTCDate(end.getUTCDate() + 1);
      lines.push(`DTEND;VALUE=DATE:${dtUtc(end.toISOString()).slice(0, 8)}`);
    }
    lines.push(`SUMMARY:${escapeText(ev.summary)}`);
    if (ev.location) lines.push(`LOCATION:${escapeText(ev.location)}`);
    if (ev.description) lines.push(`DESCRIPTION:${escapeText(ev.description)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

// -- Feed resolution ---------------------------------------------------------

interface FeedRow {
  id: string;
  company_id: string;
  scope: "company" | "event" | "staff" | "worker";
  event_id: string | null;
  staff_id: string | null;
  worker_id: string | null;
  label: string | null;
  is_active: boolean;
}

serve(async (req) => {
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }
  const token = new URL(req.url).searchParams.get("token");
  if (!token) {
    return new Response("Missing token", { status: 400 });
  }

  const { data: feed, error: feedErr } = await supabase
    .from("calendar_feeds")
    .select("*")
    .eq("token", token)
    .eq("is_active", true)
    .maybeSingle();
  if (feedErr || !feed) {
    return new Response("Feed not found", { status: 404 });
  }
  const f = feed as FeedRow;

  const events: VEvent[] = [];
  const venueOf = new Map<string, string>();
  const tzOf = new Map<string, string>();

  const eventQuery = () =>
    supabase
      .from("events")
      .select("id, name, description, starts_on, ends_on, timezone, venue:venues(name, address, city)")
      .eq("company_id", f.company_id);

  if (f.scope === "company" || f.scope === "event" || f.scope === "staff") {
    let q = eventQuery().order("starts_on");
    if (f.scope === "event") q = q.eq("id", f.event_id);
    if (f.scope === "staff") {
      // Events this staff member is on.
      const { data: sas } = await supabase
        .from("staff_assignments")
        .select("event_id")
        .eq("staff_id", f.staff_id);
      const ids = [...new Set((sas ?? []).map((s) => s.event_id as string))];
      if (!ids.length) {
        return respond([], f);
      }
      q = q.in("id", ids);
    }
    const { data: evs } = await q;
    const eventIds: string[] = [];
    for (const e of evs ?? []) {
      eventIds.push(e.id);
      const v = e.venue as { name?: string; address?: string; city?: string } | null;
      venueOf.set(e.id, v ? [v.name, v.address, v.city].filter(Boolean).join(", ") : "");
      tzOf.set(e.id, e.timezone || "America/Los_Angeles");
      events.push({
        uid: `event-${e.id}`,
        summary: e.name,
        startDate: e.starts_on,
        endDateExclusive: e.ends_on,
        location: venueOf.get(e.id),
        description: [e.description, `Local time: ${tzOf.get(e.id)}`].filter(Boolean).join("\n"),
      });
    }

    // Timed calls for those events (staff sees the same schedule).
    if (eventIds.length && f.scope !== "staff") {
      const { data: shifts } = await supabase
        .from("shifts")
        .select("id, event_id, title, role_name, starts_at, ends_at, headcount, notes")
        .in("event_id", eventIds)
        .neq("status", "cancelled")
        .order("starts_at");
      for (const s of shifts ?? []) {
        events.push({
          uid: `shift-${s.id}`,
          summary: `${s.title} — ${s.role_name} ×${s.headcount}`,
          startUtc: s.starts_at,
          endUtc: s.ends_at,
          location: venueOf.get(s.event_id),
          description: [s.notes, `Local time: ${tzOf.get(s.event_id)}`].filter(Boolean).join("\n"),
        });
      }
    }

    if (f.scope === "staff") {
      // Staff assignments as timed entries on top of the event shells.
      const { data: sas } = await supabase
        .from("staff_assignments")
        .select("id, event_id, role_label, call_time, status, notes, event:events(name, starts_on, ends_on)")
        .eq("staff_id", f.staff_id)
        .neq("status", "declined");
      for (const a of sas ?? []) {
        const ev = a.event as { name?: string; starts_on?: string; ends_on?: string } | null;
        const evName = ev?.name ?? "Event";
        events.push({
          uid: `staff-${a.id}`,
          summary: `${evName} — ${a.role_label ?? "Staff"}`,
          ...(a.call_time
            ? { startUtc: a.call_time, endUtc: new Date(new Date(a.call_time).getTime() + 3600e3).toISOString() }
            : { startDate: ev?.starts_on, endDateExclusive: ev?.ends_on }),
          description: [`Role: ${a.role_label ?? "Staff"}`, a.notes].filter(Boolean).join("\n"),
        });
      }
    }
  }

  if (f.scope === "worker") {
    // Confirmed/completed calls for one crew member.
    const { data: assignments } = await supabase
      .from("shift_assignments")
      .select("id, status, shift:shifts(id, event_id, title, role_name, starts_at, ends_at, notes, event:events(id, name, timezone, venue:venues(name, address, city)))")
      .eq("worker_id", f.worker_id)
      .in("status", ["confirmed", "completed"]);
    for (const a of assignments ?? []) {
      const s = a.shift as {
        id: string; event_id: string; title: string; role_name: string;
        starts_at: string; ends_at: string; notes?: string;
        event?: { name?: string; timezone?: string; venue?: { name?: string; address?: string; city?: string } | null } | null;
      } | null;
      if (!s) continue;
      const v = s.event?.venue;
      events.push({
        uid: `work-${a.id}`,
        summary: `${s.event?.name ?? "Call"} — ${s.title} (${s.role_name})`,
        startUtc: s.starts_at,
        endUtc: s.ends_at,
        location: v ? [v.name, v.address, v.city].filter(Boolean).join(", ") : undefined,
        description: [s.notes, `Local time: ${s.event?.timezone ?? "America/Los_Angeles"}`].filter(Boolean).join("\n"),
      });
    }
  }

  return respond(events, f);
});

async function respond(events: VEvent[], f: FeedRow) {
  // Fire-and-forget last-access marker — never block the feed on it.
  supabase.from("calendar_feeds").update({ last_accessed_at: new Date().toISOString() }).eq("id", f.id).then(() => undefined);
  const name = f.label ? `${CAL_NAME} — ${f.label}` : CAL_NAME;
  return new Response(toIcs(events, name), {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="flexzora-${f.scope}.ics"`,
      "Cache-Control": "no-cache",
    },
  });
}
