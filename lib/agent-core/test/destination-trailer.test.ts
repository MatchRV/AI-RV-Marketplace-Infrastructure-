import { describe, expect, it } from "vitest";
import { isDestinationTrailer, normalizeRvType } from "../src/normalize.js";

describe("destination trailer type (CSO QA trial4)", () => {
  it("files a destination trailer as travel_trailer, never fifth_wheel", () => {
    expect(normalizeRvType("Destination Trailer", "2026 Forest River Timberwolf 39ALX")).toBe("travel_trailer");
    expect(normalizeRvType("destination", "")).toBe("travel_trailer");
    expect(normalizeRvType(null, "New 2026 Jayco Jay Flight Bungalow 40LOFT Destination Trailer")).toBe("travel_trailer");
  });
  it("flags it as a destination trailer", () => {
    expect(isDestinationTrailer("Destination Trailer", "")).toBe(true);
    expect(isDestinationTrailer(null, "2026 Jayco Jay Flight Bungalow 40LOFT Destination Trailer")).toBe(true);
    expect(isDestinationTrailer("Travel Trailer", "2026 Jayco Jay Flight 264BH")).toBe(false);
  });
  it("keeps a dealer-stated fifth wheel as fifth_wheel", () => {
    expect(normalizeRvType("Fifth Wheel", "")).toBe("fifth_wheel");
    expect(normalizeRvType("5th Wheel Destination Trailer", "")).toBe("fifth_wheel");
  });
});
