import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import app from "../src/app";

let server: Server;
let base = "";

beforeAll(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe("retired /advertising URL", () => {
  it("permanently redirects to /visibility-solution, including HEAD and a trailing slash", async () => {
    for (const path of ["/advertising", "/advertising/"]) {
      const res = await fetch(`${base}${path}`, { method: "HEAD", redirect: "manual" });
      expect(res.status).toBe(301);
      expect(res.headers.get("location")).toMatch(/\/visibility-solution$/);
      const get = await fetch(`${base}${path}`, { redirect: "manual" });
      expect(get.status).toBe(301);
      expect(get.headers.get("location")).toMatch(/\/visibility-solution$/);
    }
  });
});

describe("served llms.txt", () => {
  it("does not publish a fixed RV count or the old advertising URL", async () => {
    const res = await fetch(`${base}/llms.txt`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain("{{LIVE_RV_COUNT}}");
    expect(text).not.toContain("150,000");
    expect(text).not.toContain("128,174");
    expect(text).not.toContain("129,000");
    expect(text).not.toContain("/advertising");
    expect(text).toContain("https://matchrv.com/visibility-solution");
    expect(text).toContain("GET /api/listings");
    // This suite has no ready database, so the file must not invent a count.
    expect(text).toContain("unavailable for this response");
  });
});
