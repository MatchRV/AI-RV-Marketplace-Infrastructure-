import { SWIPE_WORDMARK, swipeWordmarkBox } from "@/lib/swipe-logo";

/** Full MatchRV wordmark. No overflow crop; the box matches the file's aspect ratio. */
export function SwipeWordmark() {
  const box = swipeWordmarkBox();
  return (
    <img
      src={SWIPE_WORDMARK.src}
      alt="MatchRV"
      width={SWIPE_WORDMARK.width}
      height={SWIPE_WORDMARK.height}
      draggable={false}
      className="block max-w-none object-contain"
      style={{ width: box.width, height: box.height }}
    />
  );
}
