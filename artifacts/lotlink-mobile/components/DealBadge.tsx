import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";

type DealScore = "great_deal" | "good_deal" | "fair_deal" | "high_price" | "overpriced";

const LABELS: Record<DealScore, string> = {
  great_deal: "Great Deal",
  good_deal: "Good Deal",
  fair_deal: "Fair Deal",
  high_price: "High Price",
  overpriced: "Overpriced",
};

interface DealBadgeProps {
  score: DealScore | string;
  size?: "sm" | "md";
}

export function DealBadge({ score, size = "md" }: DealBadgeProps) {
  const colors = useColors();

  const getColor = () => {
    switch (score) {
      case "great_deal": return colors.dealGreat;
      case "good_deal": return colors.dealGood;
      case "fair_deal": return colors.dealFair;
      case "high_price": return colors.dealHigh;
      case "overpriced": return colors.dealOverpriced;
      default: return colors.mutedForeground;
    }
  };

  const color = getColor();
  const label = LABELS[score as DealScore] ?? score;

  return (
    <View style={[
      styles.badge,
      {
        backgroundColor: color + "1A",
        borderColor: color + "40",
        paddingHorizontal: size === "sm" ? 6 : 10,
        paddingVertical: size === "sm" ? 2 : 4,
      },
    ]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[
        styles.text,
        {
          color,
          fontSize: size === "sm" ? 11 : 12,
        },
      ]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    borderWidth: 1,
    gap: 4,
    alignSelf: "flex-start",
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  text: {
    fontFamily: "Inter_600SemiBold",
  },
});
