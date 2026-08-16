/**
 * MatchRV Scraper - Image Extractor
 *
 * Comprehensive image extraction from every possible source on a detail page.
 * This is critical for MatchRV — buyers need to see every photo of an RV.
 *
 * Extraction sources (in order):
 *   1. Network responses (already captured by network.js)
 *   2. JSON-LD image fields (already captured by structured-data.js)
 *   3. DOM: img[src], img[data-src], img[data-lazy], img[srcset]
 *   4. DOM: background-image CSS properties
 *   5. DOM: carousel/gallery slides (including hidden ones)
 *   6. DOM: thumbnail galleries
 *   7. Interactive: click gallery nav arrows to reveal lazy-loaded slides
 *   8. Interactive: scroll page to trigger lazy loading
 *
 * After collection, images are:
 *   - Resolved to absolute URLs
 *   - Filtered to remove logos, icons, badges, and tracking pixels
 *   - Upgraded to highest resolution variant
 *   - Deduplicated
 */

import { normalizeImageUrl, isLikelyRvImage, deduplicateUrls, log } from '../utils.js';

/**
 * Extract all images from the page DOM (static sources).
 * Call this AFTER the page is fully loaded and scrolled.
 *
 * @param {import('playwright').Page} page
 * @returns {Promise<string[]>} Array of absolute image URLs
 */
export async function extractDomImages(page) {
  const baseUrl = page.url();

  const rawUrls = await page.evaluate(() => {
    const urls = new Set();

    // 1. All <img> elements — src, data-src, data-lazy, data-original, data-hi-res
    const imgs = document.querySelectorAll('img');
    for (const img of imgs) {
      for (const attr of ['src', 'data-src', 'data-lazy', 'data-lazy-src',
                          'data-original', 'data-hi-res', 'data-full-src',
                          'data-zoom-image', 'data-image', 'data-big']) {
        const val = img.getAttribute(attr);
        if (val) urls.add(val);
      }

      // srcset: extract all URLs and pick the largest
      const srcset = img.getAttribute('srcset');
      if (srcset) {
        const entries = srcset.split(',').map(s => s.trim().split(/\s+/));
        // Sort by descriptor (width or density) descending, take the largest
        let best = null;
        let bestSize = 0;
        for (const [url, descriptor] of entries) {
          const size = parseInt(descriptor) || 0;
          if (size > bestSize || !best) {
            best = url;
            bestSize = size;
          }
        }
        if (best) urls.add(best);
        // Also add all srcset URLs in case the "best" logic misses something
        for (const [url] of entries) {
          if (url) urls.add(url);
        }
      }
    }

    // 2. Background images in computed styles (gallery slides, hero images)
    const allElements = document.querySelectorAll('[style*="background"], [data-bg], .slide, .carousel-item, .gallery-item, .swiper-slide');
    for (const el of allElements) {
      const style = window.getComputedStyle(el);
      const bg = style.backgroundImage;
      if (bg && bg !== 'none') {
        const match = bg.match(/url\(["']?([^"')]+)["']?\)/);
        if (match) urls.add(match[1]);
      }
      // data-bg attribute (lazy background images)
      const dataBg = el.getAttribute('data-bg') || el.getAttribute('data-background');
      if (dataBg) urls.add(dataBg);
    }

    // 3. Gallery / carousel containers — look for all images inside them
    const gallerySelectors = [
      '.gallery', '.photo-gallery', '.vehicle-gallery', '.media-gallery',
      '.image-gallery', '.vehicle-photos', '.vehicle-images',
      '.carousel', '.slider', '.slick-slider', '.swiper-container', '.swiper',
      '.fotorama', '.lightgallery', '.magnific-popup',
      '[data-gallery]', '[data-slider]', '[data-carousel]',
      '.vdp-gallery', '.vdp-photos', '.detail-photos', '.listing-photos',
    ];
    for (const sel of gallerySelectors) {
      const containers = document.querySelectorAll(sel);
      for (const container of containers) {
        // Get ALL images in the gallery, including hidden slides
        const galleryImgs = container.querySelectorAll('img, [data-src], [data-lazy]');
        for (const gi of galleryImgs) {
          for (const attr of ['src', 'data-src', 'data-lazy', 'data-original',
                              'data-hi-res', 'data-full-src']) {
            const val = gi.getAttribute(attr);
            if (val) urls.add(val);
          }
        }
        // Also check <a> tags wrapping images (often link to full-res)
        const links = container.querySelectorAll('a[href]');
        for (const a of links) {
          const href = a.getAttribute('href');
          if (href && /\.(jpe?g|png|webp)/i.test(href)) {
            urls.add(href);
          }
        }
      }
    }

    // 4. Thumbnail images (often contain links to full-size versions)
    const thumbSelectors = [
      '.thumbnails img', '.thumb img', '.thumbs img',
      '.gallery-thumbs img', '.carousel-indicators img',
      '.slick-dots img', '.swiper-pagination img',
    ];
    for (const sel of thumbSelectors) {
      const thumbs = document.querySelectorAll(sel);
      for (const t of thumbs) {
        for (const attr of ['src', 'data-src', 'data-lazy', 'data-full',
                            'data-original', 'data-hi-res']) {
          const val = t.getAttribute(attr);
          if (val) urls.add(val);
        }
      }
    }

    // 5. <a> tags with image hrefs (lightbox links, full-size gallery links)
    const imgLinks = document.querySelectorAll('a[href*=".jpg"], a[href*=".jpeg"], a[href*=".png"], a[href*=".webp"]');
    for (const a of imgLinks) {
      urls.add(a.getAttribute('href'));
    }

    // 6. <source> elements inside <picture> tags
    const sources = document.querySelectorAll('picture source[srcset]');
    for (const s of sources) {
      const srcset = s.getAttribute('srcset');
      if (srcset) {
        const parts = srcset.split(',').map(p => p.trim().split(/\s+/)[0]);
        for (const p of parts) if (p) urls.add(p);
      }
    }

    return [...urls];
  });

  // Normalize, filter, and deduplicate
  const normalized = rawUrls
    .map(url => normalizeImageUrl(url, baseUrl))
    .filter(url => url && isLikelyRvImage(url));

  return deduplicateUrls(normalized);
}

/**
 * Scroll the page to trigger lazy-loading of images.
 * Many dealer sites only load gallery images as the user scrolls.
 *
 * @param {import('playwright').Page} page
 */
export async function triggerLazyLoading(page) {
  await page.evaluate(async () => {
    const delay = (ms) => new Promise(r => setTimeout(r, ms));
    const scrollHeight = document.body.scrollHeight;
    const viewportHeight = window.innerHeight;
    const steps = Math.ceil(scrollHeight / viewportHeight);

    for (let i = 0; i <= steps; i++) {
      window.scrollTo(0, i * viewportHeight);
      await delay(300);
    }

    // Scroll back to top
    window.scrollTo(0, 0);
    await delay(500);
  });

  // Wait for any new images triggered by scrolling to load
  await page.waitForTimeout(1000);
}

/**
 * Try to click gallery navigation to reveal more images.
 * Handles: next arrows, "show all photos" buttons, gallery expand buttons.
 *
 * @param {import('playwright').Page} page
 * @returns {Promise<number>} Number of navigation clicks performed
 */
export async function navigateGallery(page) {
  let clicks = 0;
  const maxClicks = 50; // Safety limit to prevent infinite loops

  // First, try "show all" or "view all photos" buttons
  const showAllSelectors = [
    'button:has-text("all photo")', 'a:has-text("all photo")',
    'button:has-text("view all")', 'a:has-text("view all")',
    'button:has-text("show all")', 'a:has-text("show all")',
    'button:has-text("see all")', 'a:has-text("see all")',
    '[class*="show-all"]', '[class*="view-all"]', '[class*="see-all"]',
    '[data-action="show-all"]',
  ];

  for (const sel of showAllSelectors) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 500 })) {
        await btn.click();
        await page.waitForTimeout(1500);
        clicks++;
        log.debug(`Clicked "show all" button: ${sel}`);
        return clicks; // If we expanded all, no need to click arrows
      }
    } catch { /* selector not found — continue */ }
  }

  // Click next arrows to cycle through gallery slides
  const nextSelectors = [
    '.slick-next', '.swiper-button-next', '.carousel-next',
    '[class*="next"]', '[class*="arrow-right"]', '[class*="nav-next"]',
    'button[aria-label="Next"]', 'button[aria-label="next"]',
    '.fotorama__arr--next',
    '[data-direction="next"]', '[data-action="next"]',
  ];

  for (const sel of nextSelectors) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 500 })) {
        // Click next until we loop back or hit the limit
        const initialImages = await countImages(page);
        while (clicks < maxClicks) {
          try {
            await btn.click();
            await page.waitForTimeout(400);
            clicks++;
          } catch { break; }

          // Check if we've stopped getting new images (probably looped)
          if (clicks % 10 === 0) {
            const currentImages = await countImages(page);
            if (currentImages === initialImages) break;
          }
        }
        log.debug(`Clicked gallery next ${clicks} times using ${sel}`);
        break;
      }
    } catch { /* selector not found — continue */ }
  }

  return clicks;
}

async function countImages(page) {
  return page.evaluate(() => document.querySelectorAll('img[src]').length);
}

/**
 * Master image extraction pipeline.
 * Combines images from all sources, deduplicates, and returns the final list.
 *
 * @param {import('playwright').Page} page
 * @param {string[]} networkImages - Images already found from network responses
 * @param {string[]} jsonLdImages - Images already found from JSON-LD
 * @param {string[]} scriptImages - Images already found from inline scripts
 * @returns {Promise<string[]>}
 */
export async function extractAllImages(page, networkImages = [], jsonLdImages = [], scriptImages = []) {
  const baseUrl = page.url();

  // Step 1: Scroll the page to trigger lazy loading
  log.debug('Triggering lazy loading via scroll...');
  await triggerLazyLoading(page);

  // Step 2: Try to navigate gallery to reveal all slides
  log.debug('Navigating gallery to reveal all images...');
  const galleryClicks = await navigateGallery(page);
  if (galleryClicks > 0) {
    log.debug(`Gallery navigation: ${galleryClicks} clicks`);
  }

  // Step 3: Extract all DOM images (after lazy loading and gallery navigation)
  log.debug('Extracting DOM images...');
  const domImages = await extractDomImages(page);

  // Step 4: Combine all sources
  const allImages = [
    ...networkImages,   // Highest confidence — from actual API responses
    ...jsonLdImages,    // High confidence — structured data
    ...scriptImages,    // Medium confidence — inline data
    ...domImages,       // Lowest confidence but most comprehensive
  ].map(url => normalizeImageUrl(url, baseUrl))
   .filter(url => url && isLikelyRvImage(url));

  // Step 5: Deduplicate
  const unique = deduplicateUrls(allImages);

  log.debug(`Image extraction complete: ${unique.length} unique images (network: ${networkImages.length}, jsonld: ${jsonLdImages.length}, script: ${scriptImages.length}, dom: ${domImages.length})`);

  return unique;
}
