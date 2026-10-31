import { describe, expect, it } from "vitest";
import { idRef, toIntegerId } from "../src/lib/record-ids";

describe("record ids", () => {
  it("keeps real integer ids", () => {
    expect(toIntegerId(42)).toBe(42);
    expect(toIntegerId("42")).toBe(42);
  });
  it("never passes a string inventory id to an integer column", () => {
    expect(toIntegerId("stk:themotorcoachstore.com:id-acfd5c87")).toBeNull();
    expect(toIntegerId("12abc")).toBeNull();
    expect(toIntegerId(1.5)).toBeNull();
    expect(toIntegerId(null)).toBeNull();
  });
  it("preserves the original reference as text", () => {
    expect(idRef("stk:dealer.com:x")).toBe("stk:dealer.com:x");
    expect(idRef(7)).toBe("7");
    expect(idRef(undefined)).toBeNull();
    expect(idRef("")).toBeNull();
  });
});
