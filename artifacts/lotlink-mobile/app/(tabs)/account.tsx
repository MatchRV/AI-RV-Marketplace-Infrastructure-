import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

const PREFS_KEY = "matchrv_prefs";

interface Prefs {
  name: string;
  towVehicle: string;
  budgetMin: string;
  budgetMax: string;
  campingStyle: string;
}

const DEFAULT_PREFS: Prefs = {
  name: "",
  towVehicle: "",
  budgetMin: "",
  budgetMax: "",
  campingStyle: "",
};

const CAMPING_STYLES = ["Full hookups", "Dry camping", "Boondocking", "Mix of all"];

export default function AccountScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [saved, setSaved] = useState(false);

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 100 : 100;

  useEffect(() => {
    AsyncStorage.getItem(PREFS_KEY).then((raw) => {
      if (raw) {
        try {
          setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(raw) });
        } catch {}
      }
    });
  }, []);

  const save = async () => {
    await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const update = (key: keyof Prefs, value: string) => {
    setPrefs((p) => ({ ...p, [key]: value }));
  };

  if (!user) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }]}>
        <View style={{ alignItems: "center", paddingHorizontal: 32 }}>
          <View style={[styles.userAvatar, { backgroundColor: colors.muted, width: 72, height: 72, borderRadius: 36, marginBottom: 20 }]}>
            <Ionicons name="person-outline" size={36} color={colors.mutedForeground} />
          </View>
          <Text style={[styles.title, { color: colors.foreground, marginBottom: 8 }]}>Sign In to Your Account</Text>
          <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 14, textAlign: "center", marginBottom: 28, lineHeight: 22 }}>
            Save your favorite RVs, set up deal alerts, and personalize your search experience.
          </Text>
          <Pressable
            onPress={() => router.push("/login")}
            style={[{ backgroundColor: colors.primary, borderRadius: colors.radius, paddingVertical: 14, paddingHorizontal: 32, width: "100%", alignItems: "center" }]}
          >
            <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 16 }}>Sign In / Create Account</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: bottomInset }}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.header, { paddingTop: topInset + 12, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Account</Text>
      </View>

      {user && (
        <View style={[styles.userCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
          <View style={[styles.userAvatar, { backgroundColor: colors.primary }]}>
            <Text style={styles.userAvatarText}>
              {user.name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.userName, { color: colors.foreground }]}>{user.name}</Text>
            <Text style={[styles.userEmail, { color: colors.mutedForeground }]}>{user.email}</Text>
          </View>
          <Pressable
            onPress={() =>
              Alert.alert("Sign Out", "Are you sure you want to sign out?", [
                { text: "Cancel", style: "cancel" },
                { text: "Sign Out", style: "destructive", onPress: signOut },
              ])
            }
          >
            <Ionicons name="log-out-outline" size={22} color={colors.mutedForeground} />
          </Pressable>
        </View>
      )}

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>PROFILE</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
          <View style={[styles.field, { borderBottomColor: colors.border }]}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Your Name</Text>
            <TextInput
              style={[styles.fieldInput, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}
              placeholder="e.g. John Smith"
              placeholderTextColor={colors.mutedForeground}
              value={prefs.name}
              onChangeText={(v) => update("name", v)}
            />
          </View>
          <View style={styles.field}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Tow Vehicle</Text>
            <TextInput
              style={[styles.fieldInput, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}
              placeholder="e.g. 2022 Ford F-250"
              placeholderTextColor={colors.mutedForeground}
              value={prefs.towVehicle}
              onChangeText={(v) => update("towVehicle", v)}
            />
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>BUDGET</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
          <View style={[styles.field, { borderBottomColor: colors.border }]}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Minimum ($)</Text>
            <TextInput
              style={[styles.fieldInput, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}
              placeholder="e.g. 20000"
              placeholderTextColor={colors.mutedForeground}
              value={prefs.budgetMin}
              onChangeText={(v) => update("budgetMin", v)}
              keyboardType="numeric"
            />
          </View>
          <View style={styles.field}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Maximum ($)</Text>
            <TextInput
              style={[styles.fieldInput, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}
              placeholder="e.g. 100000"
              placeholderTextColor={colors.mutedForeground}
              value={prefs.budgetMax}
              onChangeText={(v) => update("budgetMax", v)}
              keyboardType="numeric"
            />
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>CAMPING STYLE</Text>
        <View style={styles.stylesGrid}>
          {CAMPING_STYLES.map((style) => {
            const active = prefs.campingStyle === style;
            return (
              <Pressable
                key={style}
                onPress={() => update("campingStyle", active ? "" : style)}
                style={[
                  styles.styleChip,
                  {
                    backgroundColor: active ? colors.primary : colors.card,
                    borderColor: active ? colors.primary : colors.border,
                    borderRadius: colors.radius,
                  },
                ]}
              >
                <Text style={[styles.styleChipText, { color: active ? "#fff" : colors.foreground }]}>
                  {style}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Pressable
        onPress={save}
        style={[styles.saveBtn, { backgroundColor: saved ? colors.dealGreat : colors.primary, borderRadius: colors.radius }]}
      >
        <Ionicons name={saved ? "checkmark" : "save-outline"} size={18} color="#fff" />
        <Text style={styles.saveBtnText}>{saved ? "Saved!" : "Save Preferences"}</Text>
      </Pressable>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>DISCOVER</Text>
        <Pressable
          onPress={() => router.push("/")}
          style={[styles.navCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}
        >
          <Ionicons name="swap-horizontal-outline" size={22} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.navCardTitle, { color: colors.foreground }]}>Start Swiping</Text>
            <Text style={[styles.navCardSub, { color: colors.mutedForeground }]}>Find your next RV</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
        </Pressable>

        <Pressable
          onPress={() => router.push("/outfitter")}
          style={[styles.navCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}
        >
          <Ionicons name="compass-outline" size={22} color={colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.navCardTitle, { color: colors.foreground }]}>AI Outfitter</Text>
            <Text style={[styles.navCardSub, { color: colors.mutedForeground }]}>Get personalized matches</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
        </Pressable>
      </View>

      <View style={[styles.about, { borderTopColor: colors.border }]}>
        <Text style={[styles.aboutText, { color: colors.mutedForeground }]}>
          MatchRV RV Marketplace
        </Text>
        <Text style={[styles.aboutVersion, { color: colors.mutedForeground }]}>
          Version 1.0
        </Text>
      </View>
    </ScrollView>
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
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderWidth: 1,
  },
  userAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  userAvatarText: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  userName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  userEmail: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  section: {
    paddingHorizontal: 16,
    marginTop: 24,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1,
    paddingHorizontal: 4,
  },
  card: {
    borderWidth: 1,
    overflow: "hidden",
  },
  field: {
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  fieldLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    marginBottom: 4,
  },
  fieldInput: {
    fontSize: 15,
    padding: 0,
  },
  stylesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  styleChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
  },
  styleChipText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 24,
    paddingVertical: 14,
  },
  saveBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  navCard: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  navCardTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  navCardSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  about: {
    paddingHorizontal: 16,
    paddingTop: 24,
    marginTop: 24,
    borderTopWidth: 1,
    alignItems: "center",
    gap: 4,
    paddingBottom: 20,
  },
  aboutText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  aboutVersion: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
});
