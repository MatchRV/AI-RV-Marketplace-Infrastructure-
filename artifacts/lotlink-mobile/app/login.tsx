import { Ionicons } from "@expo/vector-icons";
import * as Google from "expo-auth-session/providers/google";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
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

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? "";
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "";

type Screen = "main" | "email";

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { signIn } = useAuth();

  const [screen, setScreen] = useState<Screen>("main");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const [request, response, promptAsync] = Google.useAuthRequest({
    clientId: GOOGLE_WEB_CLIENT_ID || GOOGLE_CLIENT_ID,
    iosClientId: GOOGLE_CLIENT_ID,
    webClientId: GOOGLE_WEB_CLIENT_ID || GOOGLE_CLIENT_ID,
  });

  useEffect(() => {
    if (response?.type === "success") {
      const token = response.authentication?.accessToken;
      if (token) {
        fetchGoogleUser(token);
      }
    } else if (response?.type === "error") {
      Alert.alert("Google Sign-In Error", "Something went wrong. Please try again.");
    }
  }, [response]);

  const fetchGoogleUser = async (token: string) => {
    setLoading(true);
    try {
      const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      await signIn({
        id: data.sub ?? Crypto.randomUUID(),
        name: data.name ?? "Google User",
        email: data.email ?? "",
        provider: "google",
        avatar: data.picture,
      });
      if (router.canGoBack()) router.back();
    } catch {
      Alert.alert("Error", "Could not retrieve Google profile. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    if (!GOOGLE_CLIENT_ID && !GOOGLE_WEB_CLIENT_ID) {
      Alert.alert(
        "Coming Soon",
        "Google Sign-In will be available in the full app. Use email to sign in for now.",
        [{ text: "OK", onPress: () => setScreen("email") }]
      );
      return;
    }
    await promptAsync();
  };

  const handleApple = async () => {
    Alert.alert(
      "Apple Sign-In",
      "Apple Sign-In is available on the native iOS app. Use email to sign in for now.",
      [{ text: "OK", onPress: () => setScreen("email") }]
    );
  };

  const handleEmailSubmit = async () => {
    if (!name.trim()) {
      Alert.alert("Name required", "Please enter your name.");
      return;
    }
    if (!email.trim() || !email.includes("@")) {
      Alert.alert("Valid email required", "Please enter a valid email address.");
      return;
    }
    setLoading(true);
    await signIn({
      id: Crypto.randomUUID(),
      name: name.trim(),
      email: email.trim().toLowerCase(),
      provider: "email",
    });
    setLoading(false);
    if (router.canGoBack()) router.back();
  };

  if (screen === "email") {
    return (
      <KeyboardAvoidingView
        style={[styles.flex, { backgroundColor: colors.background }]}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={[styles.emailContainer, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 40 }]}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable style={styles.backBtn} onPress={() => setScreen("main")}>
            <Ionicons name="arrow-back" size={22} color={colors.foreground} />
          </Pressable>

          <Image
            source={require("../assets/logo.png")}
            style={styles.emailLogo}
            resizeMode="contain"
          />

          <Text style={[styles.emailTitle, { color: colors.foreground }]}>
            Sign in with Email
          </Text>
          <Text style={[styles.emailSub, { color: colors.mutedForeground }]}>
            No password needed — just your name and email.
          </Text>

          <View style={[styles.inputGroup, { borderColor: colors.border, backgroundColor: colors.card, borderRadius: colors.radius }]}>
            <View style={[styles.inputRow, { borderBottomColor: colors.border }]}>
              <Ionicons name="person-outline" size={18} color={colors.mutedForeground} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                placeholder="Your name"
                placeholderTextColor={colors.mutedForeground}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                autoComplete="name"
                returnKeyType="next"
              />
            </View>
            <View style={styles.inputRow}>
              <Ionicons name="mail-outline" size={18} color={colors.mutedForeground} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                placeholder="Email address"
                placeholderTextColor={colors.mutedForeground}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                returnKeyType="done"
                onSubmitEditing={handleEmailSubmit}
              />
            </View>
          </View>

          <Pressable
            onPress={handleEmailSubmit}
            disabled={loading}
            style={[styles.continueBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.continueBtnText}>Continue</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={[styles.flex, styles.mainBg]}>
      <View style={[styles.main, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 32 }]}>
        <View style={styles.logoSection}>
          <Image
            source={require("../assets/logo.png")}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.slogan}>Find Your Perfect RV Match</Text>
          <Text style={styles.tagline}>
            Browse real dealer inventory, get AI-powered matches, and drive away happy.
          </Text>
        </View>

        <View style={styles.buttonsSection}>
          <Pressable
            onPress={handleGoogle}
            disabled={loading}
            style={({ pressed }) => [
              styles.authBtn,
              styles.googleBtn,
              pressed && { opacity: 0.9 },
            ]}
          >
            <GoogleIcon />
            <Text style={styles.googleBtnText}>Continue with Google</Text>
          </Pressable>

          <Pressable
            onPress={handleApple}
            style={({ pressed }) => [
              styles.authBtn,
              styles.appleWebBtn,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Ionicons name="logo-apple" size={20} color="#fff" />
            <Text style={styles.appleBtnText}>Continue with Apple</Text>
          </Pressable>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <Pressable
            onPress={() => setScreen("email")}
            style={({ pressed }) => [
              styles.authBtn,
              styles.emailBtn,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Ionicons name="mail-outline" size={20} color="#fff" />
            <Text style={styles.emailBtnText}>Continue with Email</Text>
          </Pressable>
        </View>

        <Text style={styles.legal}>
          By continuing you agree to our Terms of Service and Privacy Policy.
        </Text>
      </View>

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      )}
    </View>
  );
}

function GoogleIcon() {
  return (
    <View style={styles.googleIconWrapper}>
      <Text style={styles.googleIconText}>G</Text>
    </View>
  );
}

const NAVY = "#0B1117";
const NAVY_DARK = "#060a0e";

const styles = StyleSheet.create({
  flex: { flex: 1 },
  mainBg: { backgroundColor: NAVY },
  main: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: "space-between",
  },

  logoSection: {
    alignItems: "center",
    gap: 12,
    marginTop: 20,
  },
  logo: {
    width: 260,
    height: 90,
  },
  slogan: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    color: "#ffffff",
    textAlign: "center",
    marginTop: 8,
    lineHeight: 34,
  },
  tagline: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.65)",
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 8,
  },

  buttonsSection: {
    gap: 12,
  },
  authBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    borderRadius: 12,
  },
  googleBtn: {
    backgroundColor: "#ffffff",
  },
  googleBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#1a1a1a",
  },
  googleIconWrapper: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#4285F4",
    alignItems: "center",
    justifyContent: "center",
  },
  googleIconText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  appleBtn: {
    width: "100%",
    height: 54,
    borderRadius: 12,
  },
  appleWebBtn: {
    backgroundColor: "#000000",
  },
  appleBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#ffffff",
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginVertical: 4,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  dividerText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.5)",
  },
  emailBtn: {
    backgroundColor: "#00696b",
  },
  emailBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#ffffff",
  },

  legal: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.35)",
    textAlign: "center",
    lineHeight: 16,
  },

  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },

  emailContainer: {
    flexGrow: 1,
    paddingHorizontal: 24,
    gap: 16,
  },
  backBtn: {
    padding: 4,
    marginBottom: 8,
    alignSelf: "flex-start",
  },
  emailLogo: {
    width: 200,
    height: 68,
    alignSelf: "center",
    marginBottom: 8,
  },
  emailTitle: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  emailSub: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
  inputGroup: {
    borderWidth: 1,
    overflow: "hidden",
    marginTop: 8,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
  },
  continueBtn: {
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  continueBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#ffffff",
  },
});
