import { Layout } from "@/components/layout";
import { SEO } from "@/components/seo";
import { useAppAuth } from "@/contexts/auth-context";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui-elements";
import { useState, useEffect } from "react";
import { Link } from "wouter";

interface Message {
  id: number;
  dealerId: number;
  dealerName?: string;
  listingId: number;
  listingTitle?: string;
  body: string;
  read: boolean;
  createdAt: string;
}

export function Messages() {
  const { isAuthenticated, login } = useAppAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) {
      setIsLoading(false);
      return;
    }
    fetch("/api/user/messages", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setMessages(data.messages || []))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <Layout>
        <div className="flex-1 flex flex-col items-center justify-center py-20 text-center">
          <MessageSquare className="w-16 h-16 text-muted-foreground/30 mb-4" />
          <h2 className="text-2xl font-display font-bold mb-2">Sign in to view messages</h2>
          <p className="text-muted-foreground mb-6">Contact dealers and track your conversations.</p>
          <Button onClick={login}>Sign In</Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <SEO title="Messages" noIndex />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-display font-bold mb-6">Messages</h1>
        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-20">
            <MessageSquare className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground">No messages yet. Contact a dealer from any listing page.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((m) => (
              <div
                key={m.id}
                className="bg-card border border-border rounded-xl p-4"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      To: {m.dealerName || `Dealer #${m.dealerId}`}
                    </p>
                    <Link href={`/listing/${m.listingId}`}>
                      <p className="text-xs text-primary hover:underline cursor-pointer">
                        {m.listingTitle || `Listing #${m.listingId}`}
                      </p>
                    </Link>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(m.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{m.body}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
