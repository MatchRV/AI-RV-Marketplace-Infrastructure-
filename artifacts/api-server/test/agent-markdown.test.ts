import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import app from "../src/app";
import { mdText, mdUrl, prefersMarkdown } from "../src/lib/agent-markdown";
import { listHubUrls, renderHubPage } from "../src/lib/inventory-hubs";
import { getInventory } from "../src/services/agent-inventory";
import { listingCanonicalUrl } from "../src/lib/listing-seo";

let server: Server;
let base = "";

beforeAll(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const MD = { Accept: "text/markdown" };
const BROWSER = { Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8" };

describe("Accept negotiation", () => {
  it("is q-value aware and never picks Markdown from wildcards", () => {
    expect(prefersMarkdown("text/markdown")).toBe(true);
    expect(prefersMarkdown("text/markdown, text/html;q=0.9")).toBe(true);
    expect(prefersMarkdown("text/html, text/markdown")).toBe(true); // tie: they asked for it
    expect(prefersMarkdown("text/markdown;q=0.5, text/html")).toBe(false);
    expect(prefersMarkdown("text/markdown;q=0")).toBe(false);
    expect(prefersMarkdown("text/markdown;q=0.3, */*;q=0.1")).toBe(true);
    expect(prefersMarkdown("text/markdown;q=0.3, text/*;q=0.8")).toBe(false);
    expect(prefersMarkdown(BROWSER.Accept)).toBe(false);
    expect(prefersMarkdown("*/*")).toBe(false);
    expect(prefersMarkdown("")).toBe(false);
    expect(prefersMarkdown(undefined)).toBe(false);
  });

  it("escapes Markdown and HTML in dealer text and keeps only http(s) link targets", () => {
    expect(mdText("<b>[x](javascript:y)</b> *2*\n# h")).toBe("\\<b\\>\\[x\\]\\(javascript:y\\)\\</b\\> \\*2\\* \\# h");
    expect(mdUrl("javascript:alert(1)")).toBeNull();
    expect(mdUrl("https://matchrv.com/listing/a(b)")).toBe("https://matchrv.com/listing/a%28b%29");
  });
});

describe("unit pages as Markdown", () => {
  const unit = () => getInventory().units.find((u) => /^[a-z0-9:._-]+$/i.test(u.id))!;

  it("Accept: text/markdown returns Markdown with canonical Link and Vary headers", async () => {
    const u = unit();
    const res = await fetch(`${base}/listing/${encodeURI(u.id)}`, { headers: MD, redirect: "manual" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(res.headers.get("vary")).toMatch(/accept/i);
    const canonical = listingCanonicalUrl(u.id);
    expect(res.headers.get("link")).toBe(`<${canonical}>; rel="canonical"`);
    const body = await res.text();
    expect(body.startsWith("# ")).toBe(true);
    expect(body).toContain("**Price:**");
    expect(body).toContain("**Dealer:**");
    expect(body).toContain(`Canonical: <${canonical}>`);
    expect(body).not.toMatch(/<html|<nav|<script|<div/i);
  }, 60_000);

  it("the .md variant serves the same Markdown to any client", async () => {
    const u = unit();
    const viaAccept = await (await fetch(`${base}/listing/${encodeURI(u.id)}`, { headers: MD })).text();
    const res = await fetch(`${base}/listing/${encodeURI(u.id)}.md`, { headers: BROWSER });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(await res.text()).toBe(viaAccept);
  }, 60_000);

  it("an unknown unit is a 404 in Markdown, by Accept and by .md", async () => {
    for (const [path, headers] of [["/listing/stk:nobody:none", MD], ["/listing/stk:nobody:none.md", BROWSER]] as const) {
      const res = await fetch(`${base}${path}`, { headers });
      expect(res.status).toBe(404);
      expect(res.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
      expect(await res.text()).toContain("# Listing not found");
    }
  });

  it("browsers are not served Markdown (the HTML handlers run as before)", async () => {
    const res = await fetch(`${base}/listing/${encodeURI(unit().id)}`, { headers: BROWSER });
    expect(res.headers.get("content-type") ?? "").not.toContain("markdown");
    expect(res.headers.get("vary")).toMatch(/accept/i);
  }, 60_000);
});

describe("inventory hub pages as Markdown", () => {
  const hubPath = () => new URL(listHubUrls()[0]).pathname;

  it("browsers get exactly the unchanged hub HTML", async () => {
    const path = hubPath();
    const res = await fetch(`${base}${path}`, { headers: BROWSER });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^text\/html/);
    expect(await res.text()).toBe(renderHubPage(path, 1));
    const plain = await fetch(`${base}${path}`);
    expect(await plain.text()).toBe(renderHubPage(path, 1));
  }, 60_000);

  it("Accept: text/markdown and .md return the hub's listings as Markdown", async () => {
    const path = hubPath();
    const res = await fetch(`${base}${path}`, { headers: MD });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(res.headers.get("vary")).toMatch(/accept/i);
    expect(res.headers.get("link")).toBe(`<https://matchrv.com${path}>; rel="canonical"`);
    const body = await res.text();
    expect(body).toMatch(/^# .+ for Sale in /);
    expect(body).toMatch(/\n- \[.+\]\(https:\/\/matchrv\.com\/listing\/.+\) — /);
    expect(body).not.toMatch(/<html|<nav|<header/i);
    const md = await fetch(`${base}${path}.md`);
    expect(md.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(await md.text()).toBe(body);
  }, 60_000);

  it("unknown hubs and pages past the end are 404 in Markdown", async () => {
    for (const path of ["/rvs/atlantis", "/rvs/atlantis.md", `${hubPath()}?page=9999`]) {
      const res = await fetch(`${base}${path}`, { headers: MD });
      expect(res.status).toBe(404);
      expect(res.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    }
  }, 60_000);
});
