import nodemailer from "nodemailer";
import twilio from "twilio";
import { db, buyerLeadsTable, scraperLeadsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// ----- Gmail SMTP client (env vars: GMAIL_USER + GMAIL_APP_PASSWORD) -----
async function getEmailTransport() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) throw new Error("GMAIL_USER or GMAIL_APP_PASSWORD not set");
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: { user, pass },
  });
  return { transporter, fromEmail: user };
}

// ----- Twilio client (env vars: TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM_NUMBER) -----
async function getTwilioCredentials() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;
  if (!accountSid || !authToken) throw new Error("Twilio env vars not set (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN)");
  return { accountSid, authToken, fromNumber: fromNumber ?? "" };
}

// ----- Lead payload type -----
export interface LeadPayload {
  leadId?: number;
  buyerLeadId?: number;
  scraperLeadId?: number;
  leadSource: string;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  message?: string | null;
  listingSnapshot?: Record<string, unknown>;
  buyerProfile?: Record<string, unknown>;
  dealerName?: string | null;
  dealerEmail?: string | null;
  listingTitle?: string | null;
  listingUrl?: string | null;
}

// ----- Helpers -----
function rvTitle(payload: LeadPayload): string {
  const snap = payload.listingSnapshot ?? {};
  const year = snap.year ?? snap.modelYear ?? "";
  const make = snap.make ?? snap.manufacturer ?? "";
  const model = snap.model ?? snap.modelName ?? "";
  const title = payload.listingTitle ?? snap.title ?? snap.listingTitle;
  if (title) return String(title);
  if (year || make || model) return [year, make, model].filter(Boolean).join(" ");
  return "RV Listing";
}

function rvPrice(payload: LeadPayload): string {
  const snap = payload.listingSnapshot ?? {};
  const price = snap.price ?? snap.listPrice ?? snap.salePrice;
  if (price) return `$${Number(price).toLocaleString()}`;
  return "Price not listed";
}

// ----- SMS -----
async function sendSms(payload: LeadPayload): Promise<void> {
  const title = rvTitle(payload);
  const price = rvPrice(payload);
  const msgPreview = payload.message
    ? `\nMsg: ${payload.message.slice(0, 100)}${payload.message.length > 100 ? "…" : ""}`
    : "";
  const body =
    `New MatchRV Lead!\n` +
    `Buyer: ${payload.contactName ?? "Unknown"}\n` +
    `RV: ${title} — ${price}\n` +
    `Phone: ${payload.contactPhone ?? "—"}\n` +
    `Email: ${payload.contactEmail ?? "—"}` +
    msgPreview;

  // Try Twilio first — supports comma-separated SMS_ALERT_TO for multiple recipients
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;
  const smsAlertTo = process.env.SMS_ALERT_TO;
  if (twilioSid && twilioToken && smsAlertTo) {
    try {
      const { fromNumber } = await getTwilioCredentials();
      const client = twilio(twilioSid, twilioToken);
      const recipients = smsAlertTo.split(",").map((n) => n.trim()).filter(Boolean);
      await Promise.all(
        recipients.map((to) => client.messages.create({ to, from: fromNumber, body }))
      );
      console.log(`[notifyLead] SMS sent via Twilio → ${recipients.join(", ")}`);
      return;
    } catch (err) {
      console.warn("[notifyLead] Twilio failed, falling back to ntfy:", (err as Error).message);
    }
  }

  // Fall back to ntfy.sh push notification
  const ntfyTopic = process.env.NTFY_TOPIC;
  if (ntfyTopic) {
    await fetch(`https://ntfy.sh/${ntfyTopic}`, {
      method: "POST",
      headers: {
        "Title": "New MatchRV Lead",
        "Priority": "high",
        "Tags": "rv,moneybag",
        "Content-Type": "text/plain",
      },
      body,
    });
    console.log(`[notifyLead] Push notification sent via ntfy.sh → ${ntfyTopic}`);
    return;
  }

  console.warn("[notifyLead] No push/SMS method configured — skipping (set TWILIO_* or NTFY_TOPIC)");
}

// ----- Email -----
async function sendEmail(payload: LeadPayload): Promise<void> {
  const { transporter, fromEmail } = await getEmailTransport();
  const title = rvTitle(payload);
  const price = rvPrice(payload);
  const snap = payload.listingSnapshot ?? {};
  const profile = payload.buyerProfile ?? {};

  const profileSection =
    Object.keys(profile).length > 0
      ? `
        <h3 style="color:#1a56db;margin-top:24px;">AI Outfitter Buyer Profile</h3>
        <table style="border-collapse:collapse;width:100%">
          ${profile.budget ? `<tr><td style="padding:4px 8px;font-weight:600;width:140px">Budget</td><td style="padding:4px 8px">${profile.budget}</td></tr>` : ""}
          ${profile.experience ? `<tr><td style="padding:4px 8px;font-weight:600">Experience</td><td style="padding:4px 8px">${profile.experience}</td></tr>` : ""}
          ${profile.campingStyle ? `<tr><td style="padding:4px 8px;font-weight:600">Camping Style</td><td style="padding:4px 8px">${profile.campingStyle}</td></tr>` : ""}
          ${profile.summary ? `<tr><td style="padding:4px 8px;font-weight:600;vertical-align:top">Summary</td><td style="padding:4px 8px">${profile.summary}</td></tr>` : ""}
        </table>`
      : "";

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111">
      <div style="background:#1a56db;padding:20px 24px;border-radius:8px 8px 0 0">
        <h1 style="color:#fff;margin:0;font-size:20px">New MatchRV Lead</h1>
        <p style="color:#bfd7ff;margin:4px 0 0">${title}</p>
      </div>
      <div style="border:1px solid #e2e8f0;border-top:none;padding:24px;border-radius:0 0 8px 8px">
        <h3 style="color:#1a56db;margin-top:0">Buyer Contact</h3>
        <table style="border-collapse:collapse;width:100%">
          <tr><td style="padding:4px 8px;font-weight:600;width:140px">Name</td><td style="padding:4px 8px">${payload.contactName ?? "—"}</td></tr>
          <tr><td style="padding:4px 8px;font-weight:600">Email</td><td style="padding:4px 8px">${payload.contactEmail ?? "—"}</td></tr>
          <tr><td style="padding:4px 8px;font-weight:600">Phone</td><td style="padding:4px 8px">${payload.contactPhone ?? "—"}</td></tr>
          <tr><td style="padding:4px 8px;font-weight:600">Lead Source</td><td style="padding:4px 8px">${payload.leadSource}</td></tr>
        </table>

        ${payload.message ? `
        <h3 style="color:#1a56db;margin-top:24px;">Message</h3>
        <p style="background:#f8fafc;padding:12px;border-radius:6px;white-space:pre-wrap">${payload.message}</p>` : ""}

        <h3 style="color:#1a56db;margin-top:24px;">RV Details</h3>
        <table style="border-collapse:collapse;width:100%">
          <tr><td style="padding:4px 8px;font-weight:600;width:140px">Listing</td><td style="padding:4px 8px">${title}</td></tr>
          <tr><td style="padding:4px 8px;font-weight:600">Price</td><td style="padding:4px 8px">${price}</td></tr>
          ${snap.dealer ?? snap.dealerName ? `<tr><td style="padding:4px 8px;font-weight:600">Dealer</td><td style="padding:4px 8px">${snap.dealer ?? snap.dealerName ?? payload.dealerName ?? "—"}</td></tr>` : ""}
          ${payload.listingUrl ?? snap.url ?? snap.listingUrl ? `<tr><td style="padding:4px 8px;font-weight:600">URL</td><td style="padding:4px 8px"><a href="${payload.listingUrl ?? snap.url ?? snap.listingUrl}">${payload.listingUrl ?? snap.url ?? snap.listingUrl}</a></td></tr>` : ""}
        </table>

        ${profileSection}
      </div>
    </div>`;

  await transporter.sendMail({
    to: "sales@matchrv.com",
    from: fromEmail,
    subject: `New MatchRV Lead — ${title}`,
    html,
  });
}

// ----- CRM Failure Alert -----
async function sendCrmFailureAlert(payload: LeadPayload, errorMessage: string): Promise<void> {
  const adminPanelUrl = process.env.ADMIN_PANEL_URL ?? `https://${process.env.REPLIT_DEV_DOMAIN ?? "your-app.replit.app"}/admin/leads`;
  const leadIdLabel = payload.buyerLeadId ?? payload.scraperLeadId ?? payload.leadId ?? "unknown";
  const leadName = payload.contactName ?? "Unknown";
  const leadEmail = payload.contactEmail ?? "—";

  await Promise.allSettled([
    // Email alert
    getEmailTransport()
      .then(({ transporter, fromEmail }) =>
        transporter.sendMail({
          to: "sales@matchrv.com",
          from: fromEmail,
          subject: `⚠️ CRM Sync Failed — Lead #${leadIdLabel} (${leadName})`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111">
              <div style="background:#dc2626;padding:20px 24px;border-radius:8px 8px 0 0">
                <h1 style="color:#fff;margin:0;font-size:20px">CRM Sync Permanently Failed</h1>
                <p style="color:#fecaca;margin:4px 0 0">All retry attempts exhausted — manual action required</p>
              </div>
              <div style="border:1px solid #e2e8f0;border-top:none;padding:24px;border-radius:0 0 8px 8px">
                <h3 style="color:#dc2626;margin-top:0">Lead Details</h3>
                <table style="border-collapse:collapse;width:100%">
                  <tr><td style="padding:4px 8px;font-weight:600;width:140px">Lead ID</td><td style="padding:4px 8px">#${leadIdLabel}</td></tr>
                  <tr><td style="padding:4px 8px;font-weight:600">Name</td><td style="padding:4px 8px">${leadName}</td></tr>
                  <tr><td style="padding:4px 8px;font-weight:600">Email</td><td style="padding:4px 8px">${leadEmail}</td></tr>
                  <tr><td style="padding:4px 8px;font-weight:600">Source</td><td style="padding:4px 8px">${payload.leadSource}</td></tr>
                </table>
                <h3 style="color:#dc2626;margin-top:24px">Error</h3>
                <p style="background:#fef2f2;padding:12px;border-radius:6px;font-family:monospace;font-size:13px;white-space:pre-wrap">${errorMessage}</p>
                <p style="margin-top:24px">
                  <a href="${adminPanelUrl}" style="background:#1a56db;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600">
                    View Lead in Admin Panel
                  </a>
                </p>
              </div>
            </div>`,
        })
      )
      .catch((err) => console.error("[notifyLead] CRM failure email alert failed:", err)),

    // SMS alert
    (async () => {
      const smsAlertTo = process.env.SMS_ALERT_TO;
      if (!smsAlertTo) {
        console.warn("[notifyLead] SMS_ALERT_TO not set — skipping CRM failure SMS alert");
        return;
      }
      const { accountSid, authToken, fromNumber } = await getTwilioCredentials();
      const client = twilio(accountSid, authToken);
      await client.messages.create({
        to: smsAlertTo,
        from: fromNumber,
        body:
          `⚠️ CRM Sync Failed!\n` +
          `Lead #${leadIdLabel} — ${leadName}\n` +
          `Email: ${leadEmail}\n` +
          `Error: ${errorMessage.slice(0, 100)}${errorMessage.length > 100 ? "…" : ""}\n` +
          `Admin: ${adminPanelUrl}`,
      });
    })().catch((err) => console.error("[notifyLead] CRM failure SMS alert failed:", err)),
  ]);
}

// ----- Buyer Confirmation Email -----
async function sendBuyerConfirmation(payload: LeadPayload): Promise<void> {
  if (!payload.contactEmail) return;

  const { transporter, fromEmail } = await getEmailTransport();
  const title = rvTitle(payload);
  const firstName = payload.contactName?.split(" ")[0] ?? null;
  const greeting = firstName ? `Hi ${firstName},` : "Hi there,";
  const rvLine = title !== "RV Listing"
    ? `your interest in the <strong>${title}</strong>`
    : `your inquiry`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111">
      <div style="background:#1a56db;padding:24px;border-radius:8px 8px 0 0;text-align:center">
        <h1 style="color:#fff;margin:0;font-size:22px;letter-spacing:-0.5px">MatchRV</h1>
        <p style="color:#bfd7ff;margin:6px 0 0;font-size:13px">Buy Your 3rd RV First.</p>
      </div>
      <div style="border:1px solid #e2e8f0;border-top:none;padding:32px;border-radius:0 0 8px 8px;background:#fff">
        <p style="font-size:17px;margin-top:0">${greeting}</p>
        <p style="font-size:15px;line-height:1.7;color:#374151">
          Thank you for reaching out! We received ${rvLine} and we're excited to help you find the perfect fit.
        </p>
        <p style="font-size:15px;line-height:1.7;color:#374151">
          A member of the MatchRV team will be in touch with you shortly. Before they do — is there anything specific you'd like them to have answers ready for when they call? Simply reply to this email and we'll make sure they come prepared.
        </p>
        <div style="background:#f0f7ff;border-left:4px solid #1a56db;padding:16px 20px;border-radius:0 6px 6px 0;margin:24px 0">
          <p style="margin:0;font-size:14px;color:#1e40af;font-weight:600">You're in good hands.</p>
          <p style="margin:6px 0 0;font-size:14px;color:#374151">
            MatchRV uses AI to match buyers with the right RV the first time — no regrets, no trade-in nightmares.
          </p>
        </div>
        <p style="font-size:15px;line-height:1.7;color:#374151;margin-bottom:0">
          Talk soon,<br/>
          <strong>Jonathan &amp; the MatchRV Team</strong><br/>
          <a href="mailto:sales@matchrv.com" style="color:#1a56db;text-decoration:none">sales@matchrv.com</a>
        </p>
      </div>
      <p style="text-align:center;font-size:12px;color:#9ca3af;margin-top:16px">
        © ${new Date().getFullYear()} MatchRV · <a href="https://matchrv.com" style="color:#9ca3af">matchrv.com</a>
      </p>
    </div>`;

  await transporter.sendMail({
    to: payload.contactEmail,
    from: `MatchRV <${fromEmail}>`,
    replyTo: "sales@matchrv.com",
    subject: `Thanks for reaching out, ${firstName ?? ""}! We'll be in touch soon.`.trim().replace(/,\s*!/, "!"),
    html,
  });
  console.log(`[notifyLead] Buyer confirmation sent → ${payload.contactEmail}`);
}

// ----- CRM POST (with retry + DB status tracking) -----
const CRM_MAX_ATTEMPTS = 3;
const CRM_BACKOFF_BASE_MS = 2000;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function postToCrm(payload: LeadPayload): Promise<void> {
  const webhookUrl = process.env.LOTLINK_CRM_WEBHOOK_URL;
  if (!webhookUrl) {
    console.log("[notifyLead] LOTLINK_CRM_WEBHOOK_URL not set — skipping CRM sync");
    return;
  }

  const snap = payload.listingSnapshot ?? {};
  const profile = payload.buyerProfile ?? {} as Record<string, unknown>;

  const listingParts = [
    payload.listingTitle ?? rvTitle(payload),
    snap.year ? `Year: ${snap.year}` : null,
    snap.price ?? snap.listPrice ?? snap.salePrice
      ? `Price: $${Number(snap.price ?? snap.listPrice ?? snap.salePrice).toLocaleString()}`
      : null,
    snap.dealer ?? snap.dealerName ?? payload.dealerName
      ? `Dealer: ${snap.dealer ?? snap.dealerName ?? payload.dealerName}`
      : null,
    payload.listingUrl ?? snap.url ?? snap.listingUrl
      ? `URL: ${payload.listingUrl ?? snap.url ?? snap.listingUrl}`
      : null,
  ].filter(Boolean).join(" | ");

  const profileParts = [
    profile.budget ? `Budget: ${profile.budget}` : null,
    profile.experience ? `Experience: ${profile.experience}` : null,
    profile.campingStyle ? `Style: ${profile.campingStyle}` : null,
    profile.summary ? `Summary: ${profile.summary}` : null,
  ].filter(Boolean).join(" | ");

  const notes = [listingParts, profileParts, `Source: ${payload.leadSource}`].filter(Boolean).join(" || ") || null;

  const crmPayload = {
    name: payload.contactName ?? (payload.contactEmail ? payload.contactEmail.split("@")[0] : "Unknown"),
    email: payload.contactEmail,
    phone: payload.contactPhone,
    make: snap.make ?? snap.manufacturer ?? "Unknown",
    model: snap.model ?? snap.modelName ?? "Unknown",
    budget: profile.budget ?? null,
    message: payload.message,
    notes,
  };

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.LOTLINK_CRM_API_KEY) {
    headers["Authorization"] = `Bearer ${process.env.LOTLINK_CRM_API_KEY}`;
  }

  let crmPosted = false;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= CRM_MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(crmPayload),
      });

      if (!res.ok) {
        throw new Error(`CRM webhook returned ${res.status}: ${await res.text()}`);
      }

      crmPosted = true;
      console.log(`[notifyLead] CRM sync succeeded (attempt ${attempt})`);
      break;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`[notifyLead] CRM sync attempt ${attempt}/${CRM_MAX_ATTEMPTS} failed: ${lastError.message}`);

      if (attempt < CRM_MAX_ATTEMPTS) {
        const delay = CRM_BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
        console.log(`[notifyLead] Retrying CRM sync in ${delay}ms…`);
        await sleep(delay);
      }
    }
  }

  if (!crmPosted) {
    console.error(`[notifyLead] CRM sync permanently failed after ${CRM_MAX_ATTEMPTS} attempts: ${lastError?.message}`);
    await sendCrmFailureAlert(payload, lastError?.message ?? "Unknown error").catch((alertErr) =>
      console.error("[notifyLead] Failed to send CRM failure alert:", alertErr)
    );
  }

  if (payload.buyerLeadId != null) {
    await db
      .update(buyerLeadsTable)
      .set({ crmSyncStatus: crmPosted ? "synced" : "failed" })
      .where(eq(buyerLeadsTable.id, payload.buyerLeadId))
      .catch((dbErr) => console.error("[notifyLead] Failed to update crmSyncStatus in DB:", dbErr));
  }

  if (payload.scraperLeadId != null) {
    await db
      .update(scraperLeadsTable)
      .set({ crmSyncStatus: crmPosted ? "synced" : "failed" })
      .where(eq(scraperLeadsTable.id, payload.scraperLeadId))
      .catch((dbErr) => console.error("[notifyLead] Failed to update scraper_leads.crmSyncStatus in DB:", dbErr));
  }
}

// ----- Main export -----
export async function notifyLead(payload: LeadPayload): Promise<void> {
  await Promise.allSettled([
    sendEmail(payload).catch((err) => console.error("[notifyLead] Email failed:", err)),
    postToCrm(payload).catch((err) => console.error("[notifyLead] CRM sync failed:", err)),
    sendSms(payload).catch((err) => console.error("[notifyLead] SMS failed:", err)),
    sendBuyerConfirmation(payload).catch((err) => console.error("[notifyLead] Buyer confirmation failed:", err)),
  ]);
}
