// ============================================================
// stripe-customer-portal — Supabase Edge Function
// ============================================================
// Creates a Stripe Customer Portal session.
// The portal lets users: cancel subscription, update payment method,
// view invoice history, change billing address, re-subscribe.
//
// Auth: Requires valid Supabase JWT.
// Deploy: supabase functions deploy stripe-customer-portal
//
// Required secrets:
//   STRIPE_SECRET_KEY
//   SUPABASE_SERVICE_ROLE_KEY
//   SUPABASE_URL
//   APP_URL
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const jwt = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { user_type } = body as { user_type: "fleet" | "personal" };

    if (!user_type) {
      return new Response(JSON.stringify({ error: "Missing user_type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
      apiVersion: "2023-10-16",
    });

    const appUrl = Deno.env.get("APP_URL") ?? "https://app.millogapp.se";

    // ── Resolve stripe_customer_id ─────────────────────────────
    let stripeCustomerId: string | null = null;

    if (user_type === "fleet") {
      const { data: member } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .in("role", ["admin"])
        .limit(1)
        .maybeSingle();

      if (!member) {
        return new Response(JSON.stringify({ error: "Not an org admin" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: org } = await supabase
        .from("organizations")
        .select("stripe_customer_id")
        .eq("id", member.organization_id)
        .single();

      stripeCustomerId = org?.stripe_customer_id ?? null;
    } else {
      const { data: profile } = await supabase
        .from("profiles")
        .select("stripe_customer_id")
        .eq("id", user.id)
        .single();

      stripeCustomerId = profile?.stripe_customer_id ?? null;
    }

    if (!stripeCustomerId) {
      return new Response(
        JSON.stringify({ error: "No Stripe customer found. Please start a subscription first." }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // ── Create portal session ──────────────────────────────────
    const returnUrl = user_type === "fleet"
      ? `${appUrl}/dashboard/settings?tab=billing`
      : `${appUrl}/personal/account?tab=billing`;

    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: returnUrl,
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[stripe-customer-portal] Unhandled error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
