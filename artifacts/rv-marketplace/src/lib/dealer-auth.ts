export const DEALER_SESSION_KEY = "matchrv_dealer_session";

export type DealerTier = "free" | "intelligence" | "agent";

export interface DealerSession {
  email: string;
  dealerName: string;
  signedInAt: string;
  tier: DealerTier;
}

export function getDealerSession(): DealerSession | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(DEALER_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DealerSession;
    if (!parsed.tier) parsed.tier = "free";
    return parsed;
  } catch {
    return null;
  }
}

export function setDealerSession(email: string, tier: DealerTier = "free"): DealerSession {
  const normalizedEmail = email.trim().toLowerCase();
  const dealerName = normalizedEmail.includes("@")
    ? normalizedEmail.split("@")[0].replace(/[._-]+/g, " ")
    : "Dealer";

  const session: DealerSession = {
    email: normalizedEmail,
    dealerName: dealerName.replace(/\b\w/g, (char) => char.toUpperCase()),
    signedInAt: new Date().toISOString(),
    tier,
  };

  localStorage.setItem(DEALER_SESSION_KEY, JSON.stringify(session));
  return session;
}

export function upgradeDealerTier(tier: DealerTier): void {
  const session = getDealerSession();
  if (!session) return;
  session.tier = tier;
  localStorage.setItem(DEALER_SESSION_KEY, JSON.stringify(session));
}

export function clearDealerSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(DEALER_SESSION_KEY);
}
