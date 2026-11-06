import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { TEAL } from "./tokens";

const KEY = "matchrv_swipe_hint_seen";

/** Skippable cue on the real deck. Not a video. Honors reduced motion. */
function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
}

export function OnboardingHint({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [reduce, setReduce] = useState(prefersReducedMotion);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const onChange = () => setReduce(mq.matches);
    setReduce(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  if (!open) return null;
  const motion = reduce ? "" : "animate-bounce";
  return (
    <div role="dialog" aria-labelledby="swipe-hint-title" className="absolute inset-0 z-30 flex flex-col justify-between rounded-3xl p-4" style={{ background: "rgba(11,31,58,.9)" }}>
      <p id="swipe-hint-title" className="text-white font-extrabold text-lg">How swiping works</p>
      <div className="flex items-center justify-between">
        <span className="flex flex-col items-center text-white font-bold text-center">
          <ArrowLeft size={40} className={motion} color="#fff" />Swipe left<br />to pass
        </span>
        <span className="flex flex-col items-center font-bold text-center" style={{ color: TEAL }}>
          <ArrowRight size={40} className={motion} color={TEAL} /><span className="text-white">Swipe right<br />to like</span>
        </span>
      </div>
      <p className="text-white text-sm">Compare your likes and Change filters stay at the top. Your likes stay when the filters change.</p>
      <button type="button" onClick={onClose} className="rounded-full py-3 font-extrabold" style={{ background: TEAL, color: "#0B1F3A" }}>Skip</button>
    </div>
  );
}

export function hintAlreadySeen(): boolean {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
}
export function markHintSeen(): void {
  try { localStorage.setItem(KEY, "1"); } catch { /* ignore */ }
}
