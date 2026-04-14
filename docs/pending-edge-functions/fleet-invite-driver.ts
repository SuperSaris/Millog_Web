// ============================================================
// fleet-invite-driver — Supabase Edge Function (DEPLOYED v1)
// ============================================================
// Deployed 2026-04-14. SMTP needed for magic links. This local file is kept as reference.
//
// Purpose: Admin invites a driver. Creates a Supabase auth user
//          via admin API (magic link), inserts organization_member
//          row with status: 'invited'.
//
// Auth: Requires valid Supabase JWT (an admin of the organization).
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
  const { organization_id, email, name, role } = body;

  // Validate input
  if (!organization_id || !email) {
    return new Response(JSON.stringify({ error: "organization_id and email required" }), { status: 400 });
  }

  const validRoles = ["driver", "admin", "viewer"];
  const memberRole = validRoles.includes(role) ? role : "driver";

  // Verify caller is admin of this org
  const { data: callerMember } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", organization_id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .single();

  if (!callerMember || callerMember.role !== "admin") {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }

  // Create or get user via admin API
  // inviteUserByEmail sends a magic link email (requires SMTP to be configured)
  const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
    email.trim(),
    {
      redirectTo: `${Deno.env.get("SITE_URL") ?? "https://app.millogapp.se"}/accept-invite`,
      data: { full_name: name?.trim() || null },
    },
  );

  if (inviteError) {
    // User might already exist — try to look them up
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existing = existingUsers?.users?.find(
      (u: { email?: string }) => u.email?.toLowerCase() === email.trim().toLowerCase(),
    );

    if (!existing) {
      return new Response(JSON.stringify({ error: inviteError.message }), { status: 500 });
    }

    // Add existing user to org
    const { error: memberError } = await supabase
      .from("organization_members")
      .insert({
        organization_id,
        user_id: existing.id,
        role: memberRole,
        status: "invited",
      });

    if (memberError) {
      return new Response(JSON.stringify({ error: memberError.message }), { status: 500 });
    }

    return new Response(JSON.stringify({ user_id: existing.id, existing: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Insert organization_member for the newly invited user
  const { error: memberError } = await supabase
    .from("organization_members")
    .insert({
      organization_id,
      user_id: inviteData.user.id,
      role: memberRole,
      status: "invited",
    });

  if (memberError) {
    return new Response(JSON.stringify({ error: memberError.message }), { status: 500 });
  }

  // Update profile name if provided
  if (name?.trim()) {
    await supabase
      .from("profiles")
      .upsert({ id: inviteData.user.id, full_name: name.trim(), email: email.trim() });
  }

  return new Response(JSON.stringify({ user_id: inviteData.user.id }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
