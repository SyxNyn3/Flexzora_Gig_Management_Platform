import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { AuthKitToken } from "npm:@picahq/authkit-node@1.0.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Max-Age": "86400",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }

  try {
    const picaSecretKey = Deno.env.get("PICA_SECRET_KEY");
    
    if (!picaSecretKey) {
      throw new Error("PICA_SECRET_KEY environment variable is not set");
    }

    const authKitToken = new AuthKitToken(picaSecretKey);

    // Get user identity from request headers or body
    const authHeader = req.headers.get("Authorization");
    const userIdentity = authHeader ? authHeader.replace("Bearer ", "") : "user_123";

    const token = await authKitToken.create({
      identity: userIdentity,
      identityType: "user",
    });

    return new Response(JSON.stringify(token), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("AuthKit token creation error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});