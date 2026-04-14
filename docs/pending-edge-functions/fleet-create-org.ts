// ============================================================
// fleet-create-org — Supabase Edge Function (DEPLOYED v2)
// ============================================================
// Deployed 2026-04-14 (v1), updated 2026-04-15 (v2).
// This local file is kept as reference.
//
// Purpose: Called after admin signup wizard. Creates organization row
//          (with billing_email + settings JSONB) and first
//          organization_member row (role: admin, status: active).
//
// Auth: Requires valid Supabase JWT (the newly signed-up user).
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Verify caller
  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
  }

  const body = await req.json();
  const { company_name, org_number, billing_email, settings } = body;

  if (!company_name || typeof company_name !== "string" || company_name.trim().length === 0) {
    return new Response(JSON.stringify({ error: "company_name required" }), { status: 400 });
  }

  // Build insert payload — only include optional fields if provided
  const orgPayload: Record<string, unknown> = {
    name: company_name.trim(),
    org_number: org_number?.trim() || null,
  };

  if (billing_email && typeof billing_email === "string") {
    orgPayload.billing_email = billing_email.trim();
  }

  if (settings && typeof settings === "object") {
    orgPayload.settings = settings;
  }

  // Create organization
  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .insert(orgPayload)
    .select("id")
    .single();

  if (orgError) {
    return new Response(JSON.stringify({ error: orgError.message }), { status: 500 });
  }

  // Create first admin member
  const { error: memberError } = await supabase
    .from("organization_members")
    .insert({
      organization_id: org.id,
      user_id: user.id,
      role: "admin",
      status: "active",
      activated_at: new Date().toISOString(),
    });

  if (memberError) {
    return new Response(JSON.stringify({ error: memberError.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ organization_id: org.id }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
