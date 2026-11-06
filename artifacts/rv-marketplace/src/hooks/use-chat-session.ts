import { useState, useCallback, useRef, useEffect } from "react";
import { useOutfitterChat } from "@workspace/api-client-react";
import type {
  ChatMessage,
  BuyerProfile,
  Listing,
  NoMatchFilters,
  ExpansionSuggestion,
} from "@workspace/api-client-react";
import { recordBuyerIntent } from "@/lib/buyer-intent";

export type { NoMatchFilters, ExpansionSuggestion };

/**
 * Expand shorthand number notation before sending to the AI.
 * "30k" → "$30,000", "1.5m" → "$1,500,000", "50K budget" → "$50,000 budget"
 */
function expandShorthands(text: string): string {
  let result = text.replace(/\b(\d+(?:\.\d+)?)\s*[kK]\b/g, (_m, n) => {
    const val = Math.round(parseFloat(n) * 1_000);
    return `$${val.toLocaleString("en-US")}`;
  });
  result = result.replace(/\b(\d+(?:\.\d+)?)\s*[mM]\b/g, (_m, n) => {
    const val = Math.round(parseFloat(n) * 1_000_000);
    return `$${val.toLocaleString("en-US")}`;
  });
  return result;
}

export function useChatSession() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "Hey there! I'm your RV Outfitter.\n\nTwo ways to start, including if you're back or want to start over:\n1) Swipe existing inventory at https://matchrv.com/swipe. That page already exists. I won't build a deck here, and it won't apply a type, diesel, budget, or city for you.\n2) Chat with me and I'll ask a few questions.\n\nWhich do you want — swipe or chat?"
    }
  ]);
  const [sessionId, setSessionId] = useState<string>(`session_${Math.random().toString(36).substr(2, 9)}`);
  const [profile, setProfile] = useState<BuyerProfile>({});
  const [recommendations, setRecommendations] = useState<Listing[]>([]);
  const [stage, setStage] = useState<string>("greeting");
  const [noMatch, setNoMatch] = useState(false);
  const [noMatchFilters, setNoMatchFilters] = useState<NoMatchFilters>({});
  const [expansionSuggestions, setExpansionSuggestions] = useState<ExpansionSuggestion[]>([]);
  
  const chatMutation = useOutfitterChat();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const trackedStage = useRef<string | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, chatMutation.isPending]);

  const sendMessage = useCallback(async (rawContent: string) => {
    if (!rawContent.trim() || chatMutation.isPending) return;

    const content = expandShorthands(rawContent);
    // Reset noMatch state when user sends a new message
    setNoMatch(false);
    setExpansionSuggestions([]);
    const userMsg: ChatMessage = { role: "user", content };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);

    const attemptRequest = async (attemptsLeft: number): Promise<void> => {
      try {
        const response = await chatMutation.mutateAsync({
          data: {
            messages: newMessages,
            sessionId,
            buyerProfile: profile,
          }
        });

        setMessages(prev => [...prev, { role: "assistant", content: response.message }]);
        
        if (response.sessionId) setSessionId(response.sessionId);
        if (response.updatedProfile) {
          setProfile(response.updatedProfile);
          try {
            localStorage.setItem("rv_outfitter_session", JSON.stringify({
              sessionId: response.sessionId ?? sessionId,
              profile: response.updatedProfile,
              messages: [...newMessages, { role: "assistant", content: response.message }],
              updatedAt: new Date().toISOString(),
            }));
          } catch { /* ignore */ }
        }
        if (response.recommendations) setRecommendations(response.recommendations);
        if (response.noMatch !== undefined) setNoMatch(Boolean(response.noMatch));
        if (response.noMatchFilters) setNoMatchFilters(response.noMatchFilters);
        if (response.expansionSuggestions) setExpansionSuggestions(response.expansionSuggestions);
        if (response.stage) {
          setStage(response.stage);

          // Track stage transitions for analytics
          const shouldTrack = (response.stage === "matching" || response.stage === "complete")
            && trackedStage.current !== response.stage;
          if (shouldTrack) {
            trackedStage.current = response.stage;
            const p = response.updatedProfile ?? profile;
            const deepDiveDone = Boolean(
              p.experience ||
              p.campingStyle ||
              (Array.isArray(p.mustHaves) && p.mustHaves.length > 0)
            );
            const outfitterEvent = deepDiveDone
              ? "outfitter_full_complete"
              : "outfitter_half_complete";
            recordBuyerIntent(outfitterEvent, {
              metadata: {
                rvType: p.rvType,
                useCase: p.useCase,
                maxBudget: p.maxBudget,
                travelers: p.travelers,
                towVehicle: p.towVehicle,
                experience: p.experience,
                campingStyle: p.campingStyle,
                mustHaves: p.mustHaves,
                stage: response.stage,
              },
            });
          }

          // Track knowledge mode engagement
          if (String(response.stage) === "knowledge" && trackedStage.current !== "knowledge") {
            trackedStage.current = "knowledge";
            recordBuyerIntent("outfitter_knowledge_mode", {
              metadata: { sessionId },
            });
          }
        }
      } catch (error) {
        // Only retry transient network blips — never retry server/HTTP errors
        // (e.g. an AI-timeout 500). Retrying a 15-30s request 3x compounds into a
        // multi-minute hang, which is what made the AI feel "broken."
        const isServerError = (error as { name?: string } | null)?.name === "ApiError";
        if (!isServerError && attemptsLeft > 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          return attemptRequest(attemptsLeft - 1);
        }
        console.error("Failed to send message:", error);
        setMessages(prev => [...prev, { 
          role: "assistant", 
          content: "Sorry — that took longer than expected on my end. Mind sending that again?" 
        }]);
      }
    };

    await attemptRequest(2);
  }, [messages, sessionId, profile, chatMutation]);

  return {
    messages,
    sendMessage,
    isTyping: chatMutation.isPending,
    profile,
    recommendations,
    stage,
    noMatch,
    noMatchFilters,
    expansionSuggestions,
    messagesEndRef
  };
}
