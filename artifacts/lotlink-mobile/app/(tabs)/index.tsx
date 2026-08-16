import { Ionicons } from "@expo/vector-icons";
import { useGetListings } from "@workspace/api-client-react";
import type { Listing } from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DealBadge } from "@/components/DealBadge";
import { useColors } from "@/hooks/useColors";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const SWIPE_THRESHOLD = SCREEN_W * 0.35;
const CARD_WIDTH = SCREEN_W - 32;

function formatPrice(p: number) {
  return "$" + p.toLocaleString("en-US");
}

function formatType(type: string) {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

interface SwipeCardProps {
  listing: Listing;
  onLike: () => void;
  onPass: () => void;
  colors: ReturnType<typeof useColors>;
}

function SwipeCard({ listing, onLike, onPass, colors }: SwipeCardProps) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const rotate = useSharedValue(0);
  const likeOpacity = useSharedValue(0);
  const passOpacity = useSharedValue(0);

  const handleLike = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    translateX.value = withTiming(SCREEN_W * 1.5, { duration: 300 });
    rotate.value = withTiming(30, { duration: 300 });
    setTimeout(onLike, 300);
  }, [onLike]);

  const handlePass = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    translateX.value = withTiming(-SCREEN_W * 1.5, { duration: 300 });
    rotate.value = withTiming(-30, { duration: 300 });
    setTimeout(onPass, 300);
  }, [onPass]);

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderMove: (_, gesture) => {
      translateX.value = gesture.dx;
      translateY.value = gesture.dy * 0.3;
      rotate.value = (gesture.dx / SCREEN_W) * 20;
      likeOpacity.value = Math.max(0, Math.min(1, gesture.dx / SWIPE_THRESHOLD));
      passOpacity.value = Math.max(0, Math.min(1, -gesture.dx / SWIPE_THRESHOLD));
    },
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dx > SWIPE_THRESHOLD) {
        handleLike();
      } else if (gesture.dx < -SWIPE_THRESHOLD) {
        handlePass();
      } else {
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        rotate.value = withSpring(0);
        likeOpacity.value = withTiming(0);
        passOpacity.value = withTiming(0);
      }
    },
  });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotate: `${rotate.value}deg` },
    ],
  }));

  const likeStyle = useAnimatedStyle(() => ({
    opacity: likeOpacity.value,
  }));

  const passStyle = useAnimatedStyle(() => ({
    opacity: passOpacity.value,
  }));

  const imageUrl = listing.images?.[0];

  return (
    <Animated.View style={[styles.card, cardStyle, { backgroundColor: colors.card, borderRadius: colors.radius + 4 }]} {...panResponder.panHandlers}>
      <View style={styles.cardImageWrapper}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.cardImage} resizeMode="cover" />
        ) : (
          <View style={[styles.cardImagePlaceholder, { backgroundColor: colors.muted }]}>
            <Ionicons name="car-outline" size={60} color={colors.mutedForeground} />
          </View>
        )}

        <Animated.View style={[styles.stamp, styles.stampLike, likeStyle]}>
          <Text style={styles.stampText}>LIKE</Text>
        </Animated.View>
        <Animated.View style={[styles.stamp, styles.stampPass, passStyle]}>
          <Text style={styles.stampText}>PASS</Text>
        </Animated.View>

        <View style={styles.cardOverlay}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {listing.year} {listing.make} {listing.model}
          </Text>
          <View style={styles.cardLocation}>
            <Ionicons name="location-outline" size={12} color="rgba(255,255,255,0.8)" />
            <Text style={styles.cardLocationText}>{listing.location}</Text>
          </View>
        </View>
      </View>

      <View style={styles.cardBody}>
        <View style={styles.cardTopRow}>
          <Text style={[styles.cardPrice, { color: colors.foreground }]}>{formatPrice(listing.price)}</Text>
          <DealBadge score={listing.dealScore} />
        </View>

        <Text style={[styles.cardType, { color: colors.mutedForeground }]}>{formatType(listing.type)}</Text>

        <View style={styles.cardSpecs}>
          {listing.length && (
            <View style={[styles.cardSpec, { backgroundColor: colors.muted, borderRadius: 6 }]}>
              <Text style={[styles.cardSpecText, { color: colors.mutedForeground }]}>{listing.length}′ long</Text>
            </View>
          )}
          {listing.sleeps != null && (
            <View style={[styles.cardSpec, { backgroundColor: colors.muted, borderRadius: 6 }]}>
              <Text style={[styles.cardSpecText, { color: colors.mutedForeground }]}>Sleeps {listing.sleeps}</Text>
            </View>
          )}
          {listing.slides != null && listing.slides > 0 && (
            <View style={[styles.cardSpec, { backgroundColor: colors.muted, borderRadius: 6 }]}>
              <Text style={[styles.cardSpecText, { color: colors.mutedForeground }]}>{listing.slides} slide{listing.slides !== 1 ? "s" : ""}</Text>
            </View>
          )}
          {listing.isNew && (
            <View style={[styles.cardSpec, { backgroundColor: colors.primary + "20", borderRadius: 6 }]}>
              <Text style={[styles.cardSpecText, { color: colors.primary }]}>New</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.cardActions}>
        <Pressable
          onPress={handlePass}
          style={[styles.actionBtn, styles.passBtn, { backgroundColor: "#E53E3E15", borderColor: "#E53E3E40" }]}
        >
          <Ionicons name="close" size={28} color="#E53E3E" />
        </Pressable>

        <Pressable
          onPress={() => router.push(`/listing/${listing.id}`)}
          style={[styles.actionBtn, styles.infoBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
        >
          <Ionicons name="information-circle-outline" size={22} color={colors.foreground} />
        </Pressable>

        <Pressable
          onPress={handleLike}
          style={[styles.actionBtn, styles.likeBtn, { backgroundColor: colors.primary + "15", borderColor: colors.primary + "40" }]}
        >
          <Ionicons name="heart" size={28} color={colors.primary} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

export default function DiscoverScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [likedIds, setLikedIds] = useState<number[]>([]);

  const { data, isLoading, isError, refetch } = useGetListings({ limit: 50, sort: "recommended" });
  const listings = data?.listings ?? [];

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 100 : insets.bottom;

  const handleLike = useCallback(() => {
    const listing = listings[currentIndex];
    if (listing) {
      setLikedIds((prev) => [...prev, listing.id]);
    }
    setCurrentIndex((i) => i + 1);
  }, [currentIndex, listings]);

  const handlePass = useCallback(() => {
    setCurrentIndex((i) => i + 1);
  }, []);

  const progress = listings.length > 0 ? currentIndex / listings.length : 0;
  const isDone = listings.length === 0 || currentIndex >= listings.length;

  if (isLoading) {
    return (
      <View style={[styles.fullCenter, { backgroundColor: colors.background, paddingTop: topInset }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Loading RVs...</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.fullCenter, { backgroundColor: colors.background, paddingTop: topInset }]}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.mutedForeground} />
        <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Couldn't load listings</Text>
        <Pressable onPress={() => refetch()} style={[styles.ctaBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}>
          <Text style={styles.ctaBtnText}>Try Again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 12 }]}>
        <View>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Discover</Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>Swipe to find your rig</Text>
        </View>
        {likedIds.length > 0 && (
          <View style={[styles.likedBadge, { backgroundColor: colors.primary }]}>
            <Ionicons name="heart" size={12} color="#fff" />
            <Text style={styles.likedBadgeText}>{likedIds.length}</Text>
          </View>
        )}
      </View>

      <View style={styles.progressBarBg}>
        <View style={[styles.progressBarFill, { width: `${progress * 100}%`, backgroundColor: colors.primary }]} />
      </View>
      <Text style={[styles.progressText, { color: colors.mutedForeground }]}>
        {currentIndex} of {listings.length} reviewed · {likedIds.length} liked
      </Text>

      {isDone ? (
        <View style={styles.doneContainer}>
          <View style={[styles.doneIcon, { backgroundColor: colors.secondary }]}>
            <Ionicons name="checkmark-circle" size={48} color={colors.primary} />
          </View>
          <Text style={[styles.doneTitle, { color: colors.foreground }]}>
            You've seen them all!
          </Text>
          <Text style={[styles.doneSub, { color: colors.mutedForeground }]}>
            You liked {likedIds.length} {likedIds.length === 1 ? "RV" : "RVs"}
          </Text>

          {likedIds.length > 0 && (
            <Pressable
              onPress={() => router.push("/outfitter")}
              style={[styles.ctaBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
            >
              <Ionicons name="compass" size={18} color="#fff" />
              <Text style={styles.ctaBtnText}>Chat with AI Outfitter</Text>
            </Pressable>
          )}

          <Pressable
            onPress={() => { setCurrentIndex(0); setLikedIds([]); refetch(); }}
            style={[styles.resetBtn, { borderColor: colors.border, borderRadius: colors.radius }]}
          >
            <Ionicons name="refresh" size={16} color={colors.mutedForeground} />
            <Text style={[styles.resetBtnText, { color: colors.mutedForeground }]}>Start Over</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.cardsContainer}>
          {listings[currentIndex + 1] && (
            <View style={[styles.behindCard, { backgroundColor: colors.card, borderRadius: colors.radius + 4 }]} />
          )}
          {listings[currentIndex] && (
            <SwipeCard
              key={currentIndex}
              listing={listings[currentIndex]}
              onLike={handleLike}
              onPass={handlePass}
              colors={colors}
            />
          )}
        </View>
      )}
    </View>
  );
}

const CARD_HEIGHT = Math.min(SCREEN_H * 0.62, 540);

const styles = StyleSheet.create({
  container: { flex: 1 },
  fullCenter: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  loadingText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerTitle: { fontSize: 28, fontFamily: "Inter_700Bold" },
  headerSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  likedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  likedBadgeText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 13 },
  progressBarBg: {
    height: 3,
    marginHorizontal: 16,
    backgroundColor: "#E2E8F0",
    borderRadius: 2,
    overflow: "hidden",
    marginBottom: 6,
  },
  progressBarFill: { height: "100%", borderRadius: 2 },
  progressText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginBottom: 12,
  },
  cardsContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  behindCard: {
    position: "absolute",
    width: CARD_WIDTH,
    height: CARD_HEIGHT - 16,
    top: 12,
    opacity: 0.7,
    transform: [{ scale: 0.96 }],
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  card: {
    width: CARD_WIDTH,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 8,
    overflow: "hidden",
  },
  cardImageWrapper: {
    position: "relative",
    height: CARD_HEIGHT * 0.55,
    overflow: "hidden",
  },
  cardImage: { width: "100%", height: "100%" },
  cardImagePlaceholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  stamp: {
    position: "absolute",
    top: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 3,
  },
  stampLike: {
    left: 16,
    borderColor: "#22C55E",
    transform: [{ rotate: "-15deg" }],
  },
  stampPass: {
    right: 16,
    borderColor: "#E53E3E",
    transform: [{ rotate: "15deg" }],
  },
  stampText: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    letterSpacing: 2,
  },
  cardOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 14,
    backgroundColor: "rgba(0,0,0,0.38)",
  },
  cardTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    lineHeight: 24,
  },
  cardLocation: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 3,
  },
  cardLocationText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.8)",
  },
  cardBody: {
    padding: 14,
    gap: 6,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardPrice: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
  },
  cardType: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  cardSpecs: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
  },
  cardSpec: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  cardSpecText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  cardActions: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
    padding: 14,
    paddingTop: 6,
  },
  actionBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  passBtn: {},
  infoBtn: { width: 44, height: 44, borderRadius: 22 },
  likeBtn: {},
  doneContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingHorizontal: 32,
  },
  doneIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  doneTitle: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  doneSub: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: -8,
  },
  ctaBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
    marginTop: 8,
  },
  ctaBtnText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  resetBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderWidth: 1,
  },
  resetBtnText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
  },
});
