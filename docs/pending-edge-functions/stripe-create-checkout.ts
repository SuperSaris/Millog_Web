// ============================================================
// stripe-create-checkout — Supabase Edge Function
// ============================================================
// Creates a Stripe Checkout Session for new subscriptions.
// Upserts a Stripe Customer linked to the org or personal profile.
// Returns { url } — the caller redirects the browser there.
//
// Auth: Requires valid Supabase JWT.
// Deploy: supabase functions deploy stripe-create-checkout
//
// Required secrets (set via: supabase secrets set KEY=value):
//   STRIPE_SECRET_KEY   — sk_live_... or sk_test_...
//   SUPABASE_SERVICE_ROLE_KEY
//   SUPABASE_URL
//
// Required env vars (same as other functions):
//   STRIPE_FLEET_MONTHLY_PRICE_ID   — 129 kr/vehicle/month price ID
//   STRIPE_PERSONAL_MONTHLY_PRICE_ID — 79 kr/month price ID
//   STRIPE_PERSONAL_ANNUAL_PRICE_ID  — 699 kr/year price ID
//   APP_URL  — https://app.millogapp.se
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
    // ── Auth ───────────────────────────────────────────────────
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

    // Verify the JWT and get the calling user
    const jwt = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Request body ───────────────────────────────────────────
    const body = await req.json();
    const { plan, user_type } = body as {
      plan: "fleet_monthly" | "personal_monthly" | "personal_annual";
      user_type: "fleet" | "personal";
    };

    if (!plan || !user_type) {
      return new Response(JSON.stringify({ error: "Missing plan or user_type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
      apiVersion: "2023-10-16",
    });

    const appUrl = Deno.env.get("APP_URL") ?? "https://app.millogapp.se";

    // ── Resolve Stripe Price ID ────────────────────────────────
    const priceIdMap: Record<string, string | undefined> = {
      fleet_monthly:    Deno.env.get("STRIPE_FLEET_MONTHLY_PRICE_ID"),
      personal_monthly: Deno.env.get("STRIPE_PERSONAL_MONTHLY_PRICE_ID"),
      personal_annual:  Deno.env.get("STRIPE_PERSONAL_ANNUAL_PRICE_ID"),
    };
    const priceId = priceIdMap[plan];
    if (!priceId) {
      return new Response(JSON.stringify({ error: `No price ID configured for plan: ${plan}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Resolve or create Stripe Customer ─────────────────────
    let stripeCustomerId: string;
    let customerEmail: string;
    let trialDays = 30; // 30-day trial for web

    if (user_type === "fleet") {
      // Fleet: billing is per-org, not per-user
      const { data: member } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .eq("role", "admin")
        .limit(1)
        .maybeSingle();

      if (!member) {
        return new Response(JSON.stringify({ error: "No admin membership found" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: org } = await supabase
        .from("organizations")
        .select("id, name, billing_email, stripe_customer_id, subscription_status")
        .eq("id", member.organization_id)
        .single();

      if (!org) {
        return new Response(JSON.stringify({ error: "Organization not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Don't allow starting a new checkout if already active
      if (org.subscription_status === "active" || org.subscription_status === "trialing") {
        return new Response(JSON.stringify({ error: "Subscription already active. Use the customer portal to manage it." }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      customerEmail = org.billing_email ?? user.email ?? "";

      if (org.stripe_customer_id) {
        stripeCustomerId = org.stripe_customer_id;
      } else {
        const customer = await stripe.customers.create({
          email: customerEmail,
          name: org.name,
          metadata: {
            supabase_org_id: org.id,
            entity_type: "organization",
          },
        });
        stripeCustomerId = customer.id;
        await supabase
          .from("organizations")
          .update({ stripe_customer_id: customer.id })
          .eq("id", org.id);
      }

      // Fleet: quantity = number of active vehicles in the org
      const { count: vehicleCount } = await supabase
        .from("vehicles")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", org.id);

      const quantity = Math.max(vehicleCount ?? 1, 1);

      const session = await stripe.checkout.sessions.create({
        customer: stripeCustomerId,
        mode: "subscription",
        line_items: [{ price: priceId, quantity }],
        subscription_data: {
          trial_period_days: trialDays,
          metadata: {
            entity_type: "organization",
            entity_id: org.id,
            plan,
          },
        },
        success_url: `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url:  `${appUrl}/checkout/cancel`,
        allow_promotion_codes: true,
        billing_address_collection: "required",
        customer_update: { address: "auto" },
        locale: "sv",
      });

      return new Response(JSON.stringify({ url: session.url }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else {
      // Personal user
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, full_name, stripe_customer_id, subscription_status")
        .eq("id", user.id)
        .single();

      customerEmail = user.email ?? "";

      if (profile?.subscription_status === "active" || profile?.subscription_status === "trialing") {
        return new Response(JSON.stringify({ error: "Subscription already active. Use the customer portal to manage it." }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (profile?.stripe_customer_id) {
        stripeCustomerId = profile.stripe_customer_id;
      } else {
        const customer = await stripe.customers.create({
          email: customerEmail,
          name: profile?.full_name ?? undefined,
          metadata: {
            supabase_user_id: user.id,
            entity_type: "profile",
          },
        });
        stripeCustomerId = customer.id;
        await supabase
          .from("profiles")
          .update({ stripe_customer_id: customer.id })
          .eq("id", user.id);
      }

      const session = await stripe.checkout.sessions.create({
        customer: stripeCustomerId,
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        subscription_data: {
          trial_period_days: trialDays,
          metadata: {
            entity_type: "profile",
            entity_id: user.id,
            plan,
          },
        },
        success_url: `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url:  `${appUrl}/checkout/cancel`,
        allow_promotion_codes: true,
        billing_address_collection: "auto",
        locale: "sv",
      });

      return new Response(JSON.stringify({ url: session.url }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[stripe-create-checkout] Unhandled error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
