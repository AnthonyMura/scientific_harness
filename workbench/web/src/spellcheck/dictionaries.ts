// Spell-check dictionaries (issue 24): the 10 most popular languages, English
// first and Russian second. Each code maps to a wooorm `dictionary-<code>` npm
// package; we fetch its index.aff / index.dic from jsDelivr at runtime. Adding
// a language later is a one-line change here.
export interface DictionaryInfo {
  /** BCP-47-ish code; also the suffix of the dictionary-* npm package. */
  code: string;
  /** Display name shown in the editor settings menu. */
  label: string;
}

export const DICTIONARIES: readonly DictionaryInfo[] = [
  { code: "en", label: "English" },
  { code: "ru", label: "Russian" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "pt", label: "Portuguese" },
  { code: "it", label: "Italian" },
  { code: "tr", label: "Turkish" },
  { code: "pl", label: "Polish" },
  { code: "nl", label: "Dutch" },
];

/** Option values for the Dictionary select (labels, not codes). */
export const DICTIONARY_OPTIONS: readonly string[] = DICTIONARIES.map((d) => d.label);

export const DEFAULT_DICTIONARY_LABEL = "English";

/** Map a stored setting value (a label) back to its code; unknown → English. */
export function dictionaryCodeForLabel(label: string): string {
  const hit = DICTIONARIES.find((d) => d.label === label);
  return hit ? hit.code : "en";
}

/** jsDelivr serves npm tarball files with CORS enabled — fetchable from the page. */
export function dictionaryUrls(code: string): { aff: string; dic: string } {
  return {
    aff: `https://cdn.jsdelivr.net/npm/dictionary-${code}/index.aff`,
    dic: `https://cdn.jsdelivr.net/npm/dictionary-${code}/index.dic`,
  };
}
