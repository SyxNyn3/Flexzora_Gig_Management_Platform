// Outbound message logging — every SMS/email/push the platform sends
// gets a row in outbound_messages so the unified feed can show the user
// "we texted you at 4:12pm". Fire-and-forget: a logging failure must
// never break the actual send path.
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface OutboundEntry {
  recipient_profile_id?: string | null;
  recipient_contact?: string | null;
  channel: "sms" | "email" | "push";
  template?: string | null;
  subject?: string | null;
  body_preview?: string | null;
  status?: "sent" | "failed";
  error?: string | null;
  ref_type?: string | null;
  ref_id?: string | null;
}

export function makeLogger(): SupabaseClient | null {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function logOutbound(client: SupabaseClient | null, entry: OutboundEntry) {
  try {
    if (!client) return;
    await client.from("outbound_messages").insert({
      recipient_profile_id: entry.recipient_profile_id ?? null,
      recipient_contact: entry.recipient_contact ?? null,
      channel: entry.channel,
      template: entry.template ?? null,
      subject: entry.subject ?? null,
      body_preview: entry.body_preview?.slice(0, 500) ?? null,
      status: entry.status ?? "sent",
      error: entry.error ?? null,
      ref_type: entry.ref_type ?? null,
      ref_id: entry.ref_id ?? null,
    });
  } catch (e) {
    console.warn("outbound log failed (non-fatal):", e);
  }
}
