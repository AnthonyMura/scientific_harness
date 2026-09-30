// Client-side TIFF decoding for the Image Preview pane (issue 55). Browsers
// render PNG/JPEG natively in <img> but not TIFF, so TIFF bytes are decoded
// here with utif2 (pure JS, no native deps — node-testable, and it keeps the
// sidecar free of image libraries per ticket 10's accepted limitation).
//
// utif2 is a CJS module whose exports are assigned dynamically inside an IIFE,
// so only the default import is reliable across Vite (browser build) and
// vitest (node SSR interop); named imports resolve to undefined under Node.
import UTIF from "utif2";

/** Decoded RGBA pixels of one TIFF page. */
export interface TiffPagePixels {
  width: number;
  height: number;
  /** Row-major RGBA, length = width * height * 4. */
  rgba: Uint8ClampedArray;
}

/** Lazy handle over a decoded TIFF buffer: IFDs are parsed up front, pages decode on demand. */
export interface TiffImage {
  /** Number of readable pages (IFDs). */
  count: number;
  /** Width/height of the nth page without decoding pixels, or null for a bad index. */
  pageSize(n: number): { width: number; height: number } | null;
  /** Decode the nth page (0-based) to RGBA. Throws when the page is missing or its compression is unsupported. */
  decodePage(n: number): TiffPagePixels;
}

/** utif2 stores tag values as arrays ([4] for a single LONG, [8,8,8] for BitsPerSample). */
function tagFirst(v: unknown, fallback = 0): number {
  if (Array.isArray(v)) return typeof v[0] === "number" ? v[0] : fallback;
  return typeof v === "number" ? v : fallback;
}

/**
 * Parse a TIFF buffer into a lazy handle, or null when the bytes are not a
 * readable little/big-endian TIFF (bad header, no IFDs, missing width/height).
 * The input is copied: the returned handle keeps its own reference to the
 * pixel data for on-demand page decoding.
 */
export function openTiff(bytes: Uint8Array): TiffImage | null {
  const buf = bytes.slice().buffer as ArrayBuffer; // private copy — IFD views point into it
  let ifds: { t256?: unknown; t257?: unknown }[];
  try {
    ifds = UTIF.decode(buf) as typeof ifds;
  } catch {
    return null;
  }
  if (!ifds || ifds.length === 0) return null;
  const pages = ifds.filter((ifd) => tagFirst(ifd.t256) > 0 && tagFirst(ifd.t257) > 0);
  if (pages.length === 0) return null;
  return {
    count: pages.length,
    pageSize(n) {
      const ifd = pages[n];
      if (!ifd) return null;
      return { width: tagFirst(ifd.t256), height: tagFirst(ifd.t257) };
    },
    decodePage(n) {
      const ifd = pages[n];
      if (!ifd) throw new Error(`no TIFF page ${n}`);
      UTIF.decodeImage(buf, ifd as never);
      const rgba = UTIF.toRGBA8(ifd as never);
      return { width: tagFirst(ifd.t256), height: tagFirst(ifd.t257), rgba: new Uint8ClampedArray(rgba) };
    },
  };
}
