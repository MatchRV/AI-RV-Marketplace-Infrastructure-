/** Configured public origin only; never build approval links from a caller's Host header. */
export function reviewOrigin(): URL {
  const configured = process.env.MATCHRV_PUBLIC_URL || process.env.RENDER_EXTERNAL_URL;
  const value = configured || (process.env.NODE_ENV !== "production" ? `http://localhost:${process.env.PORT || "8080"}` : "");
  const url = new URL(value);
  const localHttp = process.env.NODE_ENV !== "production" && url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((!localHttp && url.protocol !== "https:") || url.username || url.password ||
      url.pathname !== "/" || url.search || url.hash) {
    throw new Error("MATCHRV_PUBLIC_URL must be an HTTPS origin (loopback HTTP is allowed in development).");
  }
  return url;
}

export const reviewPath = (id: string): string => `/api/agent/leads/${encodeURIComponent(id)}/review`;
export const reviewUrl = (id: string): string => new URL(reviewPath(id), reviewOrigin()).href;

export const DEMO_DELIVERY_NOTICE =
  "Demo mode: approval allows MatchRV to record this request only. No email or text is delivered to the dealership, and this does not purchase or reserve the RV.";
