// ============================================================
// fleet-generate-report — Supabase Edge Function (DEPLOYED v1, scaffold)
// ============================================================
// Deployed 2026-04-14. Returns 501 — report logic not yet implemented.
//
// Purpose: Generates fleet reports (drive log CSV, fleet overview PDF,
//          tax/Skatteverket format) for a given organization + period.
//
// Auth: Requires valid Supabase JWT (admin or viewer of the org).
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
  const { organization_id, from, to, format } = body;

  if (!organization_id || !from || !to || !format) {
    return new Response(
      JSON.stringify({ error: "organization_id, from, to, and format are required" }),
      { status: 400 },
    );
  }

  // Validate format enum
  const validFormats = ["csv", "pdf", "skatteverket"];
  if (!validFormats.includes(format)) {
    return new Response(
      JSON.stringify({ error: `format must be one of: ${validFormats.join(", ")}` }),
      { status: 400 },
    );
  }

  // Validate date formats (YYYY-MM-DD)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(from) || !dateRegex.test(to)) {
    return new Response(
      JSON.stringify({ error: "from and to must be YYYY-MM-DD format" }),
      { status: 400 },
    );
  }

  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    return new Response(
      JSON.stringify({ error: "Invalid date values" }),
      { status: 400 },
    );
  }

  if (fromDate > toDate) {
    return new Response(
      JSON.stringify({ error: "'from' must be before or equal to 'to'" }),
      { status: 400 },
    );
  }

  // Cap report period at 1 year to prevent excessive queries
  const oneYear = 366 * 24 * 60 * 60 * 1000;
  if (toDate.getTime() - fromDate.getTime() > oneYear) {
    return new Response(
      JSON.stringify({ error: "Report period cannot exceed 1 year" }),
      { status: 400 },
    );
  }

  // Verify caller is admin or viewer of this org
  const { data: callerMember } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", organization_id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .single();

  if (!callerMember || !["admin", "viewer"].includes(callerMember.role)) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }

  // TODO: Implement report generation based on format
  // - "csv": Build CSV of all trips in period for all org drivers
  // - "pdf": Build PDF fleet overview summary
  // - "skatteverket": Build Skatteverket-compatible tax report

  // Placeholder response
  return new Response(
    JSON.stringify({
      message: "Report generation not yet implemented",
      format,
      from,
      to,
    }),
    { status: 501, headers: { "Content-Type": "application/json" } },
  );
});
