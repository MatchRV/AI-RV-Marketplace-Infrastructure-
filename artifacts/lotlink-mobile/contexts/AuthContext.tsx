import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

const USER_KEY = "matchrv_user";

export interface MRVUser {
  id: string;
  name: string;
  email: string;
  provider: "google" | "apple" | "email";
  avatar?: string;
}

interface AuthContextValue {
  user: MRVUser | null;
  isLoading: boolean;
  signIn: (user: MRVUser) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  signIn: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<MRVUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(USER_KEY)
      .then((raw) => {
        if (raw) {
          try {
            setUser(JSON.parse(raw));
          } catch {}
        }
      })
      .finally(() => setIsLoading(false));
  }, []);

  const signIn = useCallback(async (u: MRVUser) => {
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(u));
    setUser(u);
  }, []);

  const signOut = useCallback(async () => {
    await AsyncStorage.removeItem(USER_KEY);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
