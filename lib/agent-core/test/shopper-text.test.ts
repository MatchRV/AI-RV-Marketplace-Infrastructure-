import { describe, expect, it } from "vitest";
import { SHERPA_WELCOME, classifyOpening, explicitFuel, parseShopperText, placeFromText } from "../src/index.js";

describe("fuel filters ONLY on an explicit gas/diesel request", () => {
  it.each([
    "class a with good gas mileage",
    "worried about gas prices",
    "propane gas stove and furnace",
    "a gas station nearby would help",
    "gas or diesel is fine",
    "diesel or gas, either",
    "I don't care about gas or diesel",
    "outdoor kitchen with a gas grill",
    "fuel economy matters",
  ])("no fuel filter: %s", (text) => {
    expect(parseShopperText(text).constraints.fuelType).toBeUndefined();
  });
  it.each([
    ["diesel class a", "diesel"],
    ["a diesel pusher near Tacoma", "diesel"],
    ["Cummins powered coach", "diesel"],
    ["gas class A under 120k", "gas"],
    ["I want a gas motorhome", "gas"],
    ["looking for a gasser", "gas"],
    ["gas-powered class c", "gas"],
  ])("explicit: %s → %s", (text, fuel) => {
    expect(parseShopperText(text).constraints.fuelType).toBe(fuel);
  });
  it("negated or mixed mentions never filter, they are flagged for a question", () => {
    expect(explicitFuel("not a diesel please")).toEqual({ fuel: null, unclear: true });
    expect(parseShopperText("not diesel").constraints.fuelType).toBeUndefined();
  });
});

describe("parseShopperText", () => {
  it("'motorhome' means Class A, B or C, and brand/series are parsed", () => {
    const c = parseShopperText("Tiffin motorhomes").constraints;
    expect(c.rvTypes).toEqual(["class_a", "class_b", "class_c"]);
    expect(c.makes).toEqual(["Tiffin"]);
    const r = parseShopperText("Tiffin Allegro Red near Tacoma").constraints;
    expect(r).toMatchObject({ makes: ["Tiffin"], models: ["Allegro RED"] });
    expect(r.fuelType).toBeUndefined();
  });
  it("keeps the existing parses (sleeps, price incl. 40k, length, hp)", () => {
    const c = parseShopperText("travel trailer sleeps 4 under 40k nothing longer than 28 ft").constraints;
    expect(c).toMatchObject({ rvTypes: ["travel_trailer"], sleepsMin: 4, priceMaxUsd: 40000, lengthMaxFt: 28 });
    expect(parseShopperText("2 adults and 2 kids").constraints.sleepsMin).toBe(4);
    expect(parseShopperText("family of 5").constraints.sleepsMin).toBe(5);
    expect(parseShopperText("at least 450 hp diesel").constraints).toMatchObject({ horsepowerMin: 450, fuelType: "diesel" });
  });
  it("finds a resolvable place, never guesses one", () => {
    expect(placeFromText("I want a Tiffin Allegro Red near Tacoma")).toBe("Tacoma");
    expect(placeFromText("anything in Tacoma, WA?")).toMatch(/^Tacoma/);
    expect(placeFromText("I want an RV")).toBeNull();
  });
});

describe("Sherpa welcome routing", () => {
  it.each(["hi", "Hello!", "hey there", "help", "I need help", "I'm just looking", "Can you help me?"])("vague / greeting → welcome: %s", (m) => {
    const o = classifyOpening(m);
    expect(o.route).toBe("welcome");
    expect(o.welcome).toBe(SHERPA_WELCOME);
  });
  it("the welcome is the approved text", () => {
    expect(SHERPA_WELCOME).toContain("Think of me as your Sherpa: you wouldn't climb Everest without one");
    expect(SHERPA_WELCOME.endsWith("What brings you in today?")).toBe(true);
  });
  it("general questions / comparisons → answer directly from the guides", () => {
    const o = classifyOpening("What's the difference between a motorhome and a trailer?");
    expect(o.route).toBe("education");
    expect(o.guideTopics?.[0]).toBe("motorhome_vs_trailer");
    expect(classifyOpening("How do I set up a campsite?").route).toBe("education");
  });
  it("a specific RV → make/model search path", () => {
    const o = classifyOpening("Do you have any Tiffin Allegro Reds?");
    expect(o.route).toBe("specific_rv");
    expect(o.extracted).toMatchObject({ makes: ["Tiffin"], models: ["Allegro RED"] });
  });
  it("'help me choose' and messages that already say what they want skip the welcome", () => {
    expect(classifyOpening("Help me choose the right RV for my family").route).toBe("help_choose");
    expect(classifyOpening("travel trailer that sleeps 6 under 50k near Spokane").route).toBe("help_choose");
  });
});
