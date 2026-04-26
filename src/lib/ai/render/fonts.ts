// Bundled font loading for Satori.
//
// Satori requires TTF / OTF font byte arrays at render time. We bundle
// Open Sans (OFL-licensed) under `public/fonts/` so the renderer is
// self-contained — no Google Fonts fetch at runtime, no flaky network
// dependency, no surprise rate limits. Two weights cover the layout
// emphasis levels:
//   - Regular (400): caption, supporting text, subtle elements
//   - Bold    (700): headline, CTA, banner, logo wordmark
//
// Multi-script support (Tagalog, Vietnamese, Japanese, Korean — for
// the OMEGA SEA expansion future) lands when those markets do; the
// `fonts` array structure here makes adding Noto family TTFs trivial.

import { promises as fs } from "node:fs";
import path from "node:path";

export interface SatoriFont {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 700;
  style: "normal";
}

const FONT_DIR = path.resolve(process.cwd(), "public/fonts");

let cache: Promise<SatoriFont[]> | null = null;

/**
 * Returns the bundled Satori font set. Cached at the module level so
 * the disk read happens at most once per process. Throws if the font
 * files are missing — this is a deploy-config error and the caller
 * should classify it as `FONT_LOAD_FAILED`.
 */
export function loadFonts(): Promise<SatoriFont[]> {
  if (cache) return cache;
  cache = Promise.all([
    readTtf("OpenSans-Regular.ttf", 400),
    readTtf("OpenSans-Bold.ttf", 700),
  ]);
  return cache;
}

async function readTtf(filename: string, weight: 400 | 700): Promise<SatoriFont> {
  const fp = path.join(FONT_DIR, filename);
  const buf = await fs.readFile(fp);
  // Satori accepts ArrayBuffer | Uint8Array | Buffer. Cast the Node
  // Buffer view to a real ArrayBuffer slice for portability. Slicing
  // away the inherited offset prevents Satori from reading past the
  // buffer in unusual node deployments.
  const arr = buf.buffer.slice(
    buf.byteOffset,
    buf.byteOffset + buf.byteLength,
  ) as ArrayBuffer;
  return {
    name: "Open Sans",
    data: arr,
    weight,
    style: "normal",
  };
}
