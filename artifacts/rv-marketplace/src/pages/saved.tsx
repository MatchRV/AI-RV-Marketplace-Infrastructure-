import { Layout } from "@/components/layout";
import { SEO } from "@/components/seo";
import { ListingCard } from "@/components/listing-card";
import { useAppAuth } from "@/contexts/auth-context";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui-elements";
import { useState, useEffect } from "react";
import type { Listing } from "@workspace/api-client-react";

export function Saved() {
  const { isAuthenticated, login } = useAppAuth();
  const [listings, setListings] = useState<Listing[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) {
      setIsLoading(false);
      return;
    }
    fetch("/api/user/saved", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setListings(data.listings || []))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <Layout>
        <div className="flex-1 flex flex-col items-center justify-center py-20 text-center">
          <Heart className="w-16 h-16 text-muted-foreground/30 mb-4" />
          <h2 className="text-2xl font-display font-bold mb-2">Sign in to save listings</h2>
          <p className="text-muted-foreground mb-6 max-w-md">
            Create an account to save your favorite RVs and get notified about price drops.
          </p>
          <Button onClick={login}>Sign In</Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <SEO title="Saved Listings" noIndex />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-display font-bold mb-6">Saved Listings</h1>
        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : listings.length === 0 ? (
          <div className="text-center py-20">
            <Heart className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground">No saved listings yet. Browse RVs and tap the heart icon to save your favorites.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {listings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
