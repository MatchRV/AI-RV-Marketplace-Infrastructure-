import { useState, useEffect, useCallback } from "react";

export function useSavedListings(isAuthenticated: boolean) {
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      setSavedIds(new Set());
      return;
    }
    setIsLoading(true);
    fetch("/api/user/saved-ids", { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load");
        return r.json();
      })
      .then((data: { ids: number[] }) => setSavedIds(new Set(data.ids)))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [isAuthenticated]);

  const toggleSave = useCallback(
    async (listingId: number) => {
      if (!isAuthenticated) return false;
      const isSaved = savedIds.has(listingId);
      const method = isSaved ? "DELETE" : "POST";
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (isSaved) next.delete(listingId);
        else next.add(listingId);
        return next;
      });
      try {
        const res = await fetch(`/api/listings/${listingId}/save`, {
          method,
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed");
        return true;
      } catch {
        setSavedIds((prev) => {
          const next = new Set(prev);
          if (isSaved) next.add(listingId);
          else next.delete(listingId);
          return next;
        });
        return false;
      }
    },
    [isAuthenticated, savedIds],
  );

  const isSaved = useCallback(
    (listingId: number) => savedIds.has(listingId),
    [savedIds],
  );

  return { savedIds, isSaved, toggleSave, isLoading };
}
