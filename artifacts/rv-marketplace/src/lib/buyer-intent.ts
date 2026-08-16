import { getAnalyticsSessionId, trackEvent } from "@/lib/analytics";

type UnknownRecord = Record<string, unknown>;

export interface BuyerIntentListing {
  id?: number;
  dealerId?: number;
  title?: string;
  make?: string;
  model?: string;
  year?: number;
  type?: string;
  price?: number;
  location?: string;
  dealerName?: string;
  dealerCity?: string;
  dealerState?: string;
  viewedAt: string;
}

export interface BuyerIntentProfile {
  sessionId: string;
  firstSeenAt: string;
  lastSeenAt: string;
  pageViews: number;
  listingViews: number;
  searchCount: number;
  filterChangeCount: number;
  contactOpens: number;
  leadActions: number;
  savedListings: number;
  towChecks: number;
  returnVisits: number;
  outfitterHalfDone: boolean;
  outfitterFullDone: boolean;
  score: number;
  readinessScore: number;
  tags: string[];
  latestPath?: string;
  latestTitle?: string;
  latestFilters: Record<string, string>;
  locationIntent?: {
    city?: string;
    state?: string;
    label?: string;
    source: string;
    updatedAt: string;
  };
  viewedListings: BuyerIntentListing[];
  filterHistory: Array<{
    changed: Record<string, string | null>;
    filters: Record<string, string>;
    at: string;
  }>;
  recentActivity: string[];
  events: Array<{
    eventType: string;
    at: string;
    listingId?: number;
    dealerId?: number;
    summary: string;
  }>;
}

const PROFILE_KEY = "matchrv_buyer_intent_profile";
const MAX_RECENT_EVENTS = 25;
const MAX_RECENT_LISTINGS = 12;
const MAX_FILTER_HISTORY = 15;

function nowIso() {
  return new Date().toISOString();
}

function isBrowser() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function emptyProfile(): BuyerIntentProfile {
  const at = nowIso();
  return {
    sessionId: getAnalyticsSessionId(),
    firstSeenAt: at,
    lastSeenAt: at,
    pageViews: 0,
    listingViews: 0,
    searchCount: 0,
    filterChangeCount: 0,
    contactOpens: 0,
    leadActions: 0,
    savedListings: 0,
    towChecks: 0,
    returnVisits: 0,
    outfitterHalfDone: false,
    outfitterFullDone: false,
    score: 8,
    readinessScore: 8,
    tags: [],
    latestFilters: {},
    viewedListings: [],
    filterHistory: [],
    recentActivity: [],
    events: [],
  };
}

function normalizeProfile(raw: unknown): BuyerIntentProfile {
  const profile = { ...emptyProfile(), ...asRecord(raw) } as BuyerIntentProfile;
  profile.sessionId = asString(profile.sessionId) ?? getAnalyticsSessionId();
  profile.latestFilters = normalizeFilters(profile.latestFilters);
  profile.viewedListings = Array.isArray(profile.viewedListings) ? profile.viewedListings.slice(0, MAX_RECENT_LISTINGS) : [];
  profile.filterHistory = Array.isArray(profile.filterHistory) ? profile.filterHistory.slice(0, MAX_FILTER_HISTORY) : [];
  profile.recentActivity = Array.isArray(profile.recentActivity) ? profile.recentActivity.filter(Boolean).map(String).slice(0, MAX_RECENT_EVENTS) : [];
  profile.events = Array.isArray(profile.events) ? profile.events.slice(0, MAX_RECENT_EVENTS) : [];
  return profile;
}

function readProfile(): BuyerIntentProfile {
  if (!isBrowser()) return emptyProfile();
  try {
    return normalizeProfile(JSON.parse(localStorage.getItem(PROFILE_KEY) ?? "null"));
  } catch {
    return emptyProfile();
  }
}

function writeProfile(profile: BuyerIntentProfile) {
  if (!isBrowser()) return;
  const scored = scoreProfile(profile);
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(scored));
  } catch {
    // Storage can be unavailable in privacy mode; analytics still fires separately.
  }
}

function normalizeFilters(value: unknown): Record<string, string> {
  const raw = asRecord(value);
  return Object.fromEntries(
    Object.entries(raw)
      .filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== "")
      .map(([k, v]) => [k, String(v)])
  );
}

function labelType(type?: string) {
  if (!type) return undefined;
  return type
    .split(",")
    .map((part) => part.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()))
    .join(", ");
}

function money(value?: string | number) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? `$${Math.round(n).toLocaleString()}` : undefined;
}

function summarizeFilters(filters: Record<string, string>): string {
  const bits = [
    labelType(filters.type),
    filters.condition ? filters.condition.replace(/\b\w/g, (c) => c.toUpperCase()) : undefined,
    filters.maxPrice ? `under ${money(filters.maxPrice)}` : undefined,
    filters.minPrice ? `from ${money(filters.minPrice)}` : undefined,
    filters.minSleeps ? `sleeps ${filters.minSleeps}+` : undefined,
    filters.state ? `near ${filters.state}` : undefined,
    filters.make,
  ].filter(Boolean);
  return bits.length ? bits.join(", ") : "Adjusted search filters";
}

function extractLocation(metadata: UnknownRecord, filters?: Record<string, string>) {
  const explicit = asRecord(metadata.location);
  const city = asString(explicit.city) ?? asString(metadata.city);
  const state = asString(explicit.state) ?? asString(metadata.state) ?? filters?.state;
  const label = asString(explicit.label) ?? asString(metadata.locationLabel) ?? [city, state].filter(Boolean).join(", ");
  if (!city && !state && !label) return undefined;
  return {
    city,
    state,
    label: label || state,
    source: asString(explicit.source) ?? asString(metadata.locationSource) ?? "explicit_site_signal",
    updatedAt: nowIso(),
  };
}

function extractListing(metadata: UnknownRecord, listingId?: number, dealerId?: number): BuyerIntentListing | null {
  const listing = { ...metadata, ...asRecord(metadata.listing) };
  const id = listingId ?? asNumber(listing.id);
  const title = asString(listing.title);
  if (!id && !title) return null;
  return {
    id,
    dealerId: dealerId ?? asNumber(listing.dealerId),
    title,
    make: asString(listing.make),
    model: asString(listing.model),
    year: asNumber(listing.year),
    type: asString(listing.type),
    price: asNumber(listing.price),
    location: asString(listing.location),
    dealerName: asString(listing.dealerName),
    dealerCity: asString(listing.dealerCity),
    dealerState: asString(listing.dealerState),
    viewedAt: nowIso(),
  };
}

function addActivity(profile: BuyerIntentProfile, summary: string) {
  if (!summary) return;
  profile.recentActivity = [summary, ...profile.recentActivity.filter((item) => item !== summary)].slice(0, MAX_RECENT_EVENTS);
}

function addEvent(
  profile: BuyerIntentProfile,
  eventType: string,
  summary: string,
  listingId?: number,
  dealerId?: number,
) {
  profile.events = [
    { eventType, at: nowIso(), listingId, dealerId, summary },
    ...profile.events,
  ].slice(0, MAX_RECENT_EVENTS);
}

function scoreProfile(profile: BuyerIntentProfile): BuyerIntentProfile {
  const hasLocation = Boolean(profile.locationIntent?.state || profile.locationIntent?.city || profile.locationIntent?.label);

  // Behavioral signals: page views, filters, saves, listing views, contacts — capped at 40 pts
  const behavioralScore = Math.min(40,
    5 +
    Math.min(profile.pageViews, 8) +
    Math.min(profile.filterChangeCount * 3, 12) +
    Math.min(profile.searchCount * 2, 8) +
    Math.min(profile.listingViews * 5, 16) +
    Math.min(profile.savedListings * 8, 10) +
    Math.min(profile.contactOpens * 6, 10) +
    Math.min(profile.leadActions * 14, 18) +
    Math.min(profile.towChecks * 5, 8) +
    Math.min(profile.returnVisits * 5, 8) +
    (hasLocation ? 6 : 0)
  );

  // Match Report bonus — the moat of MatchRV:
  // Half-done (answered core questions: type, use case, location, budget — reached the fork): +25 pts
  // Full done (received 3 personalized RV matches, matching/complete stage): +60 pts total
  // These are tiers — full replaces, not stacks on, half.
  const matchReportBonus = profile.outfitterFullDone ? 60 : profile.outfitterHalfDone ? 25 : 0;

  const score = Math.min(100, behavioralScore + matchReportBonus);

  const tags = new Set<string>();
  if (score >= 85) tags.add("Hot lead");
  else if (score >= 65) tags.add("High intent");
  else if (score >= 45) tags.add("Researching");
  if (hasLocation) tags.add("Location matched");
  if (profile.filterChangeCount >= 3) tags.add("Filter engaged");
  if (profile.listingViews >= 2) tags.add("Viewed multiple RVs");
  if (profile.savedListings > 0) tags.add("Saved inventory");
  if (profile.contactOpens > 0) tags.add("Contact intent");
  if (profile.towChecks > 0) tags.add("Tow fit checked");
  if (profile.outfitterFullDone) tags.add("Match Report complete");
  else if (profile.outfitterHalfDone) tags.add("Match Report started");
  if (profile.latestFilters.type) {
    const type = labelType(profile.latestFilters.type);
    if (type) tags.add(type);
  }

  return {
    ...profile,
    score,
    readinessScore: score,
    tags: Array.from(tags).slice(0, 8),
  };
}

export function getBuyerIntentProfile(): BuyerIntentProfile {
  return scoreProfile(readProfile());
}

export function recordPageViewIntent(path: string, title?: string) {
  const profile = readProfile();
  profile.pageViews += 1;
  profile.latestPath = path;
  profile.latestTitle = title;
  profile.lastSeenAt = nowIso();
  addEvent(profile, "page_view", `Viewed ${path}`);
  writeProfile(profile);
}

export function recordBuyerIntent(
  eventType: string,
  data: {
    listingId?: number;
    dealerId?: number;
    metadata?: UnknownRecord;
    filters?: Record<string, string>;
    sendAnalytics?: boolean;
  } = {},
) {
  const metadata = data.metadata ?? {};
  const filters = data.filters ?? normalizeFilters(metadata.filters);
  const profile = readProfile();
  profile.lastSeenAt = nowIso();

  const location = extractLocation(metadata, Object.keys(filters).length ? filters : undefined);
  if (location) profile.locationIntent = location;

  if (Object.keys(filters).length) {
    profile.latestFilters = filters;
  }

  let summary = eventType.replace(/_/g, " ");

  if (eventType === "filter_applied" || eventType === "search") {
    if (eventType === "filter_applied") profile.filterChangeCount += 1;
    else profile.searchCount += 1;
    const changed = asRecord(metadata.changedFilters) as Record<string, string | null>;
    profile.filterHistory = [
      { changed, filters: { ...filters }, at: nowIso() },
      ...profile.filterHistory,
    ].slice(0, MAX_FILTER_HISTORY);
    summary = summarizeFilters(filters);
    addActivity(profile, `Filtered: ${summary}`);
  }

  if (eventType === "listing_view") {
    profile.listingViews += 1;
    const listing = extractListing(metadata, data.listingId, data.dealerId);
    if (listing) {
      profile.viewedListings = [
        listing,
        ...profile.viewedListings.filter((item) => item.id !== listing.id),
      ].slice(0, MAX_RECENT_LISTINGS);
      summary = `Viewed ${listing.title ?? "an RV listing"}`;
      addActivity(profile, summary);
      if (listing.dealerState || listing.dealerCity || listing.location) {
        profile.locationIntent = {
          city: listing.dealerCity,
          state: listing.dealerState,
          label: listing.location ?? [listing.dealerCity, listing.dealerState].filter(Boolean).join(", "),
          source: "listing_dealer_location",
          updatedAt: nowIso(),
        };
      }
    }
  }

  if (eventType === "contact_open") {
    profile.contactOpens += 1;
    summary = "Opened dealer contact form";
    addActivity(profile, summary);
  }

  if (eventType === "dealer_contact") {
    profile.leadActions += 1;
    summary = "Submitted dealer contact lead";
    addActivity(profile, summary);
  }

  if (eventType === "listing_save" || eventType === "listing_saved") {
    profile.savedListings += 1;
    summary = "Saved a listing";
    addActivity(profile, summary);
  }

  if (eventType === "tow_check") {
    profile.towChecks += 1;
    summary = "Checked tow fit";
    addActivity(profile, summary);
  }

  if (eventType === "return_visit") {
    profile.returnVisits += 1;
    summary = "Returned to MatchRV";
    addActivity(profile, summary);
  }

  if (eventType === "outfitter_session") {
    summary = "Used AI Outfitter";
    addActivity(profile, summary);
  }

  if (eventType === "outfitter_knowledge_mode") {
    summary = "Asked RV Outfitter a question";
    addActivity(profile, summary);
  }

  if (eventType === "outfitter_half_complete") {
    profile.outfitterHalfDone = true;
    summary = "Completed AI Outfitter core questions";
    addActivity(profile, summary);
  }

  if (eventType === "outfitter_full_complete") {
    profile.outfitterHalfDone = true;
    profile.outfitterFullDone = true;
    summary = "Completed AI Outfitter full deep dive";
    addActivity(profile, summary);
  }

  addEvent(profile, eventType, summary, data.listingId, data.dealerId);
  writeProfile(profile);

  if (data.sendAnalytics !== false) {
    trackEvent(eventType, {
      listingId: data.listingId,
      dealerId: data.dealerId,
      metadata: {
        ...metadata,
        filters,
        matchrvIntentScore: scoreProfile(profile).score,
      },
    });
  }
}

export function buildLeadBuyerProfile(
  existingProfile: UnknownRecord = {},
  extra: UnknownRecord = {},
): UnknownRecord {
  const current = getBuyerIntentProfile();
  const existingIntent = asRecord(existingProfile.matchrvIntent);
  return {
    ...existingProfile,
    ...extra,
    sessionId: current.sessionId,
    intentScore: current.score,
    readinessScore: current.readinessScore,
    intentTags: current.tags,
    matchrvIntent: {
      ...existingIntent,
      ...current,
      leadCapturedAt: nowIso(),
      trackingBasis: "First-party behavioral signals from MatchRV pages, filters, listing views, and explicit location inputs.",
    },
  };
}

