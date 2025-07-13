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
    const requestData = await req.json();
    
    // Validate required fields
    if (!requestData.email || !requestData.role_interest) {
      return new Response(
        JSON.stringify({ error: "Email and role interest are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Check if email already exists in the waiting list
    const { data: existingEntry, error: lookupError } = await supabase
      .from("waiting_list")
      .select("email, referral_code")
      .eq("email", requestData.email)
      .single();

    if (lookupError && lookupError.code !== "PGRST116") {
      // PGRST116 is "No rows found" which is expected if the email is not in the list
      console.error("Error checking for existing email:", lookupError);
      return new Response(
        JSON.stringify({ error: "Error checking for existing email" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // If email already exists, return the existing referral code
    if (existingEntry) {
      return new Response(
        JSON.stringify({ 
          message: "Email already on waitlist", 
          referral_code: existingEntry.referral_code 
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Generate a unique referral code
    const referralCode = nanoid(10);

    // Check if referred_by_email exists and is valid
    let referredByEmail = requestData.referred_by_email;
    if (referredByEmail) {
      const { data: referrer, error: referrerError } = await supabase
        .from("waiting_list")
        .select("email")
        .eq("referral_code", referredByEmail)
        .single();

      if (referrerError) {
        // If referrer not found by code, clear it
        referredByEmail = null;
      } else if (referrer) {
        // If found by code, use the actual email
        referredByEmail = referrer.email;
      }
    }

    // Insert the new entry into the waiting list
    const { data, error } = await supabase
      .from("waiting_list")
      .insert({
        email: requestData.email,
        role_interest: requestData.role_interest,
        production_companies_worked_with: requestData.production_companies_worked_with,
        past_communication_methods: requestData.past_communication_methods,
        desired_features: requestData.desired_features,
        challenges: requestData.challenges,
        referred_by_email: referredByEmail,
        referral_code: referralCode,
      })
      .select()
      .single();

    if (error) {
      console.error("Error inserting into waiting list:", error);
      return new Response(
        JSON.stringify({ error: "Error adding to waitlist" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Return success response with the referral code
    return new Response(
      JSON.stringify({ 
        message: "Successfully added to waitlist", 
        referral_code: referralCode 
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