import { Router, type IRouter, type Request, type Response } from "express";
import { decidePreview, getBrowserApprovalToken, getPreview, type LeadPreview } from "../services/agent-leads";
import { DEMO_DELIVERY_NOTICE, reviewOrigin, reviewPath } from "../services/agent-review";

const router: IRouter = Router();
const route = "/agent/leads/:id/review";
const escapeHtml = (value: unknown): string => String(value ?? "Not provided").replace(/[&<>"']/g,
  (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

function page(title: string, content: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)} — MatchRV</title><style>
  *{box-sizing:border-box}body{margin:0;background:#f3f5f4;color:#172d29;font:17px/1.6 system-ui,sans-serif}
  main{max-width:720px;margin:40px auto;padding:32px;background:white;border-radius:16px;border:1px solid #dae3df}
  .brand{font-weight:800;letter-spacing:.04em;color:#16634d}h1{font-size:30px;line-height:1.2}h2{font-size:20px}
  dt{font-weight:700;margin-top:12px}dd{margin:0;overflow-wrap:anywhere}pre{font:inherit;white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f5f4;padding:20px;border-radius:8px}
  .notice{background:#fff4d4;border-left:4px solid #ba8110;padding:16px}button{font:inherit;font-weight:700;cursor:pointer;padding:12px 20px;border-radius:8px;border:1px solid #16634d;background:#16634d;color:white}
  button[value=rejected]{background:white;color:#172d29}form{display:flex;gap:12px;flex-wrap:wrap;margin:24px 0}button:focus-visible{outline:3px solid #c38000;outline-offset:3px}
  @media(max-width:600px){main{margin:12px;padding:22px}h1{font-size:26px}button{width:100%}}
  </style></head><body><main><div class="brand">MatchRV</div><h1>${escapeHtml(title)}</h1>${content}</main></body></html>`;
}

function unavailable(res: Response, status: number, message: string): void {
  res.status(status).type("html").send(page("Request unavailable", `<p>${escapeHtml(message)}</p><p>Return to ChatGPT and ask MatchRV to prepare a new preview. Nothing has been approved by opening this page.</p>`));
}

function previewPage(preview: LeadPreview): string {
  const statusText: Record<LeadPreview["status"], string> = {
    awaiting_human_approval: "Review the exact details below before choosing Approve or Reject. Opening this page does not approve or submit the request.",
    approved: "Approved. Return to ChatGPT and ask MatchRV to submit this approved preview. It has not been submitted yet.",
    rejected: "Rejected. This request cannot be submitted. Return to ChatGPT if you want to prepare a different message.",
    submitted: "Request recorded. No message was delivered to the dealership in demo mode. Do not submit again.",
    expired: "This preview has expired. Return to ChatGPT and prepare a new request.",
  };
  const row = (label: string, value: unknown) => `<dt>${label}</dt><dd>${escapeHtml(value)}</dd>`;
  return page(preview.status === "awaiting_human_approval" ? "Review dealer request" : "Request " + preview.status,
    `<p role="status">${escapeHtml(statusText[preview.status])}</p><p class="notice">${DEMO_DELIVERY_NOTICE}</p>
    <dl>${row("RV", preview.unitTitle)}${row("Listed price", preview.unitPrice === null ? "Unknown" : `$${preview.unitPrice.toLocaleString("en-US")}`)}
    ${row("Dealer", `${preview.dealer.name} · ${preview.dealer.city}, ${preview.dealer.state}`)}
    ${row("Your name", preview.customer.name)}${row("Email", preview.customer.email)}${row("Phone", preview.customer.phone)}</dl>
    <h2>Exact message</h2><pre>${escapeHtml(preview.message)}</pre>
    <p>Preview: ${escapeHtml(preview.previewId)}<br>Review expires: ${escapeHtml(preview.expiresAt)}</p>
    ${preview.status === "awaiting_human_approval" ? `<p>By approving, you allow MatchRV to record the contact details and message shown above for this RV in its demo lead queue.</p>
    <form method="post" action="${reviewPath(preview.previewId)}"><button name="decision" value="approved">Approve request</button><button name="decision" value="rejected">Reject request</button></form>` : ""}`);
}

router.use(route, (_req, res, next) => {
  res.set({
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  });
  // These pages must not inherit the application's permissive credentialed CORS policy.
  res.removeHeader("Access-Control-Allow-Origin");
  res.removeHeader("Access-Control-Allow-Credentials");
  next();
});

const cookieName = (id: string): string => `matchrv_review_${id}`;
function cookieOptions(id: string) {
  return { httpOnly: true, sameSite: "strict" as const, secure: reviewOrigin().protocol === "https:", path: reviewPath(id) };
}

router.get(route, (req: Request, res: Response) => {
  const id = String(req.params.id);
  const preview = getPreview(id);
  if (!preview) return unavailable(res, 404, "This preview no longer exists. It may have expired or the server may have restarted.");
  if (preview.status === "expired") return unavailable(res, 410, "This preview expired before approval.");
  try {
    const token = getBrowserApprovalToken(id);
    if (token) {
      res.cookie(cookieName(id), token, { ...cookieOptions(id), maxAge: Math.max(0, Date.parse(preview.expiresAt) - Date.now()) });
    }
    res.type("html").send(previewPage(preview));
  } catch {
    unavailable(res, 503, "The review page is temporarily unavailable. No approval was recorded.");
  }
});

router.post(route, (req: Request, res: Response) => {
  const id = String(req.params.id);
  let origin: string;
  try { origin = reviewOrigin().origin; } catch {
    return unavailable(res, 503, "The review page is temporarily unavailable. No approval was recorded.");
  }
  if (req.get("origin") !== origin || !req.is("application/x-www-form-urlencoded")) {
    return unavailable(res, 403, "Open the review link and use its Approve or Reject button.");
  }
  const decision = req.body?.decision;
  if (decision !== "approved" && decision !== "rejected") return unavailable(res, 400, "Choose Approve or Reject on the review page.");
  const cookies = (req.get("cookie") || "").split(";").map((part) => part.trim()).filter((part) => part.startsWith(`${cookieName(id)}=`));
  const token = cookies.length === 1 ? cookies[0].slice(cookieName(id).length + 1) : "";
  const result = decidePreview(id, decision, token);
  if (!result.ok) {
    const status = result.code === "not_found" ? 404 : result.code === "expired" ? 410 : result.code === "invalid_token" ? 403 : 409;
    return unavailable(res, status, result.code === "already_decided" ? "A decision has already been recorded for this preview." : "This review session is invalid or expired. No approval was recorded.");
  }
  res.clearCookie(cookieName(id), cookieOptions(id));
  res.redirect(303, reviewPath(id));
});

export default router;
