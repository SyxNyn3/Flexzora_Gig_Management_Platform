// ical-sync — POST { import_id }   (verify_jwt = true)
//
// Fetches a worker's personal iCal feed server-side (browser CORS would
// block calendar hosts), parses VEVENTs into busy blocks (shared parser:
// functions/_shared/ics.ts), and atomically replaces the import's
// availability rows via sync_calendar_import — the RPC enforces ownership
// off the caller's JWT, so a worker can only sync their own imports.
// Everything runs on the user's client; the service role is never needed.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.0";
import { parseIcs, type BusyBlock } from "../_shared/ics.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const MAX_FEED_BYTES = 5 * 1024 * 1024;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "Authorization required" });
    const { import_id } = await req.json();
    if (!import_id) return json(400, { error: "import_id required" });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_ANON_KEY") || "",
      { global: { headers: { Authorization: authHeader } } },
    );

    // RLS scopes this read to the caller's own imports.
    const { data: imp, error: impErr } = await supabase
      .from("calendar_imports").select("id, feed_url").eq("id", import_id).single();
    if (impErr || !imp) return json(404, { error: "Import not found" });

    const sync = (blocks: BusyBlock[] = [], error: string | null = null) =>
      supabase.rpc("sync_calendar_import", {
        p_import_id: import_id,
        p_blocks: error ? [] : blocks,
        p_error: error,
      });

    const url = imp.feed_url.replace(/^webcal:\/\//i, "https://");
    if (!/^https?:\/\//i.test(url)) {
      await sync([], "Feed URL must be https:// or webcal://");
      return json(422, { error: "Feed URL must be https:// or webcal://" });
    }

    let ics: string;
    try {
      const res = await fetch(url, { headers: { "User-Agent": "Flexzora-CalendarSync/1.0" } });
      if (!res.ok) {
        await sync([], `Feed returned HTTP ${res.status}`);
        return json(502, { error: `Feed returned HTTP ${res.status}` });
      }
      const reader = res.body?.getReader();
      if (!reader) {
        await sync([], "Empty feed body");
        return json(502, { error: "Empty feed body" });
      }
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > MAX_FEED_BYTES) {
          await sync([], "Feed too large (5MB cap)");
          return json(413, { error: "Feed too large (5MB cap)" });
        }
        chunks.push(value);
      }
      const merged = new Uint8Array(size);
      let off = 0;
      for (const c of chunks) { merged.set(c, off); off += c.length; }
      ics = new TextDecoder().decode(merged);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "fetch failed";
      await sync([], `Fetch failed: ${msg}`);
      return json(502, { error: `Fetch failed: ${msg}` });
    }

    if (!ics.includes("BEGIN:VCALENDAR")) {
      await sync([], "Response was not an iCalendar feed");
      return json(422, { error: "Response was not an iCalendar feed" });
    }

    const blocks = parseIcs(ics);
    const { data: count, error: syncErr } = await sync(blocks);
    if (syncErr) return json(500, { error: syncErr.message });
    return json(200, { synced: count });
  } catch (e) {
    return json(500, { error: e instanceof Error ? e.message : "unexpected error" });
  }
});
