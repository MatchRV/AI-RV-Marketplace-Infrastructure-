import { Layout } from "@/components/layout";
import { SEO } from "@/components/seo";
import { useAppAuth } from "@/contexts/auth-context";
import { Bookmark, Trash2, Search } from "lucide-react";
import { Button } from "@/components/ui-elements";
import { useState, useEffect } from "react";
import { Link } from "wouter";

interface SavedSearch {
  id: number;
  name: string;
  filters: Record<string, unknown>;
  createdAt: string;
}

export function Searches() {
  const { isAuthenticated, login } = useAppAuth();
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadSearches = () => {
    fetch("/api/user/searches", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setSearches(data.searches || []))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    if (!isAuthenticated) {
      setIsLoading(false);
      return;
    }
    loadSearches();
  }, [isAuthenticated]);

  const handleDelete = async (id: number) => {
    await fetch(`/api/user/searches/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    setSearches((prev) => prev.filter((s) => s.id !== id));
  };

  if (!isAuthenticated) {
    return (
      <Layout>
        <div className="flex-1 flex flex-col items-center justify-center py-20 text-center">
          <Bookmark className="w-16 h-16 text-muted-foreground/30 mb-4" />
          <h2 className="text-2xl font-display font-bold mb-2">Sign in to save searches</h2>
          <p className="text-muted-foreground mb-6">Save your search filters and quickly find matching RVs later.</p>
          <Button onClick={login}>Sign In</Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <SEO title="Saved Searches" noIndex />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-display font-bold mb-6">Saved Searches</h1>
        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : searches.length === 0 ? (
          <div className="text-center py-20">
            <Bookmark className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground">No saved searches yet. Use the "Save Search" button on the browse page.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {searches.map((s) => {
              const filterParams = new URLSearchParams();
              Object.entries(s.filters).forEach(([k, v]) => {
                if (v != null) filterParams.set(k, String(v));
              });
              return (
                <div
                  key={s.id}
                  className="bg-card border border-border rounded-xl p-4 flex items-center justify-between"
                >
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-foreground">{s.name}</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Saved {new Date(s.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <Link href={`/browse?${filterParams.toString()}`}>
                      <Button variant="outline" size="sm" className="gap-1.5">
                        <Search className="w-3.5 h-3.5" />
                        Run
                      </Button>
                    </Link>
                    <button
                      onClick={() => handleDelete(s.id)}
                      className="p-2 text-muted-foreground hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
