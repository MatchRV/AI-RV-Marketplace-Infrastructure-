import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import app from "../src/app";

const TOKEN = "8833f5f9e4a467193678ff2dfde7ceedfe4c069628542403bf97123beb5c2930";
const PATH = `/.well-known/muse-challenge/${TOKEN}`;
const BODY = `muse-challenge=${TOKEN}`;

let server: Server;
let base = "";

beforeAll(async () => {
  delete process.env.MUSE_CHALLENGE;
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

function get(path: string, headers?: Record<string, string>) {
  return fetch(`${base}${path}`, { redirect: "manual", headers });
}

describe("Muse domain verification", () => {
  it("returns only the default challenge as text/plain, with no redirect", async () => {
    delete process.env.MUSE_CHALLENGE;
    const res = await get(PATH);
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("content-type")).toBe("text/plain");
    const text = await res.text();
    expect(text.trim()).toBe(BODY);
    expect(text).not.toMatch(/[<{]/);
  });

  it("still returns the challenge when auth, cookies, Origin, or an http proto hint are present", async () => {
    const res = await get(PATH, {
      Origin: "https://platform.muse.ai",
      Authorization: "Bearer nope",
      Cookie: "session=nope",
      "X-Forwarded-Proto": "http",
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("content-type")).toBe("text/plain");
    expect((await res.text()).trim()).toBe(BODY);
  });

  it("does not redirect a trailing slash onto the challenge URL", async () => {
    const res = await get(`${PATH}/`);
    expect([301, 302, 303, 307, 308]).not.toContain(res.status);
    expect(res.headers.get("location")).toBeNull();
  });

  it("does not publish the challenge body for a different token", async () => {
    const res = await get("/.well-known/muse-challenge/deadbeef");
    expect(res.status).not.toBe(200);
    const text = await res.text();
    expect(text).not.toContain(BODY);
    expect(text).not.toMatch(/<!doctype|<html/i);
  });

  it("leaves /.well-known/openai-apps-challenge and /mcp alone", async () => {
    const previous = process.env.OPENAI_APPS_CHALLENGE;
    delete process.env.OPENAI_APPS_CHALLENGE;
    try {
      const openai = await get("/.well-known/openai-apps-challenge");
      expect(openai.status).toBe(404);
      expect(openai.headers.get("content-type") ?? "").toMatch(/^text\/plain\b/);
      expect(await openai.text()).toBe("not configured");
    } finally {
      if (previous === undefined) delete process.env.OPENAI_APPS_CHALLENGE;
      else process.env.OPENAI_APPS_CHALLENGE = previous;
    }

    const mcp = await get("/mcp", { Accept: "text/html" });
    const mcpText = await mcp.text();
    expect(mcpText).not.toContain("muse-challenge=");
    expect(mcp.headers.get("content-type") ?? "").not.toMatch(/text\/html/);
  });

  it("serves MUSE_CHALLENGE instead of the baked-in token when the env var is set", async () => {
    const next = "ab".repeat(32);
    process.env.MUSE_CHALLENGE = `  ${next}  `;
    try {
      const res = await get(`/.well-known/muse-challenge/${next}`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("text/plain");
      expect((await res.text()).trim()).toBe(`muse-challenge=${next}`);

      const stale = await get(PATH);
      expect(stale.status).not.toBe(200);
      expect(await stale.text()).not.toContain(BODY);
    } finally {
      delete process.env.MUSE_CHALLENGE;
    }
  });
});
