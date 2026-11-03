import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { NAVY, TEAL } from "./tokens";

const KEY = "matchrv_swipe_hint_seen";

/** First-visit cue (ported from the prototype): shows once, then remembers. */
export function OnboardingHint() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    try { if (!localStorage.getItem(KEY)) setVisible(true); } catch { /* storage blocked: skip the hint */ }
  }, []);
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => dismiss(), 3500);
    return () => clearTimeout(t);
  }, [visible]);
  const dismiss = () => {
    setVisible(false);
    try { localStorage.setItem(KEY, "1"); } catch { /* ignore */ }
  };
  if (!visible) return null;
  return (
    <button type="button" onClick={dismiss} aria-label="Dismiss swipe hint" className="absolute inset-0 z-30 flex items-center justify-between px-4 rounded-3xl" style={{ background: "rgba(11,31,58,.82)" }}>
      <span className="flex flex-col items-center text-white font-bold">
        <ArrowLeft size={48} className="animate-bounce" color="#fff" />Swipe left<br />to pass
      </span>
      <span className="flex flex-col items-center font-bold" style={{ color: TEAL }}>
        <ArrowRight size={48} className="animate-bounce" color={TEAL} /><span style={{ color: "#fff" }}>Swipe right<br />to like</span>
      </span>
      <span className="sr-only" style={{ color: NAVY }}>Tap to dismiss</span>
    </button>
  );
}
