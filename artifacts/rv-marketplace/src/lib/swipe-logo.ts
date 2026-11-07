/** Light wordmark file. Opaque art sits in a wide transparent margin. */
export const LIGHT_LOGO = { width: 1536, height: 1024 };
/** Opaque pixels of matchrv-logo-light.png (stroke included). */
export const LIGHT_LOGO_ART = { x: 337, y: 351, right: 1250, bottom: 618 };

export interface SwipeLogoFrame {
  frame: { width: number; height: number };
  img: { width: number; height: number; left: number; top: number };
}

/**
 * Header crop of the light wordmark. Padding stays outside the stroke so the
 * swoosh is not sliced by overflow:hidden.
 */
export function swipeLogoFrame(displayHeight = 40, pad = 24): SwipeLogoFrame {
  const x = LIGHT_LOGO_ART.x - pad;
  const y = LIGHT_LOGO_ART.y - pad;
  const w = LIGHT_LOGO_ART.right - LIGHT_LOGO_ART.x + pad * 2;
  const h = LIGHT_LOGO_ART.bottom - LIGHT_LOGO_ART.y + pad * 2;
  const imgW = Math.round(LIGHT_LOGO.width * (displayHeight / h));
  const scale = imgW / LIGHT_LOGO.width;
  return {
    frame: { width: Math.round(w * scale), height: Math.round(h * scale) },
    img: { width: imgW, height: Math.round(LIGHT_LOGO.height * scale), left: Math.round(-x * scale), top: Math.round(-y * scale) },
  };
}

/** Source rectangle shown inside the header window. */
export function visibleLogoSource(frame: SwipeLogoFrame = swipeLogoFrame()) {
  const scale = frame.img.width / LIGHT_LOGO.width;
  return {
    x: -frame.img.left / scale,
    y: -frame.img.top / scale,
    right: (-frame.img.left + frame.frame.width) / scale,
    bottom: (-frame.img.top + frame.frame.height) / scale,
  };
}
