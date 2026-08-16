import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useColors } from "@/hooks/useColors";
import { DealBadge } from "./DealBadge";
import type { Listing } from "@workspace/api-client-react";

interface ListingCardProps {
  listing: Listing;
  saved?: boolean;
  onToggleSave?: (id: number) => void;
}

function formatPrice(price: number): string {
  return "$" + price.toLocaleString("en-US");
}

function formatType(type: string): string {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function ListingCard({ listing, saved = false, onToggleSave }: ListingCardProps) {
  const colors = useColors();
  const imageUrl = listing.images?.[0] ?? null;

  return (
    <Pressable
      onPress={() => router.push(`/listing/${listing.id}`)}
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderRadius: colors.radius,
        },
      ]}
    >
      <View style={[styles.imageWrapper, { borderRadius: colors.radius - 2 }]}>
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={styles.image}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.imagePlaceholder, { backgroundColor: colors.muted }]}>
            <Ionicons name="car-outline" size={40} color={colors.mutedForeground} />
          </View>
        )}

        {listing.isNew && (
          <View style={[styles.newBadge, { backgroundColor: colors.primary }]}>
            <Text style={[styles.newBadgeText, { color: colors.primaryForeground }]}>NEW</Text>
          </View>
        )}

        {listing.dealSavings && listing.dealSavings > 0 && (
          <View style={[styles.savingsBadge, { backgroundColor: colors.dealGreat }]}>
            <Text style={styles.savingsText}>Save {formatPrice(listing.dealSavings)}</Text>
          </View>
        )}

        {onToggleSave && (
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              onToggleSave(listing.id);
            }}
            style={[styles.saveBtn, { backgroundColor: colors.card + "EE" }]}
            hitSlop={8}
          >
            <Ionicons
              name={saved ? "heart" : "heart-outline"}
              size={18}
              color={saved ? colors.dealOverpriced : colors.mutedForeground}
            />
          </Pressable>
        )}
      </View>

      <View style={styles.body}>
        <View style={styles.topRow}>
          <Text style={[styles.typeLabel, { color: colors.mutedForeground }]}>
            {formatType(listing.type)}
          </Text>
          <DealBadge score={listing.dealScore} size="sm" />
        </View>

        <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={2}>
          {listing.year} {listing.make} {listing.model}
        </Text>

        <View style={styles.priceRow}>
          <Text style={[styles.price, { color: colors.foreground }]}>
            {formatPrice(listing.price)}
          </Text>
          {listing.marketValue && listing.marketValue > listing.price && (
            <Text style={[styles.marketValue, { color: colors.mutedForeground }]}>
              {formatPrice(listing.marketValue)} est.
            </Text>
          )}
        </View>

        <View style={styles.specsRow}>
          {listing.length && (
            <View style={styles.spec}>
              <Ionicons name="resize-outline" size={12} color={colors.mutedForeground} />
              <Text style={[styles.specText, { color: colors.mutedForeground }]}>
                {listing.length}′
              </Text>
            </View>
          )}
          {listing.sleeps != null && (
            <View style={styles.spec}>
              <Ionicons name="bed-outline" size={12} color={colors.mutedForeground} />
              <Text style={[styles.specText, { color: colors.mutedForeground }]}>
                Sleeps {listing.sleeps}
              </Text>
            </View>
          )}
          {listing.slides != null && listing.slides > 0 && (
            <View style={styles.spec}>
              <Ionicons name="layers-outline" size={12} color={colors.mutedForeground} />
              <Text style={[styles.specText, { color: colors.mutedForeground }]}>
                {listing.slides} slide{listing.slides !== 1 ? "s" : ""}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.locationRow}>
          <Ionicons name="location-outline" size={12} color={colors.mutedForeground} />
          <Text style={[styles.locationText, { color: colors.mutedForeground }]} numberOfLines={1}>
            {listing.location}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  imageWrapper: {
    position: "relative",
    height: 180,
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  imagePlaceholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  newBadge: {
    position: "absolute",
    top: 10,
    left: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  newBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  savingsBadge: {
    position: "absolute",
    bottom: 10,
    left: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  savingsText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  saveBtn: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    padding: 14,
    gap: 6,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  typeLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 20,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
  },
  price: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  marketValue: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textDecorationLine: "line-through",
  },
  specsRow: {
    flexDirection: "row",
    gap: 12,
    flexWrap: "wrap",
  },
  spec: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  specText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  locationText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
});
