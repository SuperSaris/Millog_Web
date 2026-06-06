import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ContactPayload {
  name: string;
  email: string;
  subject: string;
  message: string;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  let payload: ContactPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const { name, email, subject, message } = payload;

  // Input validation
  if (!name?.trim() || !email?.trim() || !subject?.trim() || !message?.trim()) {
    return new Response(JSON.stringify({ error: "All fields are required" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  if (!isValidEmail(email)) {
    return new Response(JSON.stringify({ error: "Invalid email address" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // Sanitise inputs — strip any HTML to prevent injection in the email body
  const safeName = name.trim().replace(/</g, "&lt;").replace(/>/g, "&gt;").slice(0, 200);
  const safeEmail = email.trim().slice(0, 254);
  const safeSubject = subject.trim().replace(/</g, "&lt;").replace(/>/g, "&gt;").slice(0, 300);
  const safeMessage = message.trim().replace(/</g, "&lt;").replace(/>/g, "&gt;").slice(0, 5000);

  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) {
    console.error("RESEND_API_KEY is not set");
    return new Response(JSON.stringify({ error: "Service unavailable" }), {
      status: 503,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const emailBody = {
    from: "Millog Support <noreply@millogapp.se>",
    to: ["support@millogapp.se"],
    reply_to: safeEmail,
    subject: `[Support] ${safeSubject}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #111; border-bottom: 1px solid #eee; padding-bottom: 12px;">
          Nytt supportmeddelande
        </h2>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr>
            <td style="padding: 8px 0; color: #666; width: 100px; vertical-align: top;"><strong>Namn:</strong></td>
            <td style="padding: 8px 0; color: #111;">${safeName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666; vertical-align: top;"><strong>E-post:</strong></td>
            <td style="padding: 8px 0; color: #111;">
              <a href="mailto:${safeEmail}" style="color: #0066cc;">${safeEmail}</a>
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666; vertical-align: top;"><strong>Ämne:</strong></td>
            <td style="padding: 8px 0; color: #111;">${safeSubject}</td>
          </tr>
        </table>
        <div style="background: #f9f9f9; border-radius: 8px; padding: 16px; white-space: pre-wrap; color: #111; font-size: 14px; line-height: 1.6;">
${safeMessage}
        </div>
        <p style="margin-top: 24px; color: #999; font-size: 12px;">
          Skickat via millogapp.se/support
        </p>
      </div>
    `,
  };

  const resendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(emailBody),
  });

  if (!resendRes.ok) {
    const errText = await resendRes.text();
    console.error("Resend API error:", resendRes.status, errText);
    return new Response(JSON.stringify({ error: "Failed to send email" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
});
