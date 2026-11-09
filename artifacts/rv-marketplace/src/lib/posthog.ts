import posthog from "posthog-js";

const posthogKey = import.meta.env.VITE_POSTHOG_KEY;
const posthogHost = import.meta.env.VITE_POSTHOG_HOST;

// Prerender loads this module in Node. posthog-js resolves to its CJS build
// there, so the default export is the package namespace and `init` is not a
// function. The browser bundle uses the ESM client. Keep every PostHog call
// off the server.
const isBrowser =
  !import.meta.env.SSR &&
  typeof window !== "undefined" &&
  typeof posthog.init === "function";

if (posthogKey && posthogHost) {
  if (isBrowser) {
    posthog.init(posthogKey, {
      api_host: posthogHost,
      capture_exceptions: {
        capture_unhandled_errors: true,
        capture_unhandled_rejections: true,
        capture_console_errors: false,
      },
      logs: {
        serviceName: "rv-marketplace-web",
        environment: import.meta.env.MODE,
      },
    });
  }
} else if (import.meta.env.DEV) {
  if (!posthogKey) {
    console.error(
      "VITE_POSTHOG_KEY variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once VITE_POSTHOG_KEY is configured",
    );
  }
  if (!posthogHost) {
    console.error(
      "VITE_POSTHOG_HOST variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once VITE_POSTHOG_HOST is configured",
    );
  }
}

const posthogLogger = posthog.logger;

export { posthog, posthogLogger };
