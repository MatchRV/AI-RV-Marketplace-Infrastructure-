/**
 * Swipe header wordmark.
 *
 * matchrv-logo-light.png is a 1536×1024 canvas. The artwork is a small
 * region in the middle, so the header used to reveal it by shifting the
 * file inside an overflow:hidden window. That window sat on the swoosh
 * stroke. After the file is scaled down, the outline is a fraction of a
 * pixel, so the clip reads as a cut-off, squashed mark.
 *
 * matchrv-logo-wordmark.png is the same artwork with only a few pixels of
 * transparent padding. The header shows that file with object-fit: contain
 * and does not crop it.
 */
export const SWIPE_WORDMARK = {
  src: "/matchrv-logo-wordmark.png",
  /** Intrinsic pixels of the trimmed file, padding included. */
  width: 931,
  height: 284,
  /** CSS pixels. Width follows the file's aspect ratio. */
  displayHeight: 48,
} as const;

export interface WordmarkBox {
  width: number;
  height: number;
}

/** Display box that preserves the trimmed file's aspect ratio. */
export function swipeWordmarkBox(displayHeight = SWIPE_WORDMARK.displayHeight): WordmarkBox {
  return {
    width: Math.round(displayHeight * SWIPE_WORDMARK.width / SWIPE_WORDMARK.height),
    height: displayHeight,
  };
}
