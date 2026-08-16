import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DealBadge } from "@/components/DealBadge";
import { useColors } from "@/hooks/useColors";

// ── Types ────────────────────────────────────────────────────────────────────

interface RichListing {
  id: number;
  year: number;
  make: string;
  model: string;
  price: number;
  type: string;
  images?: string[];
  dealScore?: string;
  location?: string;
  dealerName?: string;
  matchScore?: number;
  whyMatch?: string;
  [key: string]: unknown;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface NoMatchFilters {
  rvType?: string;
  minLength?: number;
  maxLength?: number;
}

interface ExpansionSuggestion {
  action: "expand_range" | "show_closest" | "change_type" | "start_over";
  label: string;
  message: string | null;
}

interface ChatState {
  messages: Message[];
  sessionId?: string;
  buyerProfile?: Record<string, unknown>;
  recommendations: RichListing[];
  stage: string;
  noMatch: boolean;
  noMatchFilters: NoMatchFilters;
  expansionSuggestions: ExpansionSuggestion[];
}

interface OutfitterChatResponse {
  message: string;
  sessionId?: string;
  updatedProfile?: Record<string, unknown>;
  recommendations?: RichListing[];
  stage: string;
  noMatch?: boolean;
  noMatchFilters?: NoMatchFilters;
  expansionSuggestions?: ExpansionSuggestion[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const RV_TYPES = [
  { label: "Class A Motorhome",            value: "class_a",        msg: "I'm looking for a Class A Motorhome" },
  { label: "Class B (Camper Van)",          value: "class_b",        msg: "I'm looking for a Class B Motorhome (Camper Van)" },
  { label: "Class C Motorhome",            value: "class_c",        msg: "I'm looking for a Class C Motorhome" },
  { label: "Travel Trailer",               value: "travel_trailer", msg: "I'm looking for a Travel Trailer" },
  { label: "Fifth Wheel",                 value: "fifth_wheel",    msg: "I'm looking for a Fifth Wheel" },
  { label: "Toy Hauler",                  value: "toy_hauler",     msg: "I'm looking for a Toy Hauler" },
  { label: "Truck Camper",                value: "truck_camper",   msg: "I'm looking for a Truck Camper" },
  { label: "Not sure — help me decide",   value: "not_sure",       msg: "I'm not sure yet — help me decide what type is right for me" },
];

const LENGTH_RANGES = [
  { label: "Under 25 ft",         msg: "I'm looking for something under 25 ft" },
  { label: "25–30 ft",            msg: "I want something in the 25–30 ft range" },
  { label: "30–35 ft",            msg: "I want something in the 30–35 ft range" },
  { label: "35–40 ft",            msg: "I want something in the 35–40 ft range" },
  { label: "40+ ft",              msg: "I want 40 ft or longer" },
  { label: "Flexible — I'm open", msg: "I'm flexible on length, I'm open to anything that fits my needs" },
];

const INITIAL_MESSAGE: Message = {
  id: "intro",
  role: "assistant",
  content: "Hi! I'm your AI Outfitter. I'll help you find the perfect RV by asking a few questions about how you'll use it. Ready to find your ideal rig?",
};

const INITIAL_CHAT: ChatState = {
  messages: [INITIAL_MESSAGE],
  recommendations: [],
  stage: "greeting",
  noMatch: false,
  noMatchFilters: {},
  expansionSuggestions: [],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPrice(p: number) {
  return "$" + p.toLocaleString("en-US");
}

function genId() {
  return Date.now().toString() + Math.random().toString(36).substr(2, 6);
}

function expandShorthands(text: string): string {
  let result = text.replace(/\b(\d+(?:\.\d+)?)\s*[kK]\b/g, (_m: string, n: string) => {
    const val = Math.round(parseFloat(n) * 1_000);
    return `$${val.toLocaleString("en-US")}`;
  });
  result = result.replace(/\b(\d+(?:\.\d+)?)\s*[mM]\b/g, (_m: string, n: string) => {
    const val = Math.round(parseFloat(n) * 1_000_000);
    return `$${val.toLocaleString("en-US")}`;
  });
  return result;
}

function formatRvType(type: string): string {
  const map: Record<string, string> = {
    class_a: "Class A",
    class_b: "Class B",
    class_c: "Class C",
    travel_trailer: "Travel Trailer",
    fifth_wheel: "Fifth Wheel",
    toy_hauler: "Toy Hauler",
    truck_camper: "Truck Camper",
    not_sure: "Not Sure",
  };
  return map[type] ?? type;
}

function getMatchBadges(listing: RichListing, profile: Record<string, unknown>): string[] {
  const badges: string[] = [];

  const rvType = profile.rvType as string | undefined;
  if (rvType && rvType !== "not_sure" && listing.type === rvType) {
    badges.push(`${formatRvType(rvType)} ✓`);
  }

  if (listing.length != null) {
    const l = Number(listing.length);
    const minLen = profile.minLength as number | undefined;
    const maxLen = profile.maxLength as number | undefined;
    if (minLen || maxLen) {
      const minOk = !minLen || l >= minLen - 1;
      const maxOk = !maxLen || l <= maxLen + 1;
      if (minOk && maxOk) badges.push(`${l.toFixed(0)} ft ✓`);
    }
  }

  const maxBudget = profile.maxBudget as number | undefined;
  if (maxBudget && listing.price <= maxBudget) badges.push("Within budget ✓");

  const needed = ((profile.sleepingCapacity ?? profile.travelers) as number | undefined);
  if (needed && Number(listing.sleeps) >= Number(needed)) badges.push(`Sleeps ${listing.sleeps} ✓`);

  const useCase = profile.useCase as string | undefined;
  if (useCase && useCase !== "other") {
    const useCaseLabel: Record<string, string> = {
      weekends: "Weekend-ready ✓",
      full_time: "Full-time ✓",
      seasonal: "Seasonal ✓",
      tailgating: "Tailgating ✓",
    };
    const label = useCaseLabel[useCase];
    if (label) badges.push(label);
  }

  return badges.slice(0, 4);
}

// ── MatchBadge ────────────────────────────────────────────────────────────────

function MatchBadge({ score, colors }: { score: number; colors: ReturnType<typeof useColors> }) {
  const color = score >= 90 ? "#22c55e" : score >= 75 ? colors.primary : "#f59e0b";
  return (
    <View style={[styles.matchBadge, { backgroundColor: color + "18", borderColor: color }]}>
      <Text style={[styles.matchBadgeText, { color }]}>{score}% match</Text>
    </View>
  );
}

// ── MatchReportModal ──────────────────────────────────────────────────────────

interface MatchReportProps {
  visible: boolean;
  recommendations: RichListing[];
  buyerProfile?: Record<string, unknown>;
  onClose: () => void;
  colors: ReturnType<typeof useColors>;
  insets: { top: number; bottom: number };
}

function MatchReportModal({ visible, recommendations, buyerProfile, onClose, colors, insets }: MatchReportProps) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.reportContainer, { backgroundColor: colors.background }]}>
        <View style={[styles.reportHeader, { borderBottomColor: colors.border }]}>
          <Pressable onPress={onClose} style={styles.sheetClose}>
            <Ionicons name="close" size={22} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.reportTitle, { color: colors.foreground }]}>Your Match Report</Text>
          <View style={{ width: 30 }} />
        </View>

        <ScrollView contentContainerStyle={[styles.reportBody, { paddingBottom: insets.bottom + 40 }]}>
          <View style={[styles.reportHero, { backgroundColor: colors.primary + "12", borderRadius: colors.radius }]}>
            <View style={[styles.reportHeroIcon, { backgroundColor: colors.primary + "20" }]}>
              <Ionicons name="compass" size={28} color={colors.primary} />
            </View>
            <Text style={[styles.reportHeroTitle, { color: colors.foreground }]}>
              {recommendations.length} RVs Matched
            </Text>
            <Text style={[styles.reportHeroSub, { color: colors.mutedForeground }]}>
              Based on your lifestyle preferences, budget, and camping style
            </Text>
          </View>

          <Text style={[styles.reportSectionLabel, { color: colors.mutedForeground }]}>TOP MATCHES</Text>

          {recommendations.map((listing, index) => {
            const badges = buyerProfile ? getMatchBadges(listing, buyerProfile) : [];
            return (
              <Pressable
                key={listing.id}
                onPress={() => { onClose(); router.push(`/listing/${listing.id}`); }}
                style={[styles.reportCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}
              >
                <View style={styles.reportCardRow}>
                  <View style={[styles.rankBadge, { backgroundColor: index === 0 ? colors.primary : colors.secondary }]}>
                    <Text style={[styles.rankText, { color: index === 0 ? "#fff" : colors.mutedForeground }]}>#{index + 1}</Text>
                  </View>

                  {listing.images?.[0] ? (
                    <Image source={{ uri: listing.images[0] }} style={styles.reportCardImage} />
                  ) : (
                    <View style={[styles.reportCardImagePlaceholder, { backgroundColor: colors.muted }]}>
                      <Ionicons name="car-outline" size={20} color={colors.mutedForeground} />
                    </View>
                  )}

                  <View style={{ flex: 1 }}>
                    <Text style={[styles.reportCardTitle, { color: colors.foreground }]} numberOfLines={2}>
                      {listing.year} {listing.make} {listing.model}
                    </Text>
                    <Text style={[styles.reportCardPrice, { color: colors.foreground }]}>
                      {formatPrice(listing.price)}
                    </Text>
                    <View style={styles.reportCardMeta}>
                      {listing.dealScore && <DealBadge score={listing.dealScore} size="sm" />}
                      {listing.matchScore != null && (
                        <MatchBadge score={listing.matchScore} colors={colors} />
                      )}
                    </View>
                    {badges.length > 0 && (
                      <View style={styles.criteriaTagsRow}>
                        {badges.map(b => (
                          <View key={b} style={[styles.criteriaTag, { backgroundColor: colors.primary + "15", borderColor: colors.primary + "40" }]}>
                            <Text style={[styles.criteriaTagText, { color: colors.primary }]}>{b}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>

                  <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
                </View>

                {listing.whyMatch && (
                  <View style={[styles.whyMatchRow, { borderTopColor: colors.border }]}>
                    <Ionicons name="sparkles-outline" size={13} color={colors.primary} />
                    <Text style={[styles.whyMatchText, { color: colors.mutedForeground }]}>{listing.whyMatch}</Text>
                  </View>
                )}
              </Pressable>
            );
          })}

          <View style={[styles.reportNote, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            <Ionicons name="information-circle-outline" size={16} color={colors.mutedForeground} />
            <Text style={[styles.reportNoteText, { color: colors.mutedForeground }]}>
              Match scores are calculated by your AI Outfitter — weighing budget fit, lifestyle match, and deal quality.
            </Text>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function OutfitterScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [chat, setChat] = useState<ChatState>(INITIAL_CHAT);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [showReport, setShowReport] = useState(false);

  // Widget state
  const [rvTypeSubmitted, setRvTypeSubmitted] = useState(false);
  const [lengthSubmitted, setLengthSubmitted] = useState(false);
  const [lengthFreeText, setLengthFreeText] = useState("");

  const flatListRef = useRef<FlatList>(null);
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  // ── Send message (accepts preformed text for pill selections) ──────────────
  const sendMessage = useCallback(async (preformedText?: string) => {
    const raw = preformedText ?? input.trim();
    if (!raw || isSending) return;

    const text = expandShorthands(raw);
    if (!preformedText) setInput("");
    setIsSending(true);

    const userMsg: Message = { id: genId(), role: "user", content: text };

    setChat((prev) => ({
      ...prev,
      noMatch: false,
      expansionSuggestions: [],
      messages: [userMsg, ...prev.messages],
    }));

    try {
      const domain = process.env.EXPO_PUBLIC_DOMAIN;
      const baseUrl = domain ? `https://${domain}` : "";
      const currentChat = chat;

      const response = await fetch(`${baseUrl}/api/outfitter/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            ...currentChat.messages.slice().reverse().map((m) => ({
              role: m.role,
              content: m.content,
            })),
            { role: "user", content: text },
          ],
          sessionId: currentChat.sessionId,
          buyerProfile: currentChat.buyerProfile,
        }),
      });

      const data: OutfitterChatResponse = await response.json();
      const assistantMsg: Message = { id: genId(), role: "assistant", content: data.message };

      setChat((prev) => ({
        ...prev,
        messages: [assistantMsg, ...prev.messages],
        sessionId: data.sessionId ?? prev.sessionId,
        buyerProfile: data.updatedProfile ?? prev.buyerProfile,
        recommendations: (data.recommendations as RichListing[]) ?? prev.recommendations,
        stage: data.stage,
        noMatch: Boolean(data.noMatch),
        noMatchFilters: data.noMatchFilters ?? {},
        expansionSuggestions: data.expansionSuggestions ?? [],
      }));
    } catch {
      const errMsg: Message = {
        id: genId(),
        role: "assistant",
        content: "Sorry, something went wrong. Please try again.",
      };
      setChat((prev) => ({ ...prev, messages: [errMsg, ...prev.messages] }));
    } finally {
      setIsSending(false);
    }
  }, [input, isSending, chat]);

  // ── No-match expansion action handler ─────────────────────────────────────
  function handleExpansionAction(suggestion: ExpansionSuggestion) {
    if (suggestion.action === "start_over") {
      setChat(INITIAL_CHAT);
      setRvTypeSubmitted(false);
      setLengthSubmitted(false);
      setLengthFreeText("");
      setInput("");
      return;
    }
    if (suggestion.action === "change_type") {
      setRvTypeSubmitted(false);
    }
    if (suggestion.message) {
      sendMessage(suggestion.message);
    }
  }

  // ── Fallback no-match handlers (when server suggestions not yet loaded) ────
  function handleExpandRange() {
    sendMessage("Please expand the length range by 10 ft on each side and show me the closest available matches.");
  }
  function handleShowClosest() {
    sendMessage("Show me the closest available options even if they don't exactly match my criteria — I'm open to seeing what's near my request.");
  }
  function handleChangeType() {
    setRvTypeSubmitted(false);
    sendMessage("Let me reconsider my RV type. What are my other options given my needs?");
  }

  // ── Widget visibility ──────────────────────────────────────────────────────
  const profile = chat.buyerProfile;
  const showRvTypeWidget =
    !rvTypeSubmitted &&
    !isSending &&
    !profile?.rvType &&
    chat.stage === "want";

  const showLengthWidget =
    !lengthSubmitted &&
    !isSending &&
    !profile?.minLength &&
    !profile?.maxLength &&
    !profile?.lengthFlexibility &&
    chat.stage === "size";

  // ── No-match description ───────────────────────────────────────────────────
  const noMatchDescription = (() => {
    const f = chat.noMatchFilters;
    const parts: string[] = [];
    if (f.rvType) parts.push(formatRvType(f.rvType));
    if (f.minLength || f.maxLength) {
      if (f.minLength && f.maxLength) parts.push(`${f.minLength}–${f.maxLength} ft`);
      else if (f.minLength) parts.push(`${f.minLength}+ ft`);
      else if (f.maxLength) parts.push(`under ${f.maxLength} ft`);
    }
    return parts.length > 0 ? parts.join(", ") : "your criteria";
  })();

  // ── Recommendations heading ────────────────────────────────────────────────
  const matchHeading = (() => {
    const parts: string[] = [];
    if (profile?.rvType && profile.rvType !== "not_sure") {
      parts.push(formatRvType(profile.rvType as string));
    }
    if (profile?.minLength || profile?.maxLength) {
      const min = profile.minLength as number | undefined;
      const max = profile.maxLength as number | undefined;
      if (min && max) parts.push(`${min}–${max} ft`);
      else if (min) parts.push(`${min}+ ft`);
      else if (max) parts.push(`under ${max} ft`);
    }
    return parts.length > 0 ? `Showing ${parts.join(" · ")}` : "Recommended for You";
  })();

  // ── Render message bubble ──────────────────────────────────────────────────
  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.role === "user";
    return (
      <View style={[styles.msgRow, isUser ? styles.msgRowUser : styles.msgRowAssistant]}>
        {!isUser && (
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <Ionicons name="compass" size={14} color="#fff" />
          </View>
        )}
        <View style={[
          styles.bubble,
          isUser
            ? { backgroundColor: colors.primary, borderRadius: colors.radius }
            : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: colors.radius },
          { maxWidth: "78%" },
        ]}>
          <Text style={[styles.bubbleText, { color: isUser ? colors.primaryForeground : colors.foreground }]}>
            {item.content}
          </Text>
        </View>
      </View>
    );
  };

  const hasRecs = chat.recommendations.length > 0;

  // ── List header: widgets + typing indicator ────────────────────────────────
  const listHeader = (
    <View>
      {/* Typing indicator */}
      {isSending && (
        <View style={[styles.msgRow, styles.msgRowAssistant]}>
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <Ionicons name="compass" size={14} color="#fff" />
          </View>
          <View style={[styles.bubble, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: colors.radius }]}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        </View>
      )}

      {/* No-match card */}
      {chat.noMatch && (
        <View style={styles.noMatchCard}>
          <View style={styles.noMatchHeader}>
            <Ionicons name="alert-circle-outline" size={18} color="#924c00" />
            <Text style={styles.noMatchTitle}>No exact matches found</Text>
          </View>
          <Text style={styles.noMatchDesc}>
            We couldn't find a <Text style={styles.noMatchBold}>{noMatchDescription}</Text> in our current Washington inventory. Let's try adjusting your criteria.
          </Text>
          <View style={styles.noMatchButtons}>
            {chat.expansionSuggestions.length > 0 ? (
              chat.expansionSuggestions.map((s) => (
                <Pressable
                  key={s.action}
                  onPress={() => handleExpansionAction(s)}
                  style={[
                    styles.noMatchBtn,
                    s.action === "start_over" ? styles.noMatchBtnFilled : styles.noMatchBtnOutline,
                  ]}
                >
                  {s.action === "expand_range" && <Ionicons name="refresh-outline" size={13} color="#924c00" />}
                  {s.action === "show_closest" && <Ionicons name="search-outline" size={13} color="#924c00" />}
                  {s.action === "change_type" && <Ionicons name="sparkles-outline" size={13} color="#924c00" />}
                  <Text style={s.action === "start_over" ? styles.noMatchBtnFilledText : styles.noMatchBtnOutlineText}>
                    {s.label}
                  </Text>
                </Pressable>
              ))
            ) : (
              <>
                <Pressable onPress={handleExpandRange} style={[styles.noMatchBtn, styles.noMatchBtnOutline]}>
                  <Ionicons name="refresh-outline" size={13} color="#924c00" />
                  <Text style={styles.noMatchBtnOutlineText}>Expand range</Text>
                </Pressable>
                <Pressable onPress={handleShowClosest} style={[styles.noMatchBtn, styles.noMatchBtnOutline]}>
                  <Ionicons name="search-outline" size={13} color="#924c00" />
                  <Text style={styles.noMatchBtnOutlineText}>Show closest</Text>
                </Pressable>
                <Pressable onPress={handleChangeType} style={[styles.noMatchBtn, styles.noMatchBtnOutline]}>
                  <Ionicons name="sparkles-outline" size={13} color="#924c00" />
                  <Text style={styles.noMatchBtnOutlineText}>Change RV type</Text>
                </Pressable>
                <Pressable
                  onPress={() => { setChat(INITIAL_CHAT); setRvTypeSubmitted(false); setLengthSubmitted(false); }}
                  style={[styles.noMatchBtn, styles.noMatchBtnFilled]}
                >
                  <Text style={styles.noMatchBtnFilledText}>Start over</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      )}

      {/* RV type quick-select widget */}
      {showRvTypeWidget && (
        <View style={[styles.widgetCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.widgetTitle, { color: colors.foreground }]}>What type of RV are you looking for?</Text>
          <View style={styles.pillGrid}>
            {RV_TYPES.map((type) => (
              <Pressable
                key={type.value}
                onPress={() => { setRvTypeSubmitted(true); sendMessage(type.msg); }}
                style={[styles.pill, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "50" }]}
              >
                <Text style={[styles.pillText, { color: colors.primary }]}>{type.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* Length range quick-select widget */}
      {showLengthWidget && (
        <View style={[styles.widgetCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.widgetTitle, { color: colors.foreground }]}>How long of an RV are you looking for?</Text>
          <View style={styles.pillGrid}>
            {LENGTH_RANGES.map((range) => (
              <Pressable
                key={range.label}
                onPress={() => { setLengthSubmitted(true); sendMessage(range.msg); }}
                style={[styles.pill, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "50" }]}
              >
                <Text style={[styles.pillText, { color: colors.primary }]}>{range.label}</Text>
              </Pressable>
            ))}
          </View>
          <View style={[styles.freeTextRow, { borderTopColor: colors.border }]}>
            <TextInput
              style={[styles.freeTextInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="Or type your own (e.g. 38 ft, 35-40 ft)..."
              placeholderTextColor={colors.mutedForeground}
              value={lengthFreeText}
              onChangeText={setLengthFreeText}
              onSubmitEditing={() => {
                if (lengthFreeText.trim()) { setLengthSubmitted(true); sendMessage(lengthFreeText.trim()); setLengthFreeText(""); }
              }}
              returnKeyType="send"
            />
            <Pressable
              onPress={() => {
                if (lengthFreeText.trim()) { setLengthSubmitted(true); sendMessage(lengthFreeText.trim()); setLengthFreeText(""); }
              }}
              style={[styles.freeTextBtn, { backgroundColor: lengthFreeText.trim() ? colors.primary : colors.muted }]}
            >
              <Ionicons name="arrow-forward" size={16} color={lengthFreeText.trim() ? "#fff" : colors.mutedForeground} />
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );

  // ── Recommendations footer ─────────────────────────────────────────────────
  const listFooter = hasRecs ? (
    <View style={styles.recsSection}>
      <View style={styles.recsTitleRow}>
        <Text style={[styles.recsTitle, { color: colors.foreground }]} numberOfLines={1}>{matchHeading}</Text>
        <Pressable onPress={() => setShowReport(true)} style={styles.seeAllBtn}>
          <Text style={[styles.seeAllText, { color: colors.primary }]}>Full Report</Text>
          <Ionicons name="arrow-forward" size={13} color={colors.primary} />
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.recsScroll} contentContainerStyle={{ paddingRight: 16 }}>
        {chat.recommendations.slice(0, 5).map((listing) => {
          const badges = profile ? getMatchBadges(listing, profile) : [];
          return (
            <Pressable
              key={listing.id}
              onPress={() => router.push(`/listing/${listing.id}`)}
              style={[styles.recCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}
            >
              {listing.images?.[0] ? (
                <Image source={{ uri: listing.images[0] }} style={styles.recImage} />
              ) : (
                <View style={[styles.recImagePlaceholder, { backgroundColor: colors.muted }]}>
                  <Ionicons name="car-outline" size={24} color={colors.mutedForeground} />
                </View>
              )}
              <View style={styles.recBody}>
                {listing.matchScore != null && (
                  <MatchBadge score={listing.matchScore} colors={colors} />
                )}
                <Text style={[styles.recTitle, { color: colors.foreground }]} numberOfLines={2}>
                  {listing.year} {listing.make} {listing.model}
                </Text>
                {badges.length > 0 && (
                  <View style={styles.recCriteriaTags}>
                    {badges.slice(0, 2).map(b => (
                      <View key={b} style={[styles.criteriaTag, { backgroundColor: colors.primary + "15", borderColor: colors.primary + "40" }]}>
                        <Text style={[styles.criteriaTagText, { color: colors.primary }]}>{b}</Text>
                      </View>
                    ))}
                  </View>
                )}
                <View style={styles.recFooterRow}>
                  <Text style={[styles.recPrice, { color: colors.foreground }]}>{formatPrice(listing.price)}</Text>
                  {listing.dealScore && <DealBadge score={listing.dealScore} size="sm" />}
                </View>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  ) : null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 12, borderBottomColor: colors.border }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>AI Outfitter</Text>
            <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>Powered by Claude AI</Text>
          </View>
          {hasRecs && (
            <Pressable
              onPress={() => setShowReport(true)}
              style={[styles.reportBtn, { backgroundColor: colors.primary + "15", borderColor: colors.primary, borderRadius: colors.radius }]}
            >
              <Ionicons name="document-text-outline" size={14} color={colors.primary} />
              <Text style={[styles.reportBtnText, { color: colors.primary }]}>Match Report</Text>
            </Pressable>
          )}
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={0}>
        <FlatList
          ref={flatListRef}
          data={chat.messages}
          keyExtractor={(item) => item.id}
          inverted
          renderItem={renderMessage}
          contentContainerStyle={styles.messagesContent}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={listHeader}
          ListFooterComponent={listFooter}
        />

        <View style={[styles.inputContainer, { borderTopColor: colors.border, backgroundColor: colors.background, paddingBottom: bottomInset + 8 }]}>
          <View style={[styles.inputRow, { backgroundColor: colors.muted, borderRadius: colors.radius + 4 }]}>
            <TextInput
              style={[styles.input, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}
              placeholder="Ask me anything about RVs..."
              placeholderTextColor={colors.mutedForeground}
              value={input}
              onChangeText={setInput}
              multiline
              maxLength={500}
              onSubmitEditing={() => sendMessage()}
              blurOnSubmit={false}
            />
            <Pressable
              onPress={() => sendMessage()}
              disabled={!input.trim() || isSending}
              style={[styles.sendBtn, { backgroundColor: input.trim() && !isSending ? colors.primary : colors.muted, borderRadius: colors.radius }]}
            >
              <Ionicons name="arrow-up" size={18} color={input.trim() && !isSending ? "#fff" : colors.mutedForeground} />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>

      <MatchReportModal
        visible={showReport}
        recommendations={chat.recommendations}
        buyerProfile={chat.buyerProfile}
        onClose={() => setShowReport(false)}
        colors={colors}
        insets={{ top: insets.top, bottom: insets.bottom }}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  reportBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1 },
  reportBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  messagesContent: { paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  msgRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  msgRowUser: { justifyContent: "flex-end" },
  msgRowAssistant: { justifyContent: "flex-start", alignItems: "flex-end" },
  avatar: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  bubble: { paddingHorizontal: 14, paddingVertical: 10 },
  bubbleText: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 21 },

  // Widget card
  widgetCard: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 12, marginHorizontal: 0 },
  widgetTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 10, lineHeight: 19 },
  pillGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  pillText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  freeTextRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: 1 },
  freeTextInput: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, fontFamily: "Inter_400Regular" },
  freeTextBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },

  // No-match card
  noMatchCard: { backgroundColor: "#fffbeb", borderWidth: 1, borderColor: "#ffe08b", borderRadius: 16, padding: 14, marginBottom: 12 },
  noMatchHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  noMatchTitle: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#924c00" },
  noMatchDesc: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#6b4400", lineHeight: 18, marginBottom: 12 },
  noMatchBold: { fontFamily: "Inter_600SemiBold" },
  noMatchButtons: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  noMatchBtn: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  noMatchBtnOutline: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#ffe08b" },
  noMatchBtnFilled: { backgroundColor: "#924c00" },
  noMatchBtnOutlineText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#924c00" },
  noMatchBtnFilledText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#fff" },

  // Recommendations
  recsSection: { paddingVertical: 16 },
  recsTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, marginBottom: 10 },
  recsTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", flex: 1, marginRight: 8 },
  seeAllBtn: { flexDirection: "row", alignItems: "center", gap: 2 },
  seeAllText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  recsScroll: { paddingLeft: 16 },
  recCard: { width: 180, borderWidth: 1, overflow: "hidden", marginRight: 12 },
  recImage: { width: "100%", height: 110 },
  recImagePlaceholder: { width: "100%", height: 110, alignItems: "center", justifyContent: "center" },
  recBody: { padding: 10, gap: 5 },
  recTitle: { fontSize: 12, fontFamily: "Inter_500Medium", lineHeight: 16 },
  recFooterRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6 },
  recPrice: { fontSize: 13, fontFamily: "Inter_700Bold" },
  recCriteriaTags: { flexDirection: "row", flexWrap: "wrap", gap: 4 },

  // Match badges
  matchBadge: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, alignSelf: "flex-start" },
  matchBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold" },

  // Criteria tags
  criteriaTag: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  criteriaTagText: { fontSize: 9, fontFamily: "Inter_600SemiBold" },
  criteriaTagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4 },

  // Input
  inputContainer: { borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 10 },
  inputRow: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  input: { flex: 1, fontSize: 15, maxHeight: 100, minHeight: 24 },
  sendBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", flexShrink: 0 },

  // Modal
  reportContainer: { flex: 1 },
  reportHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, borderBottomWidth: 1 },
  sheetClose: { padding: 4 },
  reportTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  reportBody: { padding: 20, gap: 16 },
  reportHero: { padding: 20, alignItems: "center", gap: 10 },
  reportHeroIcon: { width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center" },
  reportHeroTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  reportHeroSub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 18 },
  reportSectionLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, marginTop: 4 },
  reportCard: { borderWidth: 1, overflow: "hidden" },
  reportCardRow: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  rankBadge: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  rankText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  reportCardImage: { width: 72, height: 54, borderRadius: 6, flexShrink: 0 },
  reportCardImagePlaceholder: { width: 72, height: 54, borderRadius: 6, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  reportCardTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", lineHeight: 17, flex: 1 },
  reportCardPrice: { fontSize: 14, fontFamily: "Inter_700Bold", marginTop: 2 },
  reportCardMeta: { flexDirection: "row", gap: 5, marginTop: 4, flexWrap: "wrap" },
  whyMatchRow: { flexDirection: "row", gap: 8, alignItems: "flex-start", padding: 12, paddingTop: 10, borderTopWidth: 1 },
  whyMatchText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  reportNote: { flexDirection: "row", gap: 10, alignItems: "flex-start", padding: 14, borderWidth: 1 },
  reportNoteText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
});
