import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { useUser, useAuth, useClerk } from "@clerk/react";
import { useSavedListings } from "@/hooks/use-saved-listings";

interface SavedSearch {
  id: number;
  name: string;
  filters: Record<string, unknown>;
  createdAt: string;
}

interface AuthContextType {
  user: {
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    profileImageUrl: string | null;
  } | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: () => void;
  logout: () => void;
  savedIds: Set<number>;
  savedCount: number;
  isSaved: (id: number) => boolean;
  toggleSave: (id: number) => Promise<boolean>;
  messageCount: number;
  savedSearches: SavedSearch[];
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
  const isClerkConfigured =
    typeof clerkPubKey === "string" &&
    /^pk_(test|live)_/.test(clerkPubKey) &&
    !clerkPubKey.includes("placeholder");

  if (!isClerkConfigured) {
    return <LocalAuthProvider>{children}</LocalAuthProvider>;
  }

  return <ClerkAuthProvider>{children}</ClerkAuthProvider>;
}

function LocalAuthProvider({ children }: { children: ReactNode }) {
  const [savedIds] = useState(() => new Set<number>());
  const noopAuth = useCallback(() => {}, []);
  const toggleSave = useCallback(async () => false, []);

  return (
    <AuthContext.Provider
      value={{
        user: null,
        isLoading: false,
        isAuthenticated: false,
        login: noopAuth,
        logout: noopAuth,
        savedIds,
        savedCount: 0,
        isSaved: () => false,
        toggleSave,
        messageCount: 0,
        savedSearches: [],
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

function ClerkAuthProvider({ children }: { children: ReactNode }) {
  const { user: clerkUser, isLoaded } = useUser();
  const { isSignedIn } = useAuth();
  const { openSignIn, signOut } = useClerk();

  const isAuthenticated = !!isSignedIn;
  const saved = useSavedListings(isAuthenticated);
  const [messageCount, setMessageCount] = useState(0);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);

  const mappedUser = clerkUser
    ? {
        id: clerkUser.id,
        email: clerkUser.primaryEmailAddress?.emailAddress ?? null,
        firstName: clerkUser.firstName ?? null,
        lastName: clerkUser.lastName ?? null,
        profileImageUrl: clerkUser.imageUrl ?? null,
      }
    : null;

  const login = useCallback(() => {
    openSignIn();
  }, [openSignIn]);

  const logout = useCallback(() => {
    signOut();
  }, [signOut]);

  useEffect(() => {
    if (!isAuthenticated) {
      setMessageCount(0);
      setSavedSearches([]);
      return;
    }
    fetch("/api/user/messages", { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.messages) {
          setMessageCount(data.messages.filter((m: { read: boolean }) => !m.read).length);
        }
      })
      .catch(() => {});
    fetch("/api/user/searches", { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.searches) {
          setSavedSearches(data.searches.slice(0, 5));
        }
      })
      .catch(() => {});
  }, [isAuthenticated]);

  return (
    <AuthContext.Provider
      value={{
        user: mappedUser,
        isLoading: !isLoaded,
        isAuthenticated,
        login,
        logout,
        savedIds: saved.savedIds,
        savedCount: saved.savedIds.size,
        isSaved: saved.isSaved,
        toggleSave: saved.toggleSave,
        messageCount,
        savedSearches,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAppAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAppAuth must be used within AuthProvider");
  return ctx;
}
