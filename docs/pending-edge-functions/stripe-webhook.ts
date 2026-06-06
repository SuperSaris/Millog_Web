// ============================================================
// stripe-webhook — Supabase Edge Function
// ============================================================
// Receives and verifies Stripe webhook events.
// Updates subscription status in organizations + profiles tables.
// Writes every processed event to subscription_events for audit.
//
// IMPORTANT: Deploy with --no-verify-jwt (public endpoint, no Supabase JWT)
// Deploy: supabase functions deploy stripe-webhook --no-verify-jwt
//
// Register in Stripe Dashboard → Developers → Webhooks:
//   URL: https://<project>.supabase.co/functions/v1/stripe-webhook
//   Events to listen to (minimum):
//     checkout.session.completed
//     customer.subscription.created
//     customer.subscription.updated
//     customer.subscription.deleted
//     invoice.payment_succeeded
//     invoice.payment_failed
//
// Required secrets:
//   STRIPE_SECRET_KEY
//   STRIPE_WEBHOOK_SECRET   — whsec_... from webhook registration
//   SUPABASE_SERVICE_ROLE_KEY
//   SUPABASE_URL
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

// ── DB update helpers ──────────────────────────────────────────

type SubscriptionStatus =
  | "inactive" | "trialing" | "active" | "past_due" | "canceled" | "unpaid";

function stripeStatusToLocal(stripeStatus: string): SubscriptionStatus {
  const map: Record<string, SubscriptionStatus> = {
    trialing:  "trialing",
    active:    "active",
    past_due:  "past_due",
    canceled:  "canceled",
    unpaid:    "unpaid",
    incomplete: "inactive",
    incomplete_expired: "inactive",
    paused:    "inactive",
  };
  return map[stripeStatus] ?? "inactive";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function updateEntitySubscription(
  supabase: ReturnType<typeof createClient>,
  entityType: "organization" | "profile",
  entityId: string,
  fields: {
    stripe_subscription_id?: string;
    subscription_status?: SubscriptionStatus;
    subscription_plan?: string;
    subscription_quantity?: number;
    current_period_end?: string | null;
    trial_ends_at?: string | null;
  },
) {
  const table = entityType === "organization" ? "organizations" : "profiles";
  const idColumn = entityType === "organization" ? "id" : "id";

  const { error } = await supabase
    .from(table)
    .update(fields)
    .eq(idColumn, entityId);

  if (error) {
    console.error(`[stripe-webhook] Failed to update ${table}:`, error.message);
    throw error;
  }
}

async function resolveEntityFromSubscription(
  supabase: ReturnType<typeof createClient>,
  subscription: Stripe.Subscription,
): Promise<{ entityType: "organization" | "profile"; entityId: string } | null> {
  // First try metadata on the subscription (set at checkout time)
  const meta = subscription.metadata;
  if (meta?.entity_type && meta?.entity_id) {
    return {
      entityType: meta.entity_type as "organization" | "profile",
      entityId: meta.entity_id,
    };
  }

  // Fallback: look up by stripe_subscription_id in both tables
  const { data: org } = await supabase
    .from("organizations")
    .select("id")
    .eq("stripe_subscription_id", subscription.id)
    .maybeSingle();

  if (org) return { entityType: "organization", entityId: org.id };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("stripe_subscription_id", subscription.id)
    .maybeSingle();

  if (profile) return { entityType: "profile", entityId: profile.id };

  // Last resort: look up by stripe_customer_id
  const customerId = typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer.id;

  const { data: orgByCustomer } = await supabase
    .from("organizations")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  if (orgByCustomer) return { entityType: "organization", entityId: orgByCustomer.id };

  const { data: profileByCustomer } = await supabase
    .from("profiles")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  if (profileByCustomer) return { entityType: "profile", entityId: profileByCustomer.id };

  return null;
}

// ── Main handler ───────────────────────────────────────────────

serve(async (req) => {
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing stripe-signature header", { status: 400 });
  }

  const body = await req.text();
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!webhookSecret) {
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET not set");
    return new Response("Webhook secret not configured", { status: 500 });
  }

  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
    apiVersion: "2023-10-16",
  });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err) {
    console.error("[stripe-webhook] Signature verification failed:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ── Idempotency: skip already-processed events ─────────────
  const { data: existing } = await supabase
    .from("subscription_events")
    .select("id")
    .eq("stripe_event_id", event.id)
    .maybeSingle();

  if (existing) {
    console.log(`[stripe-webhook] Event ${event.id} already processed — skipping`);
    return new Response(JSON.stringify({ received: true, skipped: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  let entityType: "organization" | "profile" | null = null;
  let entityId: string | null = null;

  try {
    // ── checkout.session.completed ─────────────────────────────
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== "subscription" || !session.subscription) {
        return new Response(JSON.stringify({ received: true }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      const sub = await stripe.subscriptions.retrieve(
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription.id,
      );

      const resolved = await resolveEntityFromSubscription(supabase, sub);
      if (!resolved) {
        console.error("[stripe-webhook] Could not resolve entity for checkout session", session.id);
        return new Response("Entity not found", { status: 404 });
      }

      entityType = resolved.entityType;
      entityId = resolved.entityId;

      const plan = (sub.metadata?.plan as string | undefined) ?? null;
      const quantity = sub.items.data[0]?.quantity ?? 1;

      await updateEntitySubscription(supabase, entityType, entityId, {
        stripe_subscription_id: sub.id,
        subscription_status: stripeStatusToLocal(sub.status),
        subscription_plan: plan,
        subscription_quantity: quantity,
        current_period_end: sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString()
          : null,
        trial_ends_at: sub.trial_end
          ? new Date(sub.trial_end * 1000).toISOString()
          : null,
      });

    // ── customer.subscription.created / updated ────────────────
    } else if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated"
    ) {
      const sub = event.data.object as Stripe.Subscription;
      const resolved = await resolveEntityFromSubscription(supabase, sub);
      if (!resolved) {
        console.warn("[stripe-webhook] Could not resolve entity for subscription", sub.id);
        return new Response(JSON.stringify({ received: true }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      entityType = resolved.entityType;
      entityId = resolved.entityId;

      const plan = (sub.metadata?.plan as string | undefined) ?? null;
      const quantity = sub.items.data[0]?.quantity ?? 1;

      await updateEntitySubscription(supabase, entityType, entityId, {
        stripe_subscription_id: sub.id,
        subscription_status: stripeStatusToLocal(sub.status),
        subscription_plan: plan,
        subscription_quantity: quantity,
        current_period_end: sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString()
          : null,
        trial_ends_at: sub.trial_end
          ? new Date(sub.trial_end * 1000).toISOString()
          : null,
      });

    // ── customer.subscription.deleted ─────────────────────────
    } else if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object as Stripe.Subscription;
      const resolved = await resolveEntityFromSubscription(supabase, sub);
      if (!resolved) {
        console.warn("[stripe-webhook] Could not resolve entity for deleted subscription", sub.id);
        return new Response(JSON.stringify({ received: true }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      entityType = resolved.entityType;
      entityId = resolved.entityId;

      await updateEntitySubscription(supabase, entityType, entityId, {
        subscription_status: "canceled",
        current_period_end: sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString()
          : null,
      });

    // ── invoice.payment_succeeded ──────────────────────────────
    } else if (event.type === "invoice.payment_succeeded") {
      const invoice = event.data.object as Stripe.Invoice;
      if (!invoice.subscription) {
        return new Response(JSON.stringify({ received: true }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      const sub = await stripe.subscriptions.retrieve(
        typeof invoice.subscription === "string"
          ? invoice.subscription
          : invoice.subscription.id,
      );

      const resolved = await resolveEntityFromSubscription(supabase, sub);
      if (resolved) {
        entityType = resolved.entityType;
        entityId = resolved.entityId;

        await updateEntitySubscription(supabase, entityType, entityId, {
          subscription_status: "active",
          current_period_end: sub.current_period_end
            ? new Date(sub.current_period_end * 1000).toISOString()
            : null,
        });
      }

    // ── invoice.payment_failed ─────────────────────────────────
    } else if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object as Stripe.Invoice;
      if (!invoice.subscription) {
        return new Response(JSON.stringify({ received: true }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      const sub = await stripe.subscriptions.retrieve(
        typeof invoice.subscription === "string"
          ? invoice.subscription
          : invoice.subscription.id,
      );

      const resolved = await resolveEntityFromSubscription(supabase, sub);
      if (resolved) {
        entityType = resolved.entityType;
        entityId = resolved.entityId;

        // Set past_due only if subscription itself says so (first failure may not be past_due yet)
        if (sub.status === "past_due" || sub.status === "unpaid") {
          await updateEntitySubscription(supabase, entityType, entityId, {
            subscription_status: stripeStatusToLocal(sub.status),
          });
        }
      }
    }

    // ── Log event ──────────────────────────────────────────────
    if (entityType && entityId) {
      await supabase.from("subscription_events").insert({
        stripe_event_id: event.id,
        event_type: event.type,
        entity_type: entityType,
        entity_id: entityId,
        stripe_data: { object: event.data.object },
      });
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[stripe-webhook] Handler error:", message);
    // Return 200 to Stripe even on internal errors to prevent infinite retries.
    // The event will be in subscription_events (or not) — investigate via Stripe dashboard.
    return new Response(JSON.stringify({ received: true, error: message }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
});
