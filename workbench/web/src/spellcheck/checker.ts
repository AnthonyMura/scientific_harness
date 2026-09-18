// Spell-check service (issue 24): one Hunspell instance per language, created
// from the aff/dic pair fetched (and cached) for it. The WASM module itself is
// loaded once on first use.
import { Hunspell } from "hunspell-wasm";
import initHunspellWasm from "hunspell-wasm/wasm/hunspell.js";
import { dictionaryUrls } from "./dictionaries";
import { cacheGet, cacheSet } from "./cache";

const instances = new Map<string, Promise<Hunspell>>();

// The package's getWasmModule() resolves the .wasm relative to its own module URL
// (new URL("hunspell.wasm", import.meta.url)), which lands inside Vite's deps
// directory in dev mode and 404s. Pin it to /hunspell.wasm instead — served from
// web/public in both dev and build.
let wasmPromise: Promise<unknown> | null = null;
function getWasmModule(): Promise<unknown> {
  if (!wasmPromise) {
    wasmPromise = initHunspellWasm({ locateFile: () => "/hunspell.wasm" }).catch((e) => {
      wasmPromise = null; // transient failure — allow a retry
      throw e;
    });
  }
  return wasmPromise;
}

/** Resolve (and memoize) the Hunspell instance for a dictionary code. */
export async function getChecker(code: string): Promise<Hunspell> {
  let pending = instances.get(code);
  if (!pending) {
    pending = (async () => {
      const urls = dictionaryUrls(code);
      const [wasm, aff, dic] = await Promise.all([
        getWasmModule(),
        loadFile(urls.aff, `${code}.aff`),
        loadFile(urls.dic, `${code}.dic`),
      ]);
      return new Hunspell(wasm, aff, dic);
    })();
    instances.set(code, pending);
    // A failed load (offline, CDN down) must not poison the registry — evict
    // it so the next attempt retries from scratch.
    void pending.catch(() => {
      if (instances.get(code) === pending) instances.delete(code);
    });
  }
  return pending;
}

async function loadFile(url: string, key: string): Promise<string> {
  const cached = await cacheGet(key);
  if (cached != null) return cached;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`dictionary download failed (HTTP ${res.status})`);
  const text = await res.text();
  await cacheSet(key, text);
  return text;
}

/** A word: a run of letters/digits/apostrophes (Unicode). */
const WORD_RE = /\p{L}[\p{L}\p{N}'\u2019]*/gu;

export interface MisspelledRange {
  from: number;
  to: number;
  word: string;
}

/**
 * All misspelled word ranges in `text` per `checker`. Words right after a
 * backslash are skipped (LaTeX commands are not dictionary words), and a word
 * passes if Hunspell accepts it as-is or lowercased (capitalized starts).
 */
export function findMisspelled(text: string, checker: Hunspell): MisspelledRange[] {
  const out: MisspelledRange[] = [];
  WORD_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = WORD_RE.exec(text)) !== null) {
    if (m.index > 0 && text[m.index - 1] === "\\") continue; // \command
    const word = m[0];
    if (word.length < 2) continue; // single letters: noise, not typos worth flagging
    if (checker.testSpelling(word) || checker.testSpelling(word.toLowerCase())) continue;
    out.push({ from: m.index, to: m.index + word.length, word });
  }
  return out;
}
