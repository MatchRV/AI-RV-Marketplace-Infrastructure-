import { Layout } from "@/components/layout";
import { SEO } from "@/components/seo";
import { useAppAuth } from "@/contexts/auth-context";
import { Bell, Trash2 } from "lucide-react";
import { Button } from "@/components/ui-elements";
import { useState, useEffect } from "react";
import { Link } from "wouter";
import { formatCurrency } from "@/lib/utils";

interface PriceAlert {
  id: number;
  listingId: number | null;
  rvType: string | null;
  targetPrice: number;
  triggered: boolean;
  createdAt: string;
  listingTitle: string | null;
  currentPrice: number | null;
}

export function Alerts() {
  const { isAuthenticated, login } = useAppAuth();
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) {
      setIsLoading(false);
      return;
    }
    fetch("/api/user/alerts", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setAlerts(data.alerts || []))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [isAuthenticated]);

  const handleDelete = async (id: number) => {
    await fetch(`/api/user/alerts/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  if (!isAuthenticated) {
    return (
      <Layout>
        <div className="flex-1 flex flex-col items-center justify-center py-20 text-center">
          <Bell className="w-16 h-16 text-muted-foreground/30 mb-4" />
          <h2 className="text-2xl font-display font-bold mb-2">Sign in to set price alerts</h2>
          <p className="text-muted-foreground mb-6">Get notified when an RV drops to your target price.</p>
          <Button onClick={login}>Sign In</Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <SEO title="Price Alerts" noIndex />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-display font-bold mb-6">Price Alerts</h1>
        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : alerts.length === 0 ? (
          <div className="text-center py-20">
            <Bell className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground">No price alerts yet. Set target prices on listing pages.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {alerts.map((a) => {
              const hit = a.currentPrice != null && a.currentPrice <= a.targetPrice;
              return (
                <div
                  key={a.id}
                  className={`bg-card border rounded-xl p-4 flex items-center justify-between ${
                    hit ? "border-green-500/50 bg-green-50/30" : "border-border"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    {a.listingId ? (
                      <Link href={`/listing/${a.listingId}`}>
                        <h3 className="font-medium text-foreground hover:text-primary transition-colors cursor-pointer truncate">
                          {a.listingTitle || `Listing #${a.listingId}`}
                        </h3>
                      </Link>
                    ) : (
                      <h3 className="font-medium text-foreground truncate">
                        {a.rvType ? `${a.rvType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())} RVs` : "All RVs"}
                      </h3>
                    )}
                    <div className="flex items-center gap-3 mt-1 text-sm">
                      <span className="text-muted-foreground">
                        Target: {formatCurrency(a.targetPrice)}
                      </span>
                      {a.currentPrice != null && (
                        <span className={hit ? "text-green-600 font-medium" : "text-muted-foreground"}>
                          Current: {formatCurrency(a.currentPrice)}
                        </span>
                      )}
                      {hit && (
                        <span className="text-green-600 text-xs font-bold px-2 py-0.5 bg-green-100 rounded-full">
                          Price met!
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(a.id)}
                    className="p-2 text-muted-foreground hover:text-red-500 transition-colors ml-4"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
