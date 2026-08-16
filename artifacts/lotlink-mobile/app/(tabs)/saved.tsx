import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useGetListings } from "@workspace/api-client-react";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ListingCard } from "@/components/ListingCard";
import { useColors } from "@/hooks/useColors";

const SAVED_KEY = "matchrv_saved_ids";

export function useSaved() {
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    AsyncStorage.getItem(SAVED_KEY).then((raw) => {
      if (raw) {
        try {
          const arr: number[] = JSON.parse(raw);
          setSavedIds(new Set(arr));
        } catch {}
      }
    });
  }, []);

  const toggleSave = useCallback(async (id: number) => {
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      AsyncStorage.setItem(SAVED_KEY, JSON.stringify(Array.from(next)));
      return next;
    });
  }, []);

  return { savedIds, toggleSave };
}

export default function SavedScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { savedIds, toggleSave } = useSaved();

  const idList = Array.from(savedIds);

  const { data, isLoading, refetch } = useGetListings(
    idList.length > 0
      ? { limit: 100 }
      : undefined
  );

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const savedListings = (data?.listings ?? []).filter((l) => savedIds.has(l.id));

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 12, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Saved</Text>
        {savedIds.size > 0 && (
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {savedIds.size} saved {savedIds.size === 1 ? "RV" : "RVs"}
          </Text>
        )}
      </View>

      {savedIds.size === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="heart-outline" size={52} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No saved RVs yet</Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            Tap the heart icon on any listing to save it here
          </Text>
        </View>
      ) : isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={savedListings}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: Platform.OS === "web" ? 100 : 100 },
          ]}
          onRefresh={refetch}
          refreshing={isLoading}
          scrollEnabled={!!savedListings.length}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                Listings not found
              </Text>
              <Pressable onPress={() => refetch()} style={[styles.retryBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}>
                <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold" }}>Refresh</Text>
              </Pressable>
            </View>
          }
          renderItem={({ item }) => (
            <ListingCard
              listing={item}
              saved={savedIds.has(item.id)}
              onToggleSave={toggleSave}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
  },
  listContent: {
    paddingTop: 12,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 40,
  },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
});
