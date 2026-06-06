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

type EntitlementSource = "none" | "stripe" | "revenuecat" | "combined" | "manual";

type EntitlementRow = {
  user_id: string;
  is_active: boolean;
  status: string | null;
  expires_at: string | null;
  source: EntitlementSource;
  plan: string | null;
  revenuecat_is_active: boolean;
  revenuecat_status: string | null;
  revenuecat_expires_at: string | null;
};

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

function maxIsoDate(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

function isEntitlementActive(status: SubscriptionStatus, expiresAt: string | null): boolean {
  if (status === "active" || status === "trialing") return true;
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() > Date.now();
}

async function upsertProfileEntitlementFromStripe(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  fields: {
    stripeStatus: SubscriptionStatus;
    stripeExpiresAt: string | null;
    stripeSubscriptionId: string | null;
    stripeCustomerId: string | null;
    plan: string | null;
    eventType: string;
  },
) {
  const { data: existing } = await supabase
    .from("entitlements")
    .select("user_id, is_active, status, expires_at, source, plan, revenuecat_is_active, revenuecat_status, revenuecat_expires_at")
    .eq("user_id", userId)
    .maybeSingle();

  const current = (existing as EntitlementRow | null) ?? null;
  const revenuecatActive = current?.revenuecat_is_active ?? false;
  const revenuecatStatus = current?.revenuecat_status ?? null;
  const revenuecatExpiresAt = current?.revenuecat_expires_at ?? null;

  const stripeActive = isEntitlementActive(fields.stripeStatus, fields.stripeExpiresAt);
  const mergedActive = stripeActive || revenuecatActive;
  const mergedSource: EntitlementSource = stripeActive && revenuecatActive
    ? "combined"
    : stripeActive
    ? "stripe"
    : revenuecatActive
    ? "revenuecat"
    : "none";

  const mergedStatus = stripeActive
    ? fields.stripeStatus
    : revenuecatActive
    ? revenuecatStatus
    : fields.stripeStatus;

  const mergedExpiresAt = maxIsoDate(fields.stripeExpiresAt, revenuecatExpiresAt);

  const { error } = await supabase
    .from("entitlements")
    .upsert(
      {
        user_id: userId,
        is_active: mergedActive,
        status: mergedStatus,
        expires_at: mergedExpiresAt,
        source: mergedSource,
        plan: fields.plan ?? current?.plan ?? null,
        stripe_is_active: stripeActive,
        stripe_status: fields.stripeStatus,
        stripe_expires_at: fields.stripeExpiresAt,
        stripe_subscription_id: fields.stripeSubscriptionId,
        stripe_customer_id: fields.stripeCustomerId,
        revenuecat_is_active: revenuecatActive,
        revenuecat_status: revenuecatStatus,
        revenuecat_expires_at: revenuecatExpiresAt,
        last_event_source: "stripe",
        last_event_type: fields.eventType,
        last_event_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

  if (error) {
    console.error("[stripe-webhook] Failed to upsert entitlements:", error.message);
    throw error;
  }
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

  // profiles table has no subscription_quantity column — fleet-only field
  const updateFields = { ...fields };
  if (entityType === "profile") {
    delete (updateFields as Record<string, unknown>).subscription_quantity;
  }

  const { error } = await supabase
    .from(table)
    .update(updateFields)
    .eq("id", entityId);

  if (error) {
    console.error(`[stripe-webhook] Failed to update ${table}:`, error.message);
    throw error;
  }
}

// Disable telemetry locally for all of a user's vehicles, then enqueue
// pending_offboards rows for the Tesla ones so the cron worker can DELETE
// the fleet_telemetry_config upstream using the partner token.
//
// Enode vehicles only need the local flag flipped (no upstream config exists;
// enode-webhook gates inserts on telemetry_enabled).
//
// Safety:
//   - reason is constrained by DB CHECK to one of:
//     account_deleted | subscription_expired | admin_action | user_offboard_request
//     We use "subscription_expired".
//   - Peer-guard for shared VINs is enforced by process-offboard-queue at
//     execution time (its own SELECT with telemetry_enabled=true), so we do
//     NOT need to filter peers here.
//   - Idempotent in practice: re-running for the same user with telemetry
//     already disabled returns zero vehicles and inserts nothing.
async function offboardProfileVehicles(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<void> {
  const { data: vehicles, error: vehErr } = await supabase
    .from("vehicles")
    .select("id, vin, provider")
    .eq("user_id", userId)
    .eq("telemetry_enabled", true);

  if (vehErr) throw vehErr;
  if (!vehicles || vehicles.length === 0) {
    console.log(`[stripe-webhook] No telemetry-active vehicles for ${userId}`);
    return;
  }

  const ids = (vehicles as Array<{ id: string }>).map((v) => v.id);
  const { error: updErr } = await supabase
    .from("vehicles")
    .update({ telemetry_enabled: false })
    .in("id", ids);
  if (updErr) throw updErr;

  const teslaQueueRows = (vehicles as Array<{ vin: string | null; provider: string }>)
    .filter((v) => v.provider === "tesla" && typeof v.vin === "string" && v.vin.length === 17)
    .map((v) => ({
      vin: v.vin as string,
      reason: "subscription_expired",
      source_user_id: userId,
    }));

  if (teslaQueueRows.length === 0) {
    console.log(
      `[stripe-webhook] Disabled telemetry for ${vehicles.length} non-Tesla vehicle(s) for ${userId}; no queue rows needed`,
    );
    return;
  }

  const { error: insErr } = await supabase
    .from("pending_offboards")
    .insert(teslaQueueRows);
  if (insErr) throw insErr;

  console.log(
    `[stripe-webhook] Enqueued offboard for ${teslaQueueRows.length} Tesla vehicle(s) for profile ${userId}`,
  );
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

      if (entityType === "profile") {
        await upsertProfileEntitlementFromStripe(supabase, entityId, {
          stripeStatus: stripeStatusToLocal(sub.status),
          stripeExpiresAt: sub.current_period_end
            ? new Date(sub.current_period_end * 1000).toISOString()
            : null,
          stripeSubscriptionId: sub.id,
          stripeCustomerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
          plan,
          eventType: event.type,
        });
      }

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

      if (entityType === "profile") {
        await upsertProfileEntitlementFromStripe(supabase, entityId, {
          stripeStatus: stripeStatusToLocal(sub.status),
          stripeExpiresAt: sub.current_period_end
            ? new Date(sub.current_period_end * 1000).toISOString()
            : null,
          stripeSubscriptionId: sub.id,
          stripeCustomerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
          plan,
          eventType: event.type,
        });
      }

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

      if (entityType === "profile") {
        await upsertProfileEntitlementFromStripe(supabase, entityId, {
          stripeStatus: "canceled",
          stripeExpiresAt: sub.current_period_end
            ? new Date(sub.current_period_end * 1000).toISOString()
            : null,
          stripeSubscriptionId: sub.id,
          stripeCustomerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
          plan: (sub.metadata?.plan as string | undefined) ?? null,
          eventType: event.type,
        });

        // Stop streaming telemetry for this user's vehicles (GDPR / data minimisation).
        // For Tesla vehicles this enqueues a pending_offboards row; the
        // process-offboard-queue cron worker (every 5 min) will perform the
        // actual DELETE /api/1/vehicles/{vin}/fleet_telemetry_config via the
        // partner token, with peer-guard for shared VINs.
        // For Enode vehicles only the local flag is flipped — enode-webhook
        // gates on telemetry_enabled and there is no upstream config to delete.
        // Failures are logged but do NOT throw, because Stripe must receive 200
        // or it will retry the entire webhook.
        try {
          await offboardProfileVehicles(supabase, entityId);
        } catch (err) {
          console.error(
            `[stripe-webhook] offboardProfileVehicles failed for ${entityId}:`,
            err instanceof Error ? err.message : err,
          );
        }
      } else {
        // Fleet org cancellation: vehicles have no organization_id column,
        // so org→vehicle offboarding requires a product decision (driver may
        // hold a personal subscription that should keep telemetry alive).
        // Tracked separately; emit a structured warning for visibility.
        console.warn(
          `[stripe-webhook] Organization subscription canceled (${entityId}) — fleet vehicle offboard not implemented`,
        );
      }

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

        if (entityType === "profile") {
          await upsertProfileEntitlementFromStripe(supabase, entityId, {
            stripeStatus: "active",
            stripeExpiresAt: sub.current_period_end
              ? new Date(sub.current_period_end * 1000).toISOString()
              : null,
            stripeSubscriptionId: sub.id,
            stripeCustomerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
            plan: (sub.metadata?.plan as string | undefined) ?? null,
            eventType: event.type,
          });
        }
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

          if (entityType === "profile") {
            await upsertProfileEntitlementFromStripe(supabase, entityId, {
              stripeStatus: stripeStatusToLocal(sub.status),
              stripeExpiresAt: sub.current_period_end
                ? new Date(sub.current_period_end * 1000).toISOString()
                : null,
              stripeSubscriptionId: sub.id,
              stripeCustomerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
              plan: (sub.metadata?.plan as string | undefined) ?? null,
              eventType: event.type,
            });
          }
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
