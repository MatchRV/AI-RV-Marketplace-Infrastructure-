import { motion, useMotionValue, useTransform, animate, type PanInfo } from "framer-motion";
import { Heart, Info, MapPin, X } from "lucide-react";
import { cardFacts, cardPlace, cardTitle, formatPrice, SWIPE_THRESHOLD_PX, type SwipeCard } from "@/lib/swipe-deck";
import { NAVY, TEAL, TEAL_DARK, LINE } from "./tokens";

interface Props {
  card: SwipeCard;
  onSwipe: (liked: boolean) => void;
  onDetails: () => void;
  onPhotoError: () => void;
}

/** One RV card. Drag right (or tap the heart) = like, left (or X) = pass; 120px threshold as in the prototype. */
export function SwipeCardView({ card, onSwipe, onDetails, onPhotoError }: Props) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-240, 0, 240], [-12, 0, 12]);
  const likeOpacity = useTransform(x, [20, SWIPE_THRESHOLD_PX], [0, 1]);
  const passOpacity = useTransform(x, [-SWIPE_THRESHOLD_PX, -20], [1, 0]);

  const fling = (liked: boolean) => {
    void animate(x, liked ? 600 : -600, { duration: 0.18 }).then(() => onSwipe(liked));
  };
  const onDragEnd = (_e: unknown, info: PanInfo) => {
    if (info.offset.x > SWIPE_THRESHOLD_PX) fling(true);
    else if (info.offset.x < -SWIPE_THRESHOLD_PX) fling(false);
    else void animate(x, 0, { duration: 0.18 });
  };

  const title = cardTitle(card);
  return (
    <div className="flex flex-col items-center w-full">
      <motion.article
        data-testid="swipe-card"
        className="relative w-full bg-white rounded-3xl overflow-hidden select-none touch-pan-y"
        style={{ x, rotate, border: `3px solid ${TEAL}`, boxShadow: "0 18px 40px rgba(11,31,58,.18)" }}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.9}
        onDragEnd={onDragEnd}
      >
        <div className="relative w-full bg-slate-100" style={{ aspectRatio: "4 / 3" }}>
          <img src={card.photo} alt={title} draggable={false} className="w-full h-full object-cover pointer-events-none" onError={onPhotoError} />
          <motion.span style={{ opacity: likeOpacity, color: TEAL, borderColor: TEAL }} className="absolute top-5 left-5 border-4 rounded-lg px-3 py-1 text-2xl font-black tracking-wider bg-white/80 -rotate-12">LIKE</motion.span>
          <motion.span style={{ opacity: passOpacity }} className="absolute top-5 right-5 border-4 border-rose-600 text-rose-600 rounded-lg px-3 py-1 text-2xl font-black tracking-wider bg-white/80 rotate-12">PASS</motion.span>
        </div>
        <div className="p-5 pb-4">
          <h2 className="text-[1.35rem] leading-tight font-extrabold" style={{ color: NAVY, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{title}</h2>
          <p className="mt-1 text-[1.6rem] font-black" style={{ color: TEAL_DARK }} data-testid="card-price">{formatPrice(card.priceUsd)}</p>
          <ul className="mt-3 flex flex-wrap gap-2" aria-label="Known facts">
            {cardFacts(card).map((f) => (
              <li key={f} className="text-[0.8rem] font-semibold rounded-full px-3 py-1" style={{ background: "#F2F6FA", color: NAVY, border: `1px solid ${LINE}` }}>{f}</li>
            ))}
          </ul>
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="flex items-center gap-1.5 text-sm font-medium text-slate-600" data-testid="card-place"><MapPin size={16} color={TEAL_DARK} /> {cardPlace(card)}</p>
            <button type="button" onClick={onDetails} className="flex items-center gap-1 text-sm font-bold rounded-full px-3 py-1.5" style={{ color: NAVY, border: `1.5px solid ${NAVY}` }}>
              <Info size={15} /> Details
            </button>
          </div>
        </div>
      </motion.article>
      <div className="mt-5 flex items-center justify-center gap-10">
        <button type="button" aria-label="Pass" onClick={() => fling(false)} className="w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-lg" style={{ border: `2px solid ${NAVY}` }}>
          <X size={34} className="text-rose-600" strokeWidth={3} />
        </button>
        <button type="button" aria-label="Like" onClick={() => fling(true)} className="w-16 h-16 rounded-full flex items-center justify-center shadow-lg" style={{ background: TEAL, border: `2px solid ${TEAL}` }}>
          <Heart size={32} color={NAVY} fill={NAVY} />
        </button>
      </div>
    </div>
  );
}
