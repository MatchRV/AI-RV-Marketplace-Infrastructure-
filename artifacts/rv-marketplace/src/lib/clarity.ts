declare global {
  interface Window {
    clarity?: (...args: unknown[]) => void;
  }
}

export function trackClarity(key: string, value = "true"): void {
  try {
    if (typeof window !== "undefined" && typeof window.clarity === "function") {
      window.clarity("set", key, value);
    }
  } catch {
    // never let analytics break the app
  }
}
