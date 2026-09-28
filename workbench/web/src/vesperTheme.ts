import { HighlightStyle } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

/**
 * Vesper editor palette (app_theme.md, Editor section):
 * commands sand, structural commands gold-bright semibold, citation
 * keys gold-bright, comments brown italic, delimiters taupe.
 */
export const vesperHighlight = HighlightStyle.define([
  { tag: t.special(t.keyword), color: "#C3A893", fontWeight: "600" },
  { tag: t.keyword, color: "#B38F6F" },
  // Citation keys — author names in \citep{…} & kin (latexMode's custom
  // "citation" token): gold-bright, the theme's warm bone — reference data
  // that stands out of prose without shouting.
  { tag: t.special(t.atom), color: "var(--gold-bright)" },
  { tag: t.comment, color: "#8D7564", fontStyle: "italic" },
  { tag: [t.bracket, t.punctuation], color: "#BCB1A0" },
  // Markdown (issue 21): lezer-markdown emits its own tags (heading, strong,
  // emphasis, monospace, link, quote) that the five entries above never see,
  // so a .md file would render as plain prose without these. Reuses the
  // existing palette only — no new hues.
  { tag: t.heading, color: "var(--gold-bright)", fontWeight: "600" },
  { tag: t.strong, fontWeight: "600" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.monospace, color: "var(--taupe)" },
  { tag: t.link, color: "var(--sand)", textDecoration: "underline" },
  { tag: t.quote, color: "var(--taupe)", fontStyle: "italic" },
]);
