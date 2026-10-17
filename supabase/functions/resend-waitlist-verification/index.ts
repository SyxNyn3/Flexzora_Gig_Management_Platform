import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.0";
import { nanoid } from "npm:nanoid@5.0.4";

// CORS headers for browser requests
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Create a Supabase client
const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  try {
    // Parse the request body
    const { email } = await req.json();
    
    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Check if email exists in waiting list
    const { data: existingEntry, error: lookupError } = await supabase
      .from("waiting_list")
      .select("email, referral_code, verification_sent_at")
      .eq("email", email)
      .single();

    if (lookupError || !existingEntry) {
      // Generic success — a 404 tells an attacker whether an address is
      // signed up (email enumeration). Say nothing either way.
      return new Response(
        JSON.stringify({ message: "If that email is on the waitlist, a new link is on its way" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Throttle: one resend per 60s per address — the endpoint is unauthenticated
    // and each call sends a real email (email-bomb vector).
    const lastSent = existingEntry.verification_sent_at
      ? new Date(existingEntry.verification_sent_at).getTime()
      : 0;
    if (Date.now() - lastSent < 60_000) {
      return new Response(
        JSON.stringify({ error: "Please wait before requesting another email" }),
        {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Generate a new verification token
    const verificationToken = nanoid(32);

    // Update the verification token in the database
    const { error: updateError } = await supabase
      .from("waiting_list")
      .update({ verification_token: verificationToken, verification_sent_at: new Date().toISOString() })
      .eq("email", email);

    if (updateError) {
      console.error("Error updating verification token:", updateError);
      return new Response(
        JSON.stringify({ error: "Error updating verification token" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Send verification email using the send-waitlist-verification function
    const { error: emailError } = await supabase.functions.invoke('send-waitlist-verification', {
      body: {
        email,
        verification_token: verificationToken,
        referral_code: existingEntry.referral_code
      }
    });

    if (emailError) {
      console.error('Error sending verification email:', emailError);
      return new Response(
        JSON.stringify({ error: "Failed to send verification email" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Return success response
    return new Response(
      JSON.stringify({ 
        message: "Verification email resent successfully"
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error processing request:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});