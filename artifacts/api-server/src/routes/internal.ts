/**
 * Localhost-only operations routes. Not part of the public API.
 *
 *   POST /internal/reload-snapshot   re-read the inventory snapshot and swap it in (see services/snapshot-reload.ts)
 *                                    ?wait=0 returns 202 at once; default waits and returns the outcome.
 *   GET  /internal/snapshot-status   current snapshot version, unit count and last reload outcome
 *
 * Access rule: the TCP peer must be a loopback address AND the request must carry no
 * proxy-forwarding header (X-Forwarded-For/-Host/-Proto, Forwarded, X-Real-IP, Via,
 * CF-Connecting-IP). Caddy's reverse_proxy always adds X-Forwarded-For, so a public
 * request that Caddy relays from 127.0.0.1 is still refused. Anything refused gets the
 * same 404 an unknown path gets. Uses the socket address, never req.ip (trust proxy is on).
 */
import type { Request, Response, NextFunction } from "express";
import { Router, type IRouter } from "express";
import { reloadSnapshot, snapshotStatus } from "../services/snapshot-reload";

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const FORWARDING_HEADERS = ["x-forwarded-for", "x-forwarded-host", "x-forwarded-proto", "forwarded", "x-real-ip", "via", "cf-connecting-ip"];

/** True only for a direct (unproxied) connection from this machine. */
export function isDirectLoopbackRequest(req: Pick<Request, "socket" | "headers">): boolean {
  const addr = req.socket?.remoteAddress ?? "";
  if (!LOOPBACK.has(addr)) return false;
  return !FORWARDING_HEADERS.some((h) => req.headers[h] !== undefined);
}

function localOnly(req: Request, res: Response, next: NextFunction): void {
  if (!isDirectLoopbackRequest(req)) {
    res.status(404).type("text/plain").send("not found");
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  next();
}

const router: IRouter = Router();

router.post("/internal/reload-snapshot", localOnly, async (req: Request, res: Response) => {
  const pending = reloadSnapshot("http");
  if (req.query.wait === "0") {
    res.status(202).json({ status: "started", ...snapshotStatus() });
    return;
  }
  const outcome = await pending;
  res.status(outcome.status === "rejected" ? 422 : 200).json({ ...outcome, status: outcome.status });
});

router.get("/internal/snapshot-status", localOnly, (_req: Request, res: Response) => {
  res.json(snapshotStatus());
});

// Everything else under /internal: same 404 for everyone (no SPA shell).
router.all(/^\/internal(\/.*)?$/, (_req: Request, res: Response) => {
  res.status(404).type("text/plain").send("not found");
});

export default router;
