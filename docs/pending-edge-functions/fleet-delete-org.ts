// ============================================================
// fleet-delete-org — Supabase Edge Function
// ============================================================
// Purpose: Permanently deletes an organization and all associated data.
//
// Order of operations (critical — do NOT reorder):
//   1. Verify JWT → confirm caller is org admin
//   2. Best-effort: offboard telemetry from all org vehicles (push empty config)
//   3. Optionally delete driver auth accounts (admin's choice)
//   4. DELETE organization row → CASCADE handles members, vehicles, assignments,
//      invitations, tags
//
// Why offboard BEFORE delete:
//   CASCADE deletes organization_vehicles, and driver accounts (if toggled)
//   cascade-delete tesla_tokens. Without tokens we can't call Tesla to
//   remove the streaming config — the car would keep streaming indefinitely.
//
// Auth: verify_jwt: false (ES256 vs HS256 mismatch). Manual JWT verification.
//
// Body: { delete_driver_accounts: boolean }
//
// Deployment:
//   supabase functions deploy fleet-delete-org --no-verify-jwt \
//     --project-ref bfbdoamqywlkgynjgway
// ============================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const TESLA_PROXY_HOST =
  Deno.env.get("TESLA_PROXY_HOST") ?? "telemetry.millogapp.se";
const TESLA_PROXY_PORT = parseInt(Deno.env.get("TESLA_PROXY_PORT") ?? "4443");
const TELEMETRY_SERVER_HOST =
  Deno.env.get("TELEMETRY_SERVER_HOST") ?? "telemetry.millogapp.se";

// TLS certificate chain for the fleet-telemetry server (Let's Encrypt E7).
// Must stay in sync with send-telemetry-config, delete-account, admin-offboard-vehicle.
const TELEMETRY_TLS_CERT = `-----BEGIN CERTIFICATE-----
MIIDlDCCAxugAwIBAgISBR5ehiio7eElS1npBtgMYVGJMAoGCCqGSM49BAMDMDIx
CzAJBgNVBAYTAlVTMRYwFAYDVQQKEw1MZXQncyBFbmNyeXB0MQswCQYDVQQDEwJF
NzAeFw0yNjAzMDkxNzQzMjNaFw0yNjA2MDcxNzQzMjJaMCExHzAdBgNVBAMTFnRl
bGVtZXRyeS5taWxsb2dhcHAuc2UwWTATBgcqhkjOPQIBBggqhkjOPQMBBwNCAASa
IxCbYpvIibfwy7IKE68sqcJKHRDFWSWqeb0DM4dkHeBsM4jnVBg7CcfBkkWkXM4G
X/CIRXMJqvXVR8hh6m+Qo4ICIDCCAhwwDgYDVR0PAQH/BAQDAgeAMBMGA1UdJQQM
MAoGCCsGAQUFBwMBMAwGA1UdEwEB/wQCMAAwHQYDVR0OBBYEFMb053C9TLwcb37E
mK2c5QJYXwx3MB8GA1UdIwQYMBaAFK5IntyHHUSgb9qi5WB0BHjCnACAMDIGCCsG
AQUFBwEBBCYwJDAiBggrBgEFBQcwAoYWaHR0cDovL2U3LmkubGVuY3Iub3JnLzAh
BgNVHREEGjAYghZ0ZWxlbWV0cnkubWlsbG9nYXBwLnNlMBMGA1UdIAQMMAowCAYG
Z4EMAQIBMC0GA1UdHwQmMCQwIqAgoB6GHGh0dHA6Ly9lNy5jLmxlbmNyLm9yZy8x
MC5jcmwwggEKBgorBgEEAdZ5AgQCBIH7BIH4APYAfQDjI43yjaKI4KrgrPD6kMmF
8La/9dKlJ7AB/BxEWMS26AAAAZzT59tzAAgAAAUANQnXzAQDAEYwRAIgKz37XmwB
kueQh28XnVCeeUb+3RE/ddXeVQ11j548/PsCIB+KNEkLWbOdCVh7b9lDN2mOL/0K
CcFA8ywdQmRc+asuAHUAlpdkv1VYl633Q4doNwhCd+nwOtX2pPM2bkakPw/KqcYA
AAGc0+frSAAABAMARjBEAiBE3uVB1902u0bWU1KAa+cInu0cBenBZLFp2ZA1MOwc
1AIgbvuZNV5uA3EgJcreFZMwStK+gFQ452LaKBHuWSVzyEkwCgYIKoZIzj0EAwMD
ZwAwZAIwMXoFR03A84ZGJX/LvO6Y6ON6EVilRuiAuyWO4isnFSQgQmOekeCnzSaf
fxS1o270AjBHZU1XHRrLXnwmQ0cQaJRM9jysyckwHCEsCX2361biSiXTt1BBlTUz
75SB6r1w27o=
-----END CERTIFICATE-----
-----BEGIN CERTIFICATE-----
MIIEVzCCAj+gAwIBAgIRAKp18eYrjwoiCWbTi7/UuqEwDQYJKoZIhvcNAQELBQAw
TzELMAkGA1UEBhMCVVMxKTAnBgNVBAoTIEludGVybmV0IFNlY3VyaXR5IFJlc2Vh
cmNoIEdyb3VwMRUwEwYDVQQDEwxJU1JHIFJvb3QgWDEwHhcNMjQwMzEzMDAwMDAw
WhcNMjcwMzEyMjM1OTU5WjAyMQswCQYDVQQGEwJVUzEWMBQGA1UEChMNTGV0J3Mg
RW5jcnlwdDELMAkGA1UEAxMCRTcwdjAQBgcqhkjOPQIBBgUrgQQAIgNiAARB6AST
CFh/vjcwDMCgQer+VtqEkz7JANurZxLP+U9TCeioL6sp5Z8VRvRbYk4P1INBmbef
QHJFHCxcSjKmwtvGBWpl/9ra8HW0QDsUaJW2qOJqceJ0ZVFT3hbUHifBM/2jgfgw
gfUwDgYDVR0PAQH/BAQDAgGGMB0GA1UdJQQWMBQGCCsGAQUFBwMCBggrBgEFBQcD
ATASBgNVHRMBAf8ECDAGAQH/AgEAMB0GA1UdDgQWBBSuSJ7chx1EoG/aouVgdAR4
wpwAgDAfBgNVHSMEGDAWgBR5tFnme7bl5AFzgAiIyBpY9umbbjAyBggrBgEFBQcB
AQQmMCQwIgYIKwYBBQUHMAKGFmh0dHA6Ly94MS5pLmxlbmNyLm9yZy8wEwYDVR0g
BAwwCjAIBgZngQwBAgEwJwYDVR0fBCAwHjAcoBqgGIYWaHR0cDovL3gxLmMubGVu
Y3Iub3JnLzANBgkqhkiG9w0BAQsFAAOCAgEAjx66fDdLk5ywFn3CzA1w1qfylHUD
aEf0QZpXcJseddJGSfbUUOvbNR9N/QQ16K1lXl4VFyhmGXDT5Kdfcr0RvIIVrNxF
h4lqHtRRCP6RBRstqbZ2zURgqakn/Xip0iaQL0IdfHBZr396FgknniRYFckKORPG
yM3QKnd66gtMst8I5nkRQlAg/Jb+Gc3egIvuGKWboE1G89NTsN9LTDD3PLj0dUMr
OIuqVjLB8pEC6yk9enrlrqjXQgkLEYhXzq7dLafv5Vkig6Gl0nuuqjqfp0Q1bi1o
yVNAlXe6aUXw92CcghC9bNsKEO1+M52YY5+ofIXlS/SEQbvVYYBLZ5yeiglV6t3S
M6H+vTG0aP9YHzLn/KVOHzGQfXDP7qM5tkf+7diZe7o2fw6O7IvN6fsQXEQQj8TJ
UXJxv2/uJhcuy/tSDgXwHM8Uk34WNbRT7zGTGkQRX0gsbjAea/jYAoWv0ZvQRwpq
Pe79D/i7Cep8qWnA+7AE/3B3S/3dEEYmc0lpe1366A/6GEgk3ktr9PEoQrLChs6I
tu3wnNLB2euC8IKGLQFpGtOO/2/hiAKjyajaBP25w1jF0Wl8Bbqne3uZ2q1GyPFJ
YRmT7/OXpmOH/FVLtwS+8ng1cAmpCujPwteJZNcDG0sF2n/sc0+SQf49fdyUK0ty
+VUwFj9tmWxyR/M=
-----END CERTIFICATE-----
`;

/** Mask VIN for logging — never log full VINs (PII rule). */
function maskVin(vin: string): string {
  return vin.length > 4 ? `***${vin.slice(-4)}` : "***";
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // ── 1. Verify JWT — get caller identity ───────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ error: "Unauthorized" }, 401);
  }

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser();
  if (authError || !user) {
    return json({ error: "Unauthorized" }, 401);
  }

  // Service-role client for privileged operations
  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ── 2. Verify caller is admin of the organization ─────────────────
  const { data: membership, error: memberErr } = await adminClient
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .eq("status", "active")
    .single();

  if (memberErr || !membership || membership.role !== "admin") {
    return json({ error: "Forbidden — admin role required" }, 403);
  }

  const orgId = membership.organization_id;

  // Parse request body
  let deleteDriverAccounts = false;
  try {
    const body = await req.json();
    deleteDriverAccounts = body.delete_driver_accounts === true;
  } catch {
    // Body is optional — default to not deleting accounts
  }

  // ── 3. Fetch all org members (needed for account deletion + logging) ──
  const { data: members } = await adminClient
    .from("organization_members")
    .select("user_id, role")
    .eq("organization_id", orgId);

  const otherMemberIds = (members ?? [])
    .filter((m: { user_id: string }) => m.user_id !== user.id)
    .map((m: { user_id: string }) => m.user_id);

  // ── 4. Fetch org vehicles with owners for telemetry offboarding ───
  const { data: orgVehicles } = await adminClient
    .from("organization_vehicles")
    .select("vehicle_id")
    .eq("organization_id", orgId);

  let offboardedCount = 0;

  if (orgVehicles && orgVehicles.length > 0) {
    const vehicleIds = orgVehicles.map(
      (v: { vehicle_id: string }) => v.vehicle_id,
    );

    // Find telemetry-enabled vehicles with their VINs and owner tokens
    const { data: vehicles } = await adminClient
      .from("vehicles")
      .select("id, vin, user_id, telemetry_enabled")
      .in("id", vehicleIds)
      .eq("telemetry_enabled", true);

    if (vehicles && vehicles.length > 0) {
      // Best-effort offboard all telemetry vehicles in parallel
      try {
        const results = await Promise.race([
          offboardVehicles(adminClient, vehicles),
          new Promise<number>((_, reject) =>
            setTimeout(
              () => reject(new Error("Global offboard timeout (30s)")),
              30_000,
            ),
          ),
        ]);
        offboardedCount = results;
      } catch (err) {
        console.error(
          `[FLEET-DELETE-ORG] Offboard failed (non-blocking): ${(err as Error).message}`,
        );
      }
    }
  }

  // ── 5. Optionally delete driver auth accounts ─────────────────────
  let deletedAccounts = 0;

  if (deleteDriverAccounts && otherMemberIds.length > 0) {
    for (const userId of otherMemberIds) {
      try {
        const { error: delErr } =
          await adminClient.auth.admin.deleteUser(userId);
        if (!delErr) {
          deletedAccounts++;
        } else {
          console.error(
            `[FLEET-DELETE-ORG] Failed to delete user ${userId}: ${delErr.message}`,
          );
        }
      } catch (err) {
        console.error(
          `[FLEET-DELETE-ORG] Error deleting user ${userId}: ${(err as Error).message}`,
        );
      }
    }
  }

  // ── 6. Delete organization — CASCADE handles all related rows ─────
  const { error: deleteError } = await adminClient
    .from("organizations")
    .delete()
    .eq("id", orgId);

  if (deleteError) {
    console.error(
      `[FLEET-DELETE-ORG] Failed to delete org ${orgId}: ${deleteError.message}`,
    );
    return json(
      { error: "Radering misslyckades", detail: deleteError.message },
      500,
    );
  }

  console.log(
    `[FLEET-DELETE-ORG] Deleted org ${orgId} — offboarded: ${offboardedCount}, accounts deleted: ${deletedAccounts}`,
  );

  return json({
    success: true,
    offboarded_vehicles: offboardedCount,
    deleted_accounts: deletedAccounts,
  });
});

/**
 * Offboard all telemetry-enabled vehicles by pushing empty config.
 *
 * Groups vehicles by owner (user_id) since each Tesla API call requires
 * that user's refresh token. Runs all owners in parallel.
 *
 * Returns the count of successfully offboarded vehicles.
 */
async function offboardVehicles(
  adminClient: ReturnType<typeof createClient>,
  vehicles: Array<{
    id: string;
    vin: string;
    user_id: string;
    telemetry_enabled: boolean;
  }>,
): Promise<number> {
  // Group VINs by owner (user_id)
  const ownerVins = new Map<string, string[]>();
  for (const v of vehicles) {
    if (!v.vin || !v.user_id) continue;
    const list = ownerVins.get(v.user_id) ?? [];
    list.push(v.vin);
    ownerVins.set(v.user_id, list);
  }

  if (ownerVins.size === 0) return 0;

  const clientId = Deno.env.get("TESLA_CLIENT_ID");
  const clientSecret = Deno.env.get("TESLA_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    console.error(
      "[FLEET-DELETE-ORG] Missing TESLA_CLIENT_ID or TESLA_CLIENT_SECRET",
    );
    return 0;
  }

  let total = 0;

  // Process each owner in parallel
  const tasks = Array.from(ownerVins.entries()).map(
    async ([userId, vins]): Promise<number> => {
      // Fetch the owner's refresh token
      const { data: tokenRow, error: tErr } = await adminClient
        .from("tesla_tokens")
        .select("refresh_token")
        .eq("user_id", userId)
        .single();

      if (tErr || !tokenRow?.refresh_token) {
        console.log(
          `[FLEET-DELETE-ORG] No Tesla token for user (skipping ${vins.length} vehicles)`,
        );
        return 0;
      }

      // Refresh Tesla access token
      const tokenRes = await fetch("https://auth.tesla.com/oauth2/v3/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: tokenRow.refresh_token,
        }),
      });

      if (!tokenRes.ok) {
        console.error(
          `[FLEET-DELETE-ORG] Tesla token refresh failed (${tokenRes.status})`,
        );
        return 0;
      }

      const { access_token } = await tokenRes.json();
      if (!access_token) return 0;

      // Push empty config to each VIN
      const proxyUrl = `https://${TESLA_PROXY_HOST}:${TESLA_PROXY_PORT}/api/1/vehicles/fleet_telemetry_config`;
      let count = 0;

      for (const vin of vins) {
        try {
          const res = await fetch(proxyUrl, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${access_token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              vins: [vin],
              config: {
                hostname: TELEMETRY_SERVER_HOST,
                port: 8443,
                ca: TELEMETRY_TLS_CERT,
                fields: {}, // empty = car stops streaming all signals
              },
            }),
          });

          const body = await res.text();
          console.log(
            `[FLEET-DELETE-ORG] Offboard ${maskVin(vin)}: ${res.status} ${body}`,
          );
          if (res.ok) count++;
        } catch (err) {
          console.error(
            `[FLEET-DELETE-ORG] Offboard ${maskVin(vin)} failed: ${(err as Error).message}`,
          );
        }
      }

      return count;
    },
  );

  const results = await Promise.allSettled(tasks);
  for (const r of results) {
    if (r.status === "fulfilled") total += r.value;
  }

  return total;
}
