import { inflateSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { HelmetProvider } from "react-helmet-async";
import { Router } from "wouter";
import { SwipeWordmark } from "@/components/swipe/swipe-wordmark";
import { SWIPE_WORDMARK, swipeWordmarkBox } from "@/lib/swipe-logo";
import { Swipe } from "@/pages/swipe";

const wordmarkPath = resolve(dirname(fileURLToPath(import.meta.url)), "../public/matchrv-logo-wordmark.png");

/** RGBA pixels of an 8-bit PNG. Enough to check the trimmed wordmark's alpha. */
function decodePng(path: string): { width: number; height: number; alpha: (x: number, y: number) => number } {
  const buf = readFileSync(path);
  if (buf.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("not a png");
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat: Buffer[] = [];
  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") break;
    offset += 12 + length;
  }
  if (bitDepth !== 8 || colorType !== 6) throw new Error(`expected 8-bit RGBA, got depth ${bitDepth} type ${colorType}`);
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = 4;
  const stride = width * bpp;
  const rows: Buffer[] = [];
  let prev = Buffer.alloc(stride);
  let cursor = 0;
  const paeth = (a: number, b: number, c: number) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    if (pb <= pc) return b;
    return c;
  };
  for (let y = 0; y < height; y++) {
    const filter = raw[cursor];
    const row = Buffer.from(raw.subarray(cursor + 1, cursor + 1 + stride));
    cursor += 1 + stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? row[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      if (filter === 1) row[i] = (row[i] + a) & 255;
      else if (filter === 2) row[i] = (row[i] + b) & 255;
      else if (filter === 3) row[i] = (row[i] + ((a + b) >> 1)) & 255;
      else if (filter === 4) row[i] = (row[i] + paeth(a, b, c)) & 255;
      else if (filter !== 0) throw new Error(`bad png filter ${filter}`);
    }
    rows.push(row);
    prev = row;
  }
  return {
    width,
    height,
    alpha: (x, y) => rows[y][x * bpp + 3],
  };
}

function opaqueBounds(png: ReturnType<typeof decodePng>, threshold = 8) {
  let minX = png.width;
  let minY = png.height;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      if (png.alpha(x, y) > threshold) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { minX, minY, maxX, maxY };
}

describe("swipe header wordmark", () => {
  const png = decodePng(wordmarkPath);

  it("uses the trimmed wordmark file, not the padded canvas", () => {
    expect(png.width).toBe(SWIPE_WORDMARK.width);
    expect(png.height).toBe(SWIPE_WORDMARK.height);
    expect(png.width).toBeLessThan(1200);
    expect(png.height).toBeLessThan(400);
  });

  it("keeps a few pixels of padding around the stroke, including under the swoosh", () => {
    const box = opaqueBounds(png);
    const margins = {
      left: box.minX,
      top: box.minY,
      right: png.width - 1 - box.maxX,
      bottom: png.height - 1 - box.maxY,
    };
    for (const edge of Object.values(margins)) {
      expect(edge).toBeGreaterThanOrEqual(4);
      expect(edge).toBeLessThanOrEqual(16);
    }
    // A sliced swoosh is a long flat run along the bottom of the artwork.
    let flat = 0;
    let run = 0;
    for (let x = box.minX; x <= box.maxX; x++) {
      let bottom = -1;
      for (let y = png.height - 1; y >= 0; y--) {
        if (png.alpha(x, y) > 8) { bottom = y; break; }
      }
      if (bottom >= box.maxY - 2) run += 1;
      else run = 0;
      if (run > flat) flat = run;
    }
    expect(flat).toBeLessThan((box.maxX - box.minX) * 0.15);
  });

  it("sizes the header box to the file aspect ratio", () => {
    const box = swipeWordmarkBox();
    expect(box.height).toBe(SWIPE_WORDMARK.displayHeight);
    expect(box.height).toBeLessThanOrEqual(56);
    const displayed = box.width / box.height;
    const file = SWIPE_WORDMARK.width / SWIPE_WORDMARK.height;
    expect(Math.abs(displayed - file)).toBeLessThan(0.02);
  });

  it("renders the whole wordmark with object-fit contain and no crop", () => {
    const html = renderToStaticMarkup(<SwipeWordmark />);
    const box = swipeWordmarkBox();
    expect(html).toContain(`src="${SWIPE_WORDMARK.src}"`);
    expect(html).toContain("object-contain");
    expect(html).toContain(`width:${box.width}px`);
    expect(html).toContain(`height:${box.height}px`);
    expect(html).not.toContain("overflow");
    expect(html).not.toContain("matchrv-logo-light.png");
    expect(html).not.toMatch(/left:\s*-/);
    expect(html).not.toMatch(/top:\s*-/);
  });

  it("places that wordmark in the swipe header without an overflow window", () => {
    const html = renderToStaticMarkup(
      <HelmetProvider>
        <Router hook={() => ["/", () => {}]} searchHook={() => ""}>
          <Swipe />
        </Router>
      </HelmetProvider>,
    );
    expect(html).toContain('aria-label="MatchRV home"');
    expect(html).toContain(`src="${SWIPE_WORDMARK.src}"`);
    expect(html).toContain("object-contain");
    expect(html).not.toContain("overflow-hidden");
    expect(html).not.toContain("matchrv-logo-light.png");
  });
});
