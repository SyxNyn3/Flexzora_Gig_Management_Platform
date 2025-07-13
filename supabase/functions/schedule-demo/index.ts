import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.0";

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
    const requiredFields = [
      'company_name', 
      'contact_name', 
      'contact_email', 
      'contact_phone',
      'company_size',
      'industry_focus',
      'num_workers_managed',
      'annual_gigs',
      'current_software',
      'communication_methods',
      'payroll_process',
      'pain_points',
      'preferred_date',
      'preferred_time'
    ];
    
    const missingFields = requiredFields.filter(field => !requestData[field]);
    
    if (missingFields.length > 0) {
      return new Response(
        JSON.stringify({ error: `Missing required fields: ${missingFields.join(', ')}` }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Store the demo request in the database
    // In a real implementation, you would create a 'demo_requests' table
    // For now, we'll simulate success
    
    // In a real implementation, you would also:
    // 1. Create a calendar event
    // 2. Send confirmation emails
    // 3. Notify the sales team
    // 4. Add the contact to your CRM

    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Return success response
    return new Response(
      JSON.stringify({ 
        message: "Demo request successfully submitted",
        demo_id: `demo-${Date.now()}`,
        status: "scheduled"
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