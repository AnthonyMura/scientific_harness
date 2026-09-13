import { HighlightStyle } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

/**
 * Vesper editor palette (app_theme.md, Editor section):
 * commands sand, structural commands gold-bright semibold,
 * comments brown italic, delimiters taupe.
 */
export const vesperHighlight = HighlightStyle.define([
  { tag: t.special(t.keyword), color: "#C3A893", fontWeight: "600" },
  { tag: t.keyword, color: "#B38F6F" },
  { tag: t.comment, color: "#8D7564", fontStyle: "italic" },
  { tag: [t.bracket, t.punctuation], color: "#BCB1A0" },
]);
