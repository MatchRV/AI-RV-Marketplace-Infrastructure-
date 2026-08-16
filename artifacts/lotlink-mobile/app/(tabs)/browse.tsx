import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ListingCard } from "@/components/ListingCard";
import { useColors } from "@/hooks/useColors";

const PAGE_SIZE = 24;

const RV_TYPES = [
  { label: "All", value: undefined },
  { label: "Class A", value: "class_a" },
  { label: "Class B", value: "class_b" },
  { label: "Class C", value: "class_c" },
  { label: "Fifth Wheel", value: "fifth_wheel" },
  { label: "Travel Trailer", value: "travel_trailer" },
  { label: "Toy Hauler", value: "toy_hauler" },
  { label: "Pop-Up", value: "pop_up" },
  { label: "Truck Camper", value: "truck_camper" },
];

const SORT_OPTIONS = [
  { label: "Recommended", value: "recommended" },
  { label: "Price: Low to High", value: "price_asc" },
  { label: "Price: High to Low", value: "price_desc" },
  { label: "Newest First", value: "newest" },
  { label: "Best Deal", value: "deal_score" },
  { label: "Most Recent", value: "listed_desc" },
];

interface Filters {
  condition?: "new" | "used";
  dealScore?: string;
  minPrice?: number;
  maxPrice?: number;
  minYear?: number;
  maxYear?: number;
  minSleeps?: number;
  minSlides?: number;
  petFriendly?: boolean;
  fourSeason?: boolean;
  solarFilter?: string;
  campingStyle?: string;
  washerDryer?: boolean;
  outdoorKitchen?: boolean;
}

function countActiveFilters(f: Filters): number {
  let n = 0;
  if (f.condition) n++;
  if (f.dealScore) n++;
  if (f.minPrice || f.maxPrice) n++;
  if (f.minYear || f.maxYear) n++;
  if (f.minSleeps) n++;
  if (f.minSlides) n++;
  if (f.petFriendly) n++;
  if (f.fourSeason) n++;
  if (f.solarFilter) n++;
  if (f.campingStyle) n++;
  if (f.washerDryer) n++;
  if (f.outdoorKitchen) n++;
  return n;
}

function buildUrl(base: string, search: string, type: string | undefined, sort: string, filters: Filters, offset: number) {
  const params: Record<string, string> = {
    limit: String(PAGE_SIZE),
    offset: String(offset),
    sort,
  };
  if (search.trim()) params.search = search.trim();
  if (type) params.type = type;
  if (filters.condition) params.condition = filters.condition;
  if (filters.dealScore) params.dealScore = filters.dealScore;
  if (filters.minPrice != null) params.minPrice = String(filters.minPrice);
  if (filters.maxPrice != null) params.maxPrice = String(filters.maxPrice);
  if (filters.minYear != null) params.minYear = String(filters.minYear);
  if (filters.maxYear != null) params.maxYear = String(filters.maxYear);
  if (filters.minSleeps != null) params.minSleeps = String(filters.minSleeps);
  if (filters.minSlides != null) params.minSlides = String(filters.minSlides);
  if (filters.petFriendly) params.petFriendly = "true";
  if (filters.fourSeason) params.fourSeason = "true";
  if (filters.solarFilter) params.solarFilter = filters.solarFilter;
  if (filters.campingStyle) params.campingStyle = filters.campingStyle;
  if (filters.washerDryer) params.washerDryer = "true";
  if (filters.outdoorKitchen) params.outdoorKitchen = "true";
  return `${base}/api/listings?${new URLSearchParams(params).toString()}`;
}

interface ToggleProps {
  label: string;
  active: boolean;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
}

function FilterToggle({ label, active, onPress, colors }: ToggleProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.filterToggle,
        {
          backgroundColor: active ? colors.primary : colors.card,
          borderColor: active ? colors.primary : colors.border,
          borderRadius: 20,
        },
      ]}
    >
      {active && <Ionicons name="checkmark" size={12} color={colors.primaryForeground} style={{ marginRight: 4 }} />}
      <Text style={[styles.filterToggleText, { color: active ? colors.primaryForeground : colors.foreground }]}>
        {label}
      </Text>
    </Pressable>
  );
}

interface FilterSheetProps {
  visible: boolean;
  filters: Filters;
  onApply: (f: Filters) => void;
  onClose: () => void;
  colors: ReturnType<typeof useColors>;
  insets: { bottom: number };
}

function FilterSheet({ visible, filters, onApply, onClose, colors, insets }: FilterSheetProps) {
  const [draft, setDraft] = useState<Filters>(filters);

  useEffect(() => {
    if (visible) setDraft(filters);
  }, [visible]);

  const set = (patch: Partial<Filters>) => setDraft((d) => ({ ...d, ...patch }));

  const DEAL_OPTS = [
    { label: "Any", value: undefined },
    { label: "Great Deal", value: "great_deal" },
    { label: "Good Deal", value: "good_deal" },
    { label: "Fair Deal", value: "fair_deal" },
  ];

  const SLEEPS_OPTS = [
    { label: "Any", value: undefined },
    { label: "2+", value: 2 },
    { label: "4+", value: 4 },
    { label: "6+", value: 6 },
    { label: "8+", value: 8 },
  ];

  const SLIDES_OPTS = [
    { label: "Any", value: undefined },
    { label: "1+", value: 1 },
    { label: "2+", value: 2 },
    { label: "3+", value: 3 },
  ];

  const totalActive = countActiveFilters(draft);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.sheetContainer, { backgroundColor: colors.background }]}>
        <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
          <Pressable onPress={onClose} style={styles.sheetClose}>
            <Ionicons name="close" size={22} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Filters</Text>
          <Pressable onPress={() => setDraft({})}>
            <Text style={[styles.sheetReset, { color: colors.primary }]}>Reset</Text>
          </Pressable>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.sheetBody, { paddingBottom: insets.bottom + 100 }]} showsVerticalScrollIndicator={false}>

          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>CONDITION</Text>
          <View style={styles.chipRow}>
            {(["any", "new", "used"] as const).map((v) => (
              <FilterToggle
                key={v}
                label={v === "any" ? "Any" : v.charAt(0).toUpperCase() + v.slice(1)}
                active={v === "any" ? !draft.condition : draft.condition === v}
                onPress={() => set({ condition: v === "any" ? undefined : v })}
                colors={colors}
              />
            ))}
          </View>

          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>DEAL SCORE</Text>
          <View style={styles.chipRow}>
            {DEAL_OPTS.map((opt) => (
              <FilterToggle
                key={opt.label}
                label={opt.label}
                active={draft.dealScore === opt.value}
                onPress={() => set({ dealScore: opt.value })}
                colors={colors}
              />
            ))}
          </View>

          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>PRICE RANGE</Text>
          <View style={styles.rangeRow}>
            <View style={[styles.rangeInput, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 10 }]}>
              <Text style={[styles.rangeLabel, { color: colors.mutedForeground }]}>Min $</Text>
              <TextInput
                style={[styles.rangeValue, { color: colors.foreground }]}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={colors.mutedForeground}
                value={draft.minPrice != null ? String(draft.minPrice) : ""}
                onChangeText={(t) => set({ minPrice: t ? Number(t.replace(/[^0-9]/g, "")) : undefined })}
              />
            </View>
            <Text style={[styles.rangeDash, { color: colors.mutedForeground }]}>—</Text>
            <View style={[styles.rangeInput, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 10 }]}>
              <Text style={[styles.rangeLabel, { color: colors.mutedForeground }]}>Max $</Text>
              <TextInput
                style={[styles.rangeValue, { color: colors.foreground }]}
                keyboardType="numeric"
                placeholder="Any"
                placeholderTextColor={colors.mutedForeground}
                value={draft.maxPrice != null ? String(draft.maxPrice) : ""}
                onChangeText={(t) => set({ maxPrice: t ? Number(t.replace(/[^0-9]/g, "")) : undefined })}
              />
            </View>
          </View>

          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>YEAR RANGE</Text>
          <View style={styles.rangeRow}>
            <View style={[styles.rangeInput, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 10 }]}>
              <Text style={[styles.rangeLabel, { color: colors.mutedForeground }]}>From</Text>
              <TextInput
                style={[styles.rangeValue, { color: colors.foreground }]}
                keyboardType="numeric"
                placeholder="Any"
                placeholderTextColor={colors.mutedForeground}
                value={draft.minYear != null ? String(draft.minYear) : ""}
                onChangeText={(t) => set({ minYear: t ? Number(t) : undefined })}
              />
            </View>
            <Text style={[styles.rangeDash, { color: colors.mutedForeground }]}>—</Text>
            <View style={[styles.rangeInput, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 10 }]}>
              <Text style={[styles.rangeLabel, { color: colors.mutedForeground }]}>To</Text>
              <TextInput
                style={[styles.rangeValue, { color: colors.foreground }]}
                keyboardType="numeric"
                placeholder="Any"
                placeholderTextColor={colors.mutedForeground}
                value={draft.maxYear != null ? String(draft.maxYear) : ""}
                onChangeText={(t) => set({ maxYear: t ? Number(t) : undefined })}
              />
            </View>
          </View>

          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>SLEEPS AT LEAST</Text>
          <View style={styles.chipRow}>
            {SLEEPS_OPTS.map((opt) => (
              <FilterToggle
                key={opt.label}
                label={opt.label}
                active={draft.minSleeps === opt.value}
                onPress={() => set({ minSleeps: opt.value ?? undefined })}
                colors={colors}
              />
            ))}
          </View>

          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>SLIDES</Text>
          <View style={styles.chipRow}>
            {SLIDES_OPTS.map((opt) => (
              <FilterToggle
                key={opt.label}
                label={opt.label}
                active={draft.minSlides === opt.value}
                onPress={() => set({ minSlides: opt.value ?? undefined })}
                colors={colors}
              />
            ))}
          </View>

          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>LIFESTYLE</Text>
          <View style={styles.chipRow}>
            <FilterToggle label="Pet Friendly" active={!!draft.petFriendly} onPress={() => set({ petFriendly: !draft.petFriendly || undefined })} colors={colors} />
            <FilterToggle label="4-Season Ready" active={!!draft.fourSeason} onPress={() => set({ fourSeason: !draft.fourSeason || undefined })} colors={colors} />
            <FilterToggle label="Boondocking" active={draft.campingStyle === "boondocking"} onPress={() => set({ campingStyle: draft.campingStyle === "boondocking" ? undefined : "boondocking" })} colors={colors} />
            <FilterToggle label="Solar" active={!!draft.solarFilter} onPress={() => set({ solarFilter: draft.solarFilter ? undefined : "installed" })} colors={colors} />
            <FilterToggle label="Washer/Dryer" active={!!draft.washerDryer} onPress={() => set({ washerDryer: !draft.washerDryer || undefined })} colors={colors} />
            <FilterToggle label="Outdoor Kitchen" active={!!draft.outdoorKitchen} onPress={() => set({ outdoorKitchen: !draft.outdoorKitchen || undefined })} colors={colors} />
          </View>
        </ScrollView>

        <View style={[styles.sheetFooter, { borderTopColor: colors.border, paddingBottom: insets.bottom + 12 }]}>
          <Pressable
            onPress={() => { onApply(draft); onClose(); }}
            style={[styles.applyBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
          >
            <Text style={[styles.applyBtnText, { color: colors.primaryForeground }]}>
              {totalActive > 0 ? `Apply ${totalActive} Filter${totalActive > 1 ? "s" : ""}` : "Show All Results"}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export default function BrowseScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const [search, setSearch] = useState("");
  const [activeType, setActiveType] = useState<string | undefined>(undefined);
  const [sort, setSort] = useState("recommended");
  const [showSort, setShowSort] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Filters>({});

  const [listings, setListings] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);

  const offsetRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const domain = process.env.EXPO_PUBLIC_DOMAIN ?? "";
  const base = domain ? `https://${domain}` : "";

  const fetchListings = useCallback(async (resetOffset = true) => {
    const currentOffset = resetOffset ? 0 : offsetRef.current;
    if (resetOffset) {
      setLoading(true);
      setListings([]);
      offsetRef.current = 0;
    } else {
      setLoadingMore(true);
    }
    setError(false);

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const url = buildUrl(base, search, activeType, sort, filters, currentOffset);
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json();
      setTotal(data.total ?? 0);
      if (resetOffset) {
        setListings(data.listings ?? []);
      } else {
        setListings((prev) => [...prev, ...(data.listings ?? [])]);
        offsetRef.current = currentOffset + PAGE_SIZE;
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") setError(true);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [base, search, activeType, sort, filters]);

  useEffect(() => {
    fetchListings(true);
  }, [fetchListings]);

  const activeFilterCount = countActiveFilters(filters);
  const hasMore = listings.length > 0 && listings.length < total;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 12, backgroundColor: colors.background, borderBottomColor: colors.border }]}>

        <View style={styles.searchBarRow}>
          <View style={[styles.searchBar, { backgroundColor: colors.muted, borderRadius: colors.radius }]}>
            <Ionicons name="search-outline" size={18} color={colors.mutedForeground} />
            <TextInput
              style={[styles.searchInput, { color: colors.foreground }]}
              placeholder="Search make, model, keywords..."
              placeholderTextColor={colors.mutedForeground}
              value={search}
              onChangeText={setSearch}
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
            {search.length > 0 && Platform.OS !== "ios" && (
              <Pressable onPress={() => setSearch("")}>
                <Ionicons name="close-circle" size={18} color={colors.mutedForeground} />
              </Pressable>
            )}
          </View>

          <Pressable
            onPress={() => setShowFilters(true)}
            style={[styles.filterBtn, { backgroundColor: activeFilterCount > 0 ? colors.primary : colors.card, borderColor: activeFilterCount > 0 ? colors.primary : colors.border, borderRadius: 10 }]}
          >
            <Ionicons name="options-outline" size={18} color={activeFilterCount > 0 ? colors.primaryForeground : colors.foreground} />
            {activeFilterCount > 0 && (
              <View style={[styles.filterBadge, { backgroundColor: "#fff" }]}>
                <Text style={[styles.filterBadgeText, { color: colors.primary }]}>{activeFilterCount}</Text>
              </View>
            )}
          </Pressable>
        </View>

        <FlatList
          data={RV_TYPES}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.label}
          style={styles.typeList}
          contentContainerStyle={styles.typeListContent}
          renderItem={({ item }) => {
            const active = activeType === item.value;
            return (
              <Pressable
                onPress={() => setActiveType(item.value)}
                style={[styles.chip, { backgroundColor: active ? colors.primary : colors.card, borderColor: active ? colors.primary : colors.border, borderRadius: 20 }]}
              >
                <Text style={[styles.chipText, { color: active ? colors.primaryForeground : colors.foreground }]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          }}
        />

        <View style={styles.bottomRow}>
          <Text style={[styles.resultsCount, { color: colors.mutedForeground }]}>
            {loading ? "Loading…" : `${total.toLocaleString()} RVs`}
          </Text>
          <Pressable onPress={() => setShowSort(!showSort)} style={[styles.sortBtn, { borderColor: colors.border, borderRadius: 8 }]}>
            <Ionicons name="swap-vertical-outline" size={14} color={colors.mutedForeground} />
            <Text style={[styles.sortBtnText, { color: colors.mutedForeground }]}>
              {SORT_OPTIONS.find((o) => o.value === sort)?.label ?? "Sort"}
            </Text>
          </Pressable>
        </View>

        {showSort && (
          <Pressable style={styles.sortBackdrop} onPress={() => setShowSort(false)}>
            <View style={[styles.sortDropdown, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius, right: 16 }]}>
              {SORT_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.value}
                  onPress={() => { setSort(opt.value); setShowSort(false); }}
                  style={[styles.sortOption, { borderBottomColor: colors.border }]}
                >
                  <Text style={[styles.sortOptionText, { color: sort === opt.value ? colors.primary : colors.foreground }]}>
                    {opt.label}
                  </Text>
                  {sort === opt.value && <Ionicons name="checkmark" size={16} color={colors.primary} />}
                </Pressable>
              ))}
            </View>
          </Pressable>
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Searching inventory…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={40} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Failed to load listings</Text>
          <Pressable onPress={() => fetchListings(true)} style={[styles.retryBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}>
            <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold" }}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={listings}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingBottom: 100, paddingTop: 8 }}
          onRefresh={() => fetchListings(true)}
          refreshing={loading}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="search-outline" size={40} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No RVs match your filters</Text>
              {activeFilterCount > 0 && (
                <Pressable onPress={() => setFilters({})} style={[styles.retryBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}>
                  <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold" }}>Clear Filters</Text>
                </Pressable>
              )}
            </View>
          }
          ListFooterComponent={
            hasMore ? (
              <Pressable
                onPress={() => fetchListings(false)}
                disabled={loadingMore}
                style={[styles.loadMoreBtn, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}
              >
                {loadingMore
                  ? <ActivityIndicator size="small" color={colors.primary} />
                  : <>
                    <Ionicons name="chevron-down-outline" size={16} color={colors.primary} />
                    <Text style={[styles.loadMoreText, { color: colors.primary }]}>
                      Load More ({(total - listings.length).toLocaleString()} remaining)
                    </Text>
                  </>
                }
              </Pressable>
            ) : listings.length > 0 ? (
              <Text style={[styles.allLoadedText, { color: colors.mutedForeground }]}>
                All {total.toLocaleString()} listings shown
              </Text>
            ) : null
          }
          renderItem={({ item }) => (
            <Pressable onPress={() => router.push(`/listing/${item.id}`)}>
              <ListingCard listing={item} />
            </Pressable>
          )}
        />
      )}

      <FilterSheet
        visible={showFilters}
        filters={filters}
        onApply={setFilters}
        onClose={() => setShowFilters(false)}
        colors={colors}
        insets={{ bottom: insets.bottom }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { borderBottomWidth: 1, paddingBottom: 8, zIndex: 10 },
  searchBarRow: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, marginBottom: 10 },
  searchBar: { flex: 1, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, height: 44, gap: 8 },
  searchInput: { flex: 1, fontSize: 15, height: "100%", fontFamily: "Inter_400Regular" },
  filterBtn: { width: 44, height: 44, borderWidth: 1, alignItems: "center", justifyContent: "center", position: "relative" },
  filterBadge: { position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  filterBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  typeList: { marginBottom: 8 },
  typeListContent: { paddingHorizontal: 16, gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1 },
  chipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  bottomRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 4 },
  resultsCount: { fontSize: 13, fontFamily: "Inter_500Medium" },
  sortBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1 },
  sortBtnText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  sortBackdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: -9999, zIndex: 30 },
  sortDropdown: { position: "absolute", top: "100%", zIndex: 30, borderWidth: 1, minWidth: 200, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 6 },
  sortOption: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1 },
  sortOptionText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingVertical: 60 },
  loadingText: { fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 4 },
  emptyText: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center" },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, marginTop: 8 },
  loadMoreBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, margin: 16, padding: 14, borderWidth: 1 },
  loadMoreText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  allLoadedText: { textAlign: "center", fontSize: 13, fontFamily: "Inter_400Regular", paddingVertical: 20 },
  sheetContainer: { flex: 1 },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, borderBottomWidth: 1 },
  sheetClose: { padding: 4 },
  sheetTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  sheetReset: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  sheetBody: { paddingHorizontal: 20, paddingTop: 20, gap: 8 },
  sheetFooter: { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1 },
  applyBtn: { paddingVertical: 16, alignItems: "center" },
  applyBtnText: { fontSize: 16, fontFamily: "Inter_700Bold" },
  sectionLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, marginTop: 16, marginBottom: 8 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  filterToggle: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1 },
  filterToggleText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  rangeRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  rangeInput: { flex: 1, borderWidth: 1, padding: 12 },
  rangeLabel: { fontSize: 11, fontFamily: "Inter_500Medium", marginBottom: 2 },
  rangeValue: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  rangeDash: { fontSize: 18, fontFamily: "Inter_400Regular" },
});
