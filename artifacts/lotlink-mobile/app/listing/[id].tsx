import { Ionicons } from "@expo/vector-icons";
import { useGetListing } from "@workspace/api-client-react";
import { router, useLocalSearchParams } from "expo-router";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Linking,
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
import { DealBadge } from "@/components/DealBadge";
import { useColors } from "@/hooks/useColors";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

function formatPrice(p: number) {
  return "$" + p.toLocaleString("en-US");
}

function formatType(type: string) {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

interface SpecRowProps {
  label: string;
  value: string | number | boolean | null | undefined;
  colors: ReturnType<typeof useColors>;
}

function SpecRow({ label, value, colors }: SpecRowProps) {
  if (value == null || value === "" || value === false) return null;
  const displayValue = typeof value === "boolean" ? "Yes" : String(value);
  return (
    <View style={[styles.specRow, { borderBottomColor: colors.border }]}>
      <Text style={[styles.specLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.specValue, { color: colors.foreground }]}>{displayValue}</Text>
    </View>
  );
}

interface ContactModalProps {
  visible: boolean;
  listing: any;
  onClose: () => void;
  colors: ReturnType<typeof useColors>;
  insets: { bottom: number; top: number };
  domain: string;
}

function ContactModal({ visible, listing, onClose, colors, insets, domain }: ContactModalProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState(`I'm interested in the ${listing?.year ?? ""} ${listing?.make ?? ""} ${listing?.model ?? ""}${listing?.price ? ` listed for ${formatPrice(listing.price)}` : ""}. I'd like to learn more and schedule a time to see it in person.`);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim() || !email.trim()) {
      Alert.alert("Required", "Please enter your name and email.");
      return;
    }
    setSubmitting(true);
    try {
      const base = domain ? `https://${domain}` : "";
      await fetch(`${base}/api/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: listing?.id,
          dealerName: listing?.dealer?.name,
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          message: message.trim(),
          source: "mobile_app",
        }),
      });
      setSent(true);
    } catch {
      Alert.alert("Error", "Could not send your message. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.contactSheet, { backgroundColor: colors.background }]}>
        <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
          <Pressable onPress={onClose} style={styles.sheetClose}>
            <Ionicons name="close" size={22} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Contact Dealer</Text>
          <View style={{ width: 30 }} />
        </View>

        {sent ? (
          <View style={styles.sentState}>
            <View style={[styles.sentIcon, { backgroundColor: colors.primary + "20" }]}>
              <Ionicons name="checkmark-circle" size={48} color={colors.primary} />
            </View>
            <Text style={[styles.sentTitle, { color: colors.foreground }]}>Message Sent!</Text>
            <Text style={[styles.sentSub, { color: colors.mutedForeground }]}>
              {listing?.dealer?.name} will be in touch with you soon.
            </Text>
            <Pressable onPress={onClose} style={[styles.doneBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}>
              <Text style={[styles.doneBtnText, { color: colors.primaryForeground }]}>Done</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView contentContainerStyle={[styles.contactBody, { paddingBottom: insets.bottom + 100 }]}>
            <View style={[styles.contactListingRow, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
              <View style={[styles.contactListingIcon, { backgroundColor: colors.secondary }]}>
                <Ionicons name="car-outline" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.contactListingTitle, { color: colors.foreground }]} numberOfLines={1}>
                  {listing?.year} {listing?.make} {listing?.model}
                </Text>
                <Text style={[styles.contactListingPrice, { color: colors.primary }]}>
                  {listing?.price ? formatPrice(listing.price) : ""}
                </Text>
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.formLabel, { color: colors.foreground }]}>Your Name *</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 10, color: colors.foreground }]}
                placeholder="Full name"
                placeholderTextColor={colors.mutedForeground}
                value={name}
                onChangeText={setName}
                autoCorrect={false}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.formLabel, { color: colors.foreground }]}>Email *</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 10, color: colors.foreground }]}
                placeholder="you@email.com"
                placeholderTextColor={colors.mutedForeground}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.formLabel, { color: colors.foreground }]}>Phone (optional)</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 10, color: colors.foreground }]}
                placeholder="(555) 000-0000"
                placeholderTextColor={colors.mutedForeground}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.formLabel, { color: colors.foreground }]}>Message</Text>
              <TextInput
                style={[styles.formTextarea, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 10, color: colors.foreground }]}
                placeholder="Your message..."
                placeholderTextColor={colors.mutedForeground}
                value={message}
                onChangeText={setMessage}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>

            <Pressable
              onPress={handleSubmit}
              disabled={submitting}
              style={[styles.sendBtn, { backgroundColor: colors.primary, borderRadius: colors.radius, opacity: submitting ? 0.7 : 1 }]}
            >
              {submitting
                ? <ActivityIndicator size="small" color="#fff" />
                : <>
                  <Ionicons name="send" size={16} color="#fff" />
                  <Text style={[styles.sendBtnText, { color: colors.primaryForeground }]}>Send Message</Text>
                </>
              }
            </Pressable>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

interface TowMatchResult {
  compatible: boolean;
  message: string;
  tow_capacity?: number;
  vehicle_gvwr?: number;
}

function TowMatchSection({ listing, colors, domain }: { listing: any; colors: ReturnType<typeof useColors>; domain: string }) {
  const [vehicle, setVehicle] = useState("");
  const [result, setResult] = useState<TowMatchResult | null>(null);
  const [checking, setChecking] = useState(false);

  const check = async () => {
    if (!vehicle.trim()) return;
    setChecking(true);
    setResult(null);
    try {
      const base = domain ? `https://${domain}` : "";
      const res = await fetch(`${base}/api/tow-match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicle: vehicle.trim(), gvwr: listing.gvwr }),
      });
      if (res.ok) setResult(await res.json());
      else setResult({ compatible: false, message: "Could not check compatibility. Try again." });
    } catch {
      setResult({ compatible: false, message: "Network error. Please try again." });
    } finally {
      setChecking(false);
    }
  };

  if (!listing.gvwr) return null;

  return (
    <View style={[styles.section, { borderTopColor: colors.border }]}>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Tow Match</Text>
      <Text style={[styles.towDesc, { color: colors.mutedForeground }]}>
        Check if your vehicle can tow this RV (GVWR: {listing.gvwr.toLocaleString()} lbs)
      </Text>
      <View style={styles.towRow}>
        <TextInput
          style={[styles.towInput, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 10, color: colors.foreground, flex: 1 }]}
          placeholder="e.g. 2022 Ford F-150"
          placeholderTextColor={colors.mutedForeground}
          value={vehicle}
          onChangeText={setVehicle}
          onSubmitEditing={check}
          returnKeyType="search"
        />
        <Pressable
          onPress={check}
          disabled={checking || !vehicle.trim()}
          style={[styles.towCheckBtn, { backgroundColor: colors.primary, borderRadius: 10, opacity: checking || !vehicle.trim() ? 0.6 : 1 }]}
        >
          {checking
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.towCheckBtnText}>Check</Text>
          }
        </Pressable>
      </View>

      {result && (
        <View style={[
          styles.towResult,
          {
            backgroundColor: result.compatible ? colors.primary + "10" : "#ef444420",
            borderColor: result.compatible ? colors.primary : "#ef4444",
            borderRadius: colors.radius,
          },
        ]}>
          <Ionicons
            name={result.compatible ? "checkmark-circle" : "close-circle"}
            size={24}
            color={result.compatible ? colors.primary : "#ef4444"}
          />
          <Text style={[styles.towResultText, { color: result.compatible ? colors.primary : "#ef4444" }]}>
            {result.message}
          </Text>
        </View>
      )}
    </View>
  );
}

export default function ListingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [showContact, setShowContact] = useState(false);

  const numericId = parseInt(id ?? "0", 10);
  const { data: listing, isLoading, isError, refetch } = useGetListing(numericId, {
    query: { enabled: !isNaN(numericId) && numericId > 0 },
  });

  const domain = process.env.EXPO_PUBLIC_DOMAIN ?? "";
  const bottomInset = Platform.OS === "web" ? 100 : insets.bottom;

  const handleCallDealer = () => {
    const phone = listing?.dealer?.phone;
    if (!phone) {
      Alert.alert("No phone number available");
      return;
    }
    const url = `tel:${phone.replace(/\D/g, "")}`;
    Linking.canOpenURL(url).then((can) => {
      if (can) Linking.openURL(url);
      else Alert.alert("Cannot make phone calls from this device");
    });
  };

  if (isLoading) {
    return (
      <View style={[styles.fullCenter, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (isError || !listing) {
    return (
      <View style={[styles.fullCenter, { backgroundColor: colors.background }]}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.mutedForeground} />
        <Text style={[styles.errorTitle, { color: colors.foreground }]}>Listing Not Found</Text>
        <Pressable onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}>
          <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold" }}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const images = listing.images ?? [];
  const hasImages = images.length > 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: bottomInset + 80 }}>
        <View style={styles.imageSection}>
          {hasImages ? (
            <>
              <FlatList
                data={images}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                keyExtractor={(_, i) => String(i)}
                onMomentumScrollEnd={(e) => {
                  const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
                  setActiveImageIndex(index);
                }}
                renderItem={({ item }) => (
                  <Image source={{ uri: item }} style={[styles.heroImage, { width: SCREEN_WIDTH }]} resizeMode="cover" />
                )}
              />
              {images.length > 1 && (
                <View style={styles.imageDots}>
                  {images.slice(0, 10).map((_, i) => (
                    <View
                      key={i}
                      style={[styles.dot, { backgroundColor: i === activeImageIndex ? "#fff" : "rgba(255,255,255,0.4)" }]}
                    />
                  ))}
                </View>
              )}
              <Text style={styles.imageCount}>{activeImageIndex + 1} / {Math.min(images.length, 10)}</Text>
            </>
          ) : (
            <View style={[styles.heroImage, styles.imagePlaceholder, { backgroundColor: colors.muted, width: SCREEN_WIDTH }]}>
              <Ionicons name="car-outline" size={60} color={colors.mutedForeground} />
            </View>
          )}
          <Pressable onPress={() => router.back()} style={[styles.backButton, { top: insets.top + 8 }]}>
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </Pressable>
        </View>

        <View style={styles.content}>
          <View style={styles.topSection}>
            <View style={styles.titleRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.typeLabel, { color: colors.mutedForeground }]}>{formatType(listing.type)}</Text>
                <Text style={[styles.titleText, { color: colors.foreground }]}>
                  {listing.year} {listing.make} {listing.model}
                </Text>
              </View>
              {listing.isNew && (
                <View style={[styles.newBadge, { backgroundColor: colors.primary }]}>
                  <Text style={styles.newBadgeText}>NEW</Text>
                </View>
              )}
            </View>

            <View style={styles.priceRow}>
              <Text style={[styles.price, { color: colors.foreground }]}>{formatPrice(listing.price)}</Text>
              {listing.marketValue && listing.marketValue > listing.price && (
                <View style={{ flex: 1 }}>
                  <Text style={[styles.marketValue, { color: colors.mutedForeground }]}>
                    {formatPrice(listing.marketValue)} est. market
                  </Text>
                  {listing.dealSavings && listing.dealSavings > 0 && (
                    <Text style={[styles.savings, { color: colors.dealGreat }]}>
                      Save {formatPrice(listing.dealSavings)}
                    </Text>
                  )}
                </View>
              )}
              <DealBadge score={listing.dealScore} />
            </View>

            <View style={styles.locationRow}>
              <Ionicons name="location-outline" size={14} color={colors.mutedForeground} />
              <Text style={[styles.location, { color: colors.mutedForeground }]}>{listing.location}</Text>
              {listing.daysOnMarket != null && (
                <Text style={[styles.daysOnMarket, { color: colors.mutedForeground }]}>
                  · {listing.daysOnMarket}d on market
                </Text>
              )}
            </View>
          </View>

          {listing.description && (
            <View style={[styles.section, { borderTopColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Description</Text>
              <Text style={[styles.description, { color: colors.mutedForeground }]}>{listing.description}</Text>
            </View>
          )}

          <View style={[styles.section, { borderTopColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Specs</Text>
            <View style={[styles.specsCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
              <SpecRow label="Condition" value={listing.isNew ? "New" : "Used"} colors={colors} />
              <SpecRow label="Length" value={listing.length ? `${listing.length} ft` : undefined} colors={colors} />
              <SpecRow label="Sleeps" value={listing.sleeps} colors={colors} />
              <SpecRow label="Slides" value={listing.slides && listing.slides > 0 ? listing.slides : undefined} colors={colors} />
              <SpecRow label="Mileage" value={listing.mileage ? `${listing.mileage.toLocaleString()} mi` : undefined} colors={colors} />
              <SpecRow label="GVWR" value={listing.gvwr ? `${listing.gvwr.toLocaleString()} lbs` : undefined} colors={colors} />
              <SpecRow label="Dry Weight" value={listing.dryWeight ? `${listing.dryWeight.toLocaleString()} lbs` : undefined} colors={colors} />
              <SpecRow label="Hitch Type" value={(listing as any).hitchType} colors={colors} />
              <SpecRow label="Fresh Water" value={listing.freshWater ? `${listing.freshWater} gal` : undefined} colors={colors} />
              <SpecRow label="Grey Water" value={(listing as any).greyWater ? `${(listing as any).greyWater} gal` : undefined} colors={colors} />
              <SpecRow label="Black Water" value={(listing as any).blackWater ? `${(listing as any).blackWater} gal` : undefined} colors={colors} />
              <SpecRow label="Generator" value={listing.generator} colors={colors} />
              <SpecRow label="Solar" value={listing.solar} colors={colors} />
              <SpecRow label="Awning" value={listing.awning} colors={colors} />
              <SpecRow label="Bed Size" value={(listing as any).bedSize} colors={colors} />
              <SpecRow label="VIN" value={listing.vin} colors={colors} />
            </View>
          </View>

          {listing.features && listing.features.length > 0 && (
            <View style={[styles.section, { borderTopColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Features</Text>
              <View style={styles.featuresGrid}>
                {(listing.features as string[]).map((feat: string, i: number) => (
                  <View key={i} style={[styles.featureTag, { backgroundColor: colors.secondary, borderRadius: colors.radius - 4 }]}>
                    <Ionicons name="checkmark-circle-outline" size={14} color={colors.primary} />
                    <Text style={[styles.featureText, { color: colors.foreground }]}>{feat}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          <TowMatchSection listing={listing} colors={colors} domain={domain} />

          {listing.dealer && (
            <View style={[styles.section, { borderTopColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Dealer</Text>
              <View style={[styles.dealerCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
                <View style={[styles.dealerAvatar, { backgroundColor: colors.secondary }]}>
                  <Ionicons name="business-outline" size={24} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.dealerName, { color: colors.foreground }]}>{listing.dealer.name}</Text>
                  <Text style={[styles.dealerLocation, { color: colors.mutedForeground }]}>
                    {listing.dealer.city}, {listing.dealer.state}
                  </Text>
                  {listing.dealer.rating != null && (
                    <View style={styles.dealerStats}>
                      <Ionicons name="star" size={12} color={colors.accent} />
                      <Text style={[styles.dealerStat, { color: colors.mutedForeground }]}>
                        {listing.dealer.rating.toFixed(1)} · Responds in {listing.dealer.avgResponseTime ?? "1-2 days"}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.background, paddingBottom: bottomInset + 8 }]}>
        <Pressable
          onPress={handleCallDealer}
          style={[styles.footerBtnOutline, { borderColor: colors.border, borderRadius: colors.radius }]}
        >
          <Ionicons name="call-outline" size={20} color={colors.foreground} />
        </Pressable>
        <Pressable
          onPress={() => setShowContact(true)}
          style={[styles.footerBtnPrimary, { backgroundColor: colors.primary, borderRadius: colors.radius, flex: 1 }]}
        >
          <Ionicons name="mail-outline" size={18} color="#fff" />
          <Text style={styles.footerBtnText}>Contact Dealer</Text>
        </Pressable>
      </View>

      <ContactModal
        visible={showContact}
        listing={listing}
        onClose={() => setShowContact(false)}
        colors={colors}
        insets={{ bottom: insets.bottom, top: insets.top }}
        domain={domain}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  fullCenter: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  errorTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  backBtn: { paddingHorizontal: 20, paddingVertical: 10 },
  imageSection: { position: "relative" },
  heroImage: { height: 280 },
  imagePlaceholder: { alignItems: "center", justifyContent: "center" },
  imageDots: { position: "absolute", bottom: 12, left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  imageCount: { position: "absolute", bottom: 12, right: 14, color: "rgba(255,255,255,0.8)", fontSize: 12, fontFamily: "Inter_500Medium" },
  backButton: { position: "absolute", left: 16, width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" },
  content: { padding: 20, gap: 0 },
  topSection: { paddingBottom: 20, gap: 10 },
  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  typeLabel: { fontSize: 12, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 },
  titleText: { fontSize: 22, fontFamily: "Inter_700Bold", lineHeight: 28 },
  newBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, marginTop: 4 },
  newBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: 0.5 },
  priceRow: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  price: { fontSize: 26, fontFamily: "Inter_700Bold" },
  marketValue: { fontSize: 12, fontFamily: "Inter_400Regular", textDecorationLine: "line-through" },
  savings: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 4, flexWrap: "wrap" },
  location: { fontSize: 13, fontFamily: "Inter_400Regular" },
  daysOnMarket: { fontSize: 13, fontFamily: "Inter_400Regular" },
  section: { borderTopWidth: 1, paddingTop: 20, paddingBottom: 4, marginBottom: 16, gap: 12 },
  sectionTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  description: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22 },
  specsCard: { borderWidth: 1, overflow: "hidden" },
  specRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  specLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  specValue: { fontSize: 13, fontFamily: "Inter_500Medium", textAlign: "right", flex: 1, marginLeft: 16 },
  featuresGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  featureTag: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6 },
  featureText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  towDesc: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18, marginTop: -4 },
  towRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  towInput: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, fontFamily: "Inter_400Regular" },
  towCheckBtn: { paddingHorizontal: 16, paddingVertical: 11, alignItems: "center", justifyContent: "center" },
  towCheckBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  towResult: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 14, borderWidth: 1.5, marginTop: 4 },
  towResultText: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium", lineHeight: 18 },
  dealerCard: { flexDirection: "row", alignItems: "center", borderWidth: 1, padding: 14, gap: 12 },
  dealerAvatar: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  dealerName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  dealerLocation: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  dealerStats: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4, flexWrap: "wrap" },
  dealerStat: { fontSize: 11, fontFamily: "Inter_400Regular" },
  footer: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 1 },
  footerBtnOutline: { width: 46, height: 46, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  footerBtnPrimary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 46 },
  footerBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  contactSheet: { flex: 1 },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, borderBottomWidth: 1 },
  sheetClose: { padding: 4 },
  sheetTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  contactBody: { paddingHorizontal: 20, paddingTop: 20, gap: 16 },
  contactListingRow: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12, borderWidth: 1 },
  contactListingIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  contactListingTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  contactListingPrice: { fontSize: 13, fontFamily: "Inter_500Medium", marginTop: 2 },
  formGroup: { gap: 6 },
  formLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  formInput: { borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: "Inter_400Regular" },
  formTextarea: { borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: "Inter_400Regular", minHeight: 100 },
  sendBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16, marginTop: 8 },
  sendBtnText: { fontSize: 16, fontFamily: "Inter_700Bold" },
  sentState: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40, gap: 16 },
  sentIcon: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center" },
  sentTitle: { fontSize: 24, fontFamily: "Inter_700Bold" },
  sentSub: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22 },
  doneBtn: { paddingHorizontal: 32, paddingVertical: 14, marginTop: 8 },
  doneBtnText: { fontSize: 16, fontFamily: "Inter_700Bold" },
});
