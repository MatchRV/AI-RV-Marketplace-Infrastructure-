import { afterEach, describe, expect, it, vi } from "vitest";

const posthogMock = vi.hoisted(() => ({
  init: vi.fn(),
  capture: vi.fn(),
  identify: vi.fn(),
  reset: vi.fn(),
  logger: { info: vi.fn() },
}));

vi.mock("posthog-js", () => ({ default: posthogMock }));

async function loadPosthog() {
  vi.resetModules();
  return import("@/lib/posthog");
}

describe("posthog init guard", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    posthogMock.init.mockClear();
    posthogMock.capture.mockClear();
    posthogMock.identify.mockClear();
    posthogMock.reset.mockClear();
    posthogMock.logger.info.mockClear();
  });

  it("does not call posthog during prerender when the key and host are set", async () => {
    vi.stubEnv("SSR", "true");
    vi.stubEnv("VITE_POSTHOG_KEY", "phc_dummy");
    vi.stubEnv("VITE_POSTHOG_HOST", "https://us.i.posthog.com");

    const loaded = await loadPosthog();

    expect(posthogMock.init).not.toHaveBeenCalled();
    expect(posthogMock.capture).not.toHaveBeenCalled();
    expect(posthogMock.identify).not.toHaveBeenCalled();
    expect(posthogMock.reset).not.toHaveBeenCalled();
    expect(loaded.posthog).toBe(posthogMock);
    expect(loaded.posthogLogger).toBe(posthogMock.logger);
  });

  it("does not call posthog during prerender even if a window global exists", async () => {
    vi.stubEnv("SSR", "true");
    vi.stubGlobal("window", globalThis);
    vi.stubEnv("VITE_POSTHOG_KEY", "phc_dummy");
    vi.stubEnv("VITE_POSTHOG_HOST", "https://us.i.posthog.com");

    await loadPosthog();

    expect(posthogMock.init).not.toHaveBeenCalled();
    expect(posthogMock.capture).not.toHaveBeenCalled();
  });

  it("initializes in the browser and keeps identify and capture on the same client", async () => {
    vi.stubEnv("SSR", "");
    vi.stubGlobal("window", globalThis);
    vi.stubEnv("VITE_POSTHOG_KEY", "phc_dummy");
    vi.stubEnv("VITE_POSTHOG_HOST", "https://us.i.posthog.com");
    vi.stubEnv("MODE", "production");

    const loaded = await loadPosthog();

    expect(posthogMock.init).toHaveBeenCalledTimes(1);
    expect(posthogMock.init).toHaveBeenCalledWith("phc_dummy", {
      api_host: "https://us.i.posthog.com",
      capture_exceptions: {
        capture_unhandled_errors: true,
        capture_unhandled_rejections: true,
        capture_console_errors: false,
      },
      logs: {
        serviceName: "rv-marketplace-web",
        environment: "production",
      },
    });
    loaded.posthog.identify("user_1", { email: "dealer@example.com" });
    loaded.posthog.capture("$pageview");
    expect(posthogMock.identify).toHaveBeenCalledWith("user_1", { email: "dealer@example.com" });
    expect(posthogMock.capture).toHaveBeenCalledWith("$pageview");
    expect(loaded.posthogLogger).toBe(posthogMock.logger);
  });

  it("does not initialize in the browser when the key or host is empty", async () => {
    vi.stubEnv("SSR", "");
    vi.stubGlobal("window", globalThis);
    vi.stubEnv("VITE_POSTHOG_KEY", "");
    vi.stubEnv("VITE_POSTHOG_HOST", "");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await loadPosthog();

    expect(posthogMock.init).not.toHaveBeenCalled();
    expect(error.mock.calls.flat().join("\n")).toContain("VITE_POSTHOG_KEY");
    expect(error.mock.calls.flat().join("\n")).toContain("VITE_POSTHOG_HOST");
  });
});
