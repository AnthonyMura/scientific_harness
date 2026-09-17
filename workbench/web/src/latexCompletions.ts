// LaTeX autocomplete for the editor — an Overleaf-style completion overlay
// built on CodeMirror's autocompletion widget (no new dependencies).
//
// Typing `\be` lists matching commands with a short description; picking one
// applies it: commands with arguments insert a template with the caret in
// the first slot, and picking `\begin`/`\end` re-opens the picker inside the
// braces with environment names. Selecting an environment name completes the
// pair — choosing `align` after `\begin` inserts the full block including
// `\end{align}` (the middle line mirrors the start line's indentation).
//
// Inside `\end{…}`, environments currently open in the document are listed
// first so a mismatched close is easy to avoid.

import { Transaction, type EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  pickedCompletion,
  type Completion,
  type CompletionResult,
  type CompletionSection,
  type CompletionSource,
} from "@codemirror/autocomplete";
import { indentUnit } from "@codemirror/language";

// ---------------------------------------------------------------------------
// Environments (completed inside \begin{…} / \end{…})
// [name, detail, innerContent?] — inner content is seeded on the middle line
// of the inserted block (lists get an \item).
// ---------------------------------------------------------------------------

type EnvSpec = [name: string, detail: string, inner?: string];

const ENVIRONMENTS: EnvSpec[] = [
  // math
  ["equation", "single numbered equation"],
  ["equation*", "single unnumbered equation"],
  ["align", "numbered aligned equations"],
  ["align*", "unnumbered aligned equations"],
  ["aligned", "alignment inside another math environment"],
  ["eqnarray", "legacy alignment (prefer align)"],
  ["gather", "centered multi-line equations"],
  ["gather*", "unnumbered gathered equations"],
  ["multline", "multi-line equation, one number"],
  ["cases", "piecewise system of cases"],
  ["dcases", "display-size cases (mathtools)"],
  ["matrix", "plain matrix (amsmath)"],
  ["pmatrix", "matrix with parentheses"],
  ["bmatrix", "matrix with square brackets"],
  ["Bmatrix", "matrix with braces"],
  ["vmatrix", "matrix with bars (determinant)"],
  ["smallmatrix", "compact matrix in text math"],
  // tables & floats
  ["array", "general column array"],
  ["tabular", "fixed-width table"],
  ["tabularx", "table filling \\linewidth"],
  ["longtable", "table spanning pages"],
  ["table", "float with caption"],
  ["table*", "full-width float (two-column)"],
  ["figure", "float with caption"],
  ["figure*", "full-width figure float"],
  // lists & text blocks
  ["itemize", "bulleted list", "\\item "],
  ["enumerate", "numbered list", "\\item "],
  ["description", "term-description list", "\\item "],
  ["quote", "indented block quote"],
  ["quotation", "indented citation, tighter lines"],
  ["center", "centered text block"],
  ["flushleft", "left-aligned block"],
  ["flushright", "right-aligned block"],
  // document structure
  ["document", "main body (\\begin{document})"],
  ["abstract", "abstract block (article)"],
  ["titlepage", "standalone title page"],
  ["thebibliography", "manual bibliography (use \\bibitem)"],
  // theorems (declare in the preamble, e.g. via amsthm)
  ["theorem", "theorem environment"],
  ["lemma", "lemma environment"],
  ["corollary", "corollary environment"],
  ["definition", "definition environment"],
  ["proof", "proof environment with QED (amsthm)"],
  // misc
  ["verbatim", "literal text, no formatting"],
];

// ---------------------------------------------------------------------------
// Commands — [name, detail, template?, section]
// The template is inserted verbatim with the caret at its $0 marker; a
// missing template inserts the bare command name.
// ---------------------------------------------------------------------------

const secStructure: CompletionSection = { name: "Structure", rank: "dynamic" };
const secFormat: CompletionSection = { name: "Formatting", rank: "dynamic" };
const secMath: CompletionSection = { name: "Math operators", rank: "dynamic" };
const secGreek: CompletionSection = { name: "Greek letters", rank: "dynamic" };
const secRel: CompletionSection = { name: "Relations & symbols", rank: "dynamic" };
const secAccent: CompletionSection = { name: "Accents", rank: "dynamic" };
const secSym: CompletionSection = { name: "Text symbols", rank: "dynamic" };

type CmdSpec = [name: string, detail: string, template?: string, section?: CompletionSection];

const COMMANDS: CmdSpec[] = [
  // --- structure -----------------------------------------------------------
  ["documentclass", "preamble — document class, e.g. article", "\\documentclass{$0}", secStructure],
  ["usepackage", "preamble — load a package", "\\usepackage{$0}", secStructure],
  ["begin", "start an environment — pick its name next", "\\begin{$0}", secStructure],
  ["end", "close an environment — pick its name next", "\\end{$0}", secStructure],
  ["maketitle", "print the title block", undefined, secStructure],
  ["part", "top-level part heading", "\\part{$0}", secStructure],
  ["chapter", "chapter heading (book/report)", "\\chapter{$0}", secStructure],
  ["section", "section heading", "\\section{$0}", secStructure],
  ["subsection", "subsection heading", "\\subsection{$0}", secStructure],
  ["subsubsection", "sub-subsection heading", "\\subsubsection{$0}", secStructure],
  ["paragraph", "paragraph heading", "\\paragraph{$0}", secStructure],
  ["appendix", "start the appendix (relabel chapters)", undefined, secStructure],
  ["title", "preamble — document title", "\\title{$0}", secStructure],
  ["author", "preamble — author name(s)", "\\author{$0}", secStructure],
  ["date", "preamble — date (\\today for current)", "\\date{$0}", secStructure],
  ["tableofcontents", "insert the table of contents", undefined, secStructure],
  ["listoffigures", "list of figures", undefined, secStructure],
  ["listoftables", "list of tables", undefined, secStructure],
  ["label", "name a reference target for \\ref", "\\label{$0}", secStructure],
  ["ref", "cross-reference to a \\label", "\\ref{$0}", secStructure],
  ["pageref", "page number of a \\label", "\\pageref{$0}", secStructure],
  ["cite", "citation by key (BibTeX / Zotero)", "\\cite{$0}", secStructure],
  ["footnote", "footnote text", "\\footnote{$0}", secStructure],
  ["bibitem", "bibliography entry (thebibliography)", "\\bibitem{$0}", secStructure],
  ["include", "input another file, starting a new page", "\\include{$0}", secStructure],
  ["input", "input another file", "\\input{$0}", secStructure],
  ["newcommand", "define a new command", "\\newcommand{\\$0}{}", secStructure],
  ["newpage", "force a page break", undefined, secStructure],
  ["pagebreak", "suggested page break", undefined, secStructure],
  ["clearpage", "page break after pending floats", undefined, secStructure],
  ["linebreak", "suggested line break", undefined, secStructure],
  ["newline", "forced line break (\\)", undefined, secStructure],
  ["noindent", "suppress the paragraph indent", undefined, secStructure],
  ["item", "list entry in itemize / enumerate / description", undefined, secStructure],
  // --- formatting ----------------------------------------------------------
  ["textbf", "bold text", "\\textbf{$0}", secFormat],
  ["textit", "italic text", "\\textit{$0}", secFormat],
  ["emph", "contextual emphasis", "\\emph{$0}", secFormat],
  ["underline", "underlined text", "\\underline{$0}", secFormat],
  ["textrm", "roman font", "\\textrm{$0}", secFormat],
  ["textsf", "sans-serif font", "\\textsf{$0}", secFormat],
  ["texttt", "typewriter font", "\\texttt{$0}", secFormat],
  ["textsc", "small caps", "\\textsc{$0}", secFormat],
  ["textsl", "slanted font", "\\textsl{$0}", secFormat],
  ["textup", "upright font", "\\textup{$0}", secFormat],
  ["textsuperscript", "superscript in text mode", "\\textsuperscript{$0}", secFormat],
  ["textsubscript", "subscript in text mode", "\\textsubscript{$0}", secFormat],
  ["includegraphics", "insert an image (graphicx)", "\\includegraphics{$0}", secFormat],
  ["caption", "caption for a float or table", "\\caption{$0}", secFormat],
  ["centering", "center the current paragraph", undefined, secFormat],
  ["mbox", "unbreakable text box (math mode)", "\\mbox{$0}", secFormat],
  ["hbox", "horizontal box", "\\hbox{$0}", secFormat],
  ["fbox", "framed box around content", "\\fbox{$0}", secFormat],
  ["framebox", "frame with width / position args", "\\framebox{$0}", secFormat],
  ["parbox", "fixed-width paragraph box", "\\parbox{$0}", secFormat],
  ["makebox", "unbreakable box of a given width", "\\makebox{$0}", secFormat],
  ["multicolumn", "span several table columns", "\\multicolumn{$0}{}", secFormat],
  ["hline", "horizontal rule in a tabular", undefined, secFormat],
  ["toprule", "booktabs top rule", undefined, secFormat],
  ["midrule", "booktabs middle rule", undefined, secFormat],
  ["bottomrule", "booktabs bottom rule", undefined, secFormat],
  ["underbrace", "brace under an expression", "\\underbrace{$0}", secFormat],
  ["overbrace", "brace over an expression", "\\overbrace{$0}", secFormat],
  ["underbar", "bar under text (amsmath)", undefined, secFormat],
  ["hspace", "horizontal space, e.g. 1em", "\\hspace{$0}", secFormat],
  ["vspace", "vertical space, e.g. 2pt", "\\vspace{$0}", secFormat],
  ["hfill", "stretchable horizontal space", undefined, secFormat],
  ["vfill", "stretchable vertical space", undefined, secFormat],
  ["bigskip", "large vertical skip", undefined, secFormat],
  ["medskip", "medium vertical skip", undefined, secFormat],
  ["smallskip", "small vertical skip", undefined, secFormat],
  ["today", "current date", undefined, secFormat],
  ["textcolor", "colored text (xcolor)", "\\textcolor{red}{$0}", secFormat],
  ["small", "small font size", undefined, secFormat],
  ["large", "large font size", undefined, secFormat],
  ["Large", "larger font size", undefined, secFormat],
  ["huge", "huge font size", undefined, secFormat],
  // --- math operators --------------------------------------------------------
  ["frac", "fraction numerator / denominator", "\\frac{$0}{}", secMath],
  ["dfrac", "display-size fraction (amsmath)", "\\dfrac{$0}{}", secMath],
  ["tfrac", "text-size fraction (amsmath)", "\\tfrac{$0}{}", secMath],
  ["binom", "binomial coefficient", "\\binom{$0}{}", secMath],
  ["sqrt", "square root", "\\sqrt{$0}", secMath],
  ["text", "upright text inside math", "\\text{$0}", secMath],
  ["mathrm", "roman letters in math", "\\mathrm{$0}", secMath],
  ["mathbf", "bold letters in math", "\\mathbf{$0}", secMath],
  ["mathcal", "calligraphic letters", "\\mathcal{$0}", secMath],
  ["mathbb", "double-struck letters (amssymb)", "\\mathbb{$0}", secMath],
  ["mathtt", "typewriter letters in math", "\\mathtt{$0}", secMath],
  ["left", "size delimiter to content (\\left( … \\right))", undefined, secMath],
  ["right", "close a sized delimiter (… \\right))", undefined, secMath],
  ["sum", "summation ∑", undefined, secMath],
  ["prod", "product ∏", undefined, secMath],
  ["coprod", "coproduct ∐", undefined, secMath],
  ["int", "integral ∫", undefined, secMath],
  ["oint", "contour integral", undefined, secMath],
  ["bigcup", "large union ⋃", undefined, secMath],
  ["bigcap", "large intersection ⋂", undefined, secMath],
  ["lim", "limit", undefined, secMath],
  ["limsup", "limit superior", undefined, secMath],
  ["liminf", "limit inferior", undefined, secMath],
  ["max", "maximum (upright)", undefined, secMath],
  ["min", "minimum (upright)", undefined, secMath],
  ["sup", "supremum (upright)", undefined, secMath],
  ["inf", "infimum (upright)", undefined, secMath],
  ["log", "logarithm (upright)", undefined, secMath],
  ["ln", "natural log (upright)", undefined, secMath],
  ["lg", "log base 10 (upright)", undefined, secMath],
  ["exp", "exponential (upright)", undefined, secMath],
  ["det", "determinant (upright)", undefined, secMath],
  ["gcd", "greatest common divisor", undefined, secMath],
  ["dim", "dimension (upright)", undefined, secMath],
  ["ker", "kernel (upright)", undefined, secMath],
  ["hom", "homomorphism (upright)", undefined, secMath],
  ["arg", "argument (upright)", undefined, secMath],
  ["Re", "real part (upright)", undefined, secMath],
  ["Im", "imaginary part (upright)", undefined, secMath],
  ["sin", "sine (upright)", undefined, secMath],
  ["cos", "cosine (upright)", undefined, secMath],
  ["tan", "tangent (upright)", undefined, secMath],
  ["cot", "cotangent (upright)", undefined, secMath],
  ["sec", "secant (upright)", undefined, secMath],
  ["csc", "cosecant (upright)", undefined, secMath],
  ["arcsin", "inverse sine", undefined, secMath],
  ["arccos", "inverse cosine", undefined, secMath],
  ["arctan", "inverse tangent", undefined, secMath],
  ["sinh", "hyperbolic sine", undefined, secMath],
  ["cosh", "hyperbolic cosine", undefined, secMath],
  ["tanh", "hyperbolic tangent", undefined, secMath],
  // --- Greek letters ---------------------------------------------------------
  ["alpha", "α", undefined, secGreek],
  ["beta", "β", undefined, secGreek],
  ["gamma", "γ", undefined, secGreek],
  ["delta", "δ", undefined, secGreek],
  ["epsilon", "ε", undefined, secGreek],
  ["zeta", "ζ", undefined, secGreek],
  ["eta", "η", undefined, secGreek],
  ["theta", "θ", undefined, secGreek],
  ["iota", "ι", undefined, secGreek],
  ["kappa", "κ", undefined, secGreek],
  ["lambda", "λ", undefined, secGreek],
  ["mu", "μ", undefined, secGreek],
  ["nu", "ν", undefined, secGreek],
  ["xi", "ξ", undefined, secGreek],
  ["pi", "π", undefined, secGreek],
  ["rho", "ρ", undefined, secGreek],
  ["sigma", "σ", undefined, secGreek],
  ["tau", "τ", undefined, secGreek],
  ["upsilon", "υ", undefined, secGreek],
  ["phi", "φ", undefined, secGreek],
  ["chi", "χ", undefined, secGreek],
  ["psi", "ψ", undefined, secGreek],
  ["omega", "ω", undefined, secGreek],
  ["Gamma", "Γ", undefined, secGreek],
  ["Delta", "Δ", undefined, secGreek],
  ["Theta", "Θ", undefined, secGreek],
  ["Lambda", "Λ", undefined, secGreek],
  ["Xi", "Ξ", undefined, secGreek],
  ["Pi", "Π", undefined, secGreek],
  ["Sigma", "Σ", undefined, secGreek],
  ["Upsilon", "Υ", undefined, secGreek],
  ["Phi", "Φ", undefined, secGreek],
  ["Psi", "Ψ", undefined, secGreek],
  ["Omega", "Ω", undefined, secGreek],
  ["varepsilon", "variant epsilon ϵ", undefined, secGreek],
  ["vartheta", "variant theta ϑ", undefined, secGreek],
  ["varpi", "variant pi ϖ", undefined, secGreek],
  ["varsigma", "final sigma ς", undefined, secGreek],
  ["varphi", "variant phi ϕ", undefined, secGreek],
  ["varomega", "variant omega ϻ", undefined, secGreek],
  // --- relations & symbols ---------------------------------------------------
  ["leq", "less than or equal ≤", undefined, secRel],
  ["geq", "greater than or equal ≥", undefined, secRel],
  ["neq", "not equal ≠", undefined, secRel],
  ["equiv", "identical to ≡", undefined, secRel],
  ["approx", "approximately ≈", undefined, secRel],
  ["simeq", "asymptotically equal ≃", undefined, secRel],
  ["sim", "similar ∼", undefined, secRel],
  ["cong", "congruent ≅", undefined, secRel],
  ["propto", "proportional to ∝", undefined, secRel],
  ["ll", "much less than ≪", undefined, secRel],
  ["gg", "much greater than ≫", undefined, secRel],
  ["in", "element of ∈", undefined, secRel],
  ["ni", "contains as element ∋", undefined, secRel],
  ["subset", "subset ⊂", undefined, secRel],
  ["supset", "superset ⊃", undefined, secRel],
  ["subseteq", "subset or equal ⊆", undefined, secRel],
  ["supseteq", "superset or equal ⊇", undefined, secRel],
  ["notin", "not an element of ∉", undefined, secRel],
  ["perp", "perpendicular ⊥", undefined, secRel],
  ["mid", "divides ∣", undefined, secRel],
  ["parallel", "parallel to ∥", undefined, secRel],
  ["prec", "precedes ≺", undefined, secRel],
  ["succ", "succeeds ≻", undefined, secRel],
  ["preceq", "precedes or equal ⪯", undefined, secRel],
  ["succeq", "succeeds or equal ⪰", undefined, secRel],
  ["times", "multiplication ×", undefined, secRel],
  ["div", "division ÷", undefined, secRel],
  ["pm", "plus-minus ±", undefined, secRel],
  ["mp", "minus-plus ∓", undefined, secRel],
  ["ast", "asterisk *", undefined, secRel],
  ["star", "star ⋆", undefined, secRel],
  ["circ", "composition ∘", undefined, secRel],
  ["bullet", "bullet •", undefined, secRel],
  ["cdot", "centered dot ·", undefined, secRel],
  ["cap", "intersection ∩", undefined, secRel],
  ["cup", "union ∪", undefined, secRel],
  ["sqcap", "square intersection ⊓", undefined, secRel],
  ["sqcup", "square union ⊔", undefined, secRel],
  ["setminus", "set difference ∖", undefined, secRel],
  ["oplus", "direct sum ⊕", undefined, secRel],
  ["otimes", "tensor product ⊗", undefined, secRel],
  ["oslash", "circled slash ⊘", undefined, secRel],
  ["odot", "circled dot ⊙", undefined, secRel],
  ["bigodot", "large circled dot", undefined, secRel],
  ["bigoplus", "large direct sum", undefined, secRel],
  ["bigcirc", "large composition", undefined, secRel],
  ["dagger", "dagger †", undefined, secRel],
  ["ddagger", "double dagger ‡", undefined, secRel],
  ["leftarrow", "left arrow ←", undefined, secRel],
  ["rightarrow", "right arrow →", undefined, secRel],
  ["uparrow", "up arrow ↑", undefined, secRel],
  ["downarrow", "down arrow ↓", undefined, secRel],
  ["leftrightarrow", "left-right arrow ↔", undefined, secRel],
  ["Leftarrow", "implied by ⇐", undefined, secRel],
  ["Rightarrow", "implies ⇒", undefined, secRel],
  ["Leftrightarrow", "if and only if ⇔", undefined, secRel],
  ["mapsto", "maps to ↦", undefined, secRel],
  ["longleftarrow", "long left arrow", undefined, secRel],
  ["longrightarrow", "long right arrow", undefined, secRel],
  ["longleftrightarrow", "long left-right arrow", undefined, secRel],
  ["infty", "infinity ∞", undefined, secRel],
  ["nabla", "nabla / gradient ∇", undefined, secRel],
  ["partial", "partial derivative ∂", undefined, secRel],
  ["emptyset", "empty set ∅", undefined, secRel],
  ["varnothing", "empty set (variant)", undefined, secRel],
  ["angle", "angle ∠", undefined, secRel],
  ["triangle", "triangle △", undefined, secRel],
  ["forall", "for all ∀", undefined, secRel],
  ["exists", "there exists ∃", undefined, secRel],
  ["neg", "logical not ¬", undefined, secRel],
  ["flat", "musical flat ♭", undefined, secRel],
  ["natural", "musical natural ♮", undefined, secRel],
  ["sharp", "musical sharp ♯", undefined, secRel],
  ["dots", "dot leader …", undefined, secRel],
  ["ldots", "low dots (inline) …", undefined, secRel],
  ["cdots", "centered dots ⋯", undefined, secRel],
  ["vdots", "vertical dots ⋮", undefined, secRel],
  ["ddots", "descending dots ⋱", undefined, secRel],
  // --- accents -----------------------------------------------------------------
  ["vec", "vector arrow accent", "\\vec{$0}", secAccent],
  ["hat", "hat accent ^", "\\hat{$0}", secAccent],
  ["bar", "bar accent ¯", "\\bar{$0}", secAccent],
  ["tilde", "tilde accent ˜", "\\tilde{$0}", secAccent],
  ["dot", "dot accent ˙", "\\dot{$0}", secAccent],
  ["ddot", "double-dot accent (acceleration)", "\\ddot{$0}", secAccent],
  ["overline", "overline", "\\overline{$0}", secAccent],
  ["widehat", "wide hat accent", "\\widehat{$0}", secAccent],
  ["widetilde", "wide tilde accent", "\\widetilde{$0}", secAccent],
  ["check", "háček accent ˇ", "\\check{$0}", secAccent],
  ["breve", "breve accent ˘", "\\breve{$0}", secAccent],
  ["acute", "acute accent ´", "\\acute{$0}", secAccent],
  ["grave", "grave accent `", "\\grave{$0}", secAccent],
  ["mathring", "ring accent ˚", "\\mathring{$0}", secAccent],
  // --- text symbols --------------------------------------------------------------
  ["LaTeX", "the LaTeX logo", undefined, secSym],
  ["TeX", "the TeX logo", undefined, secSym],
  ["copyright", "copyright symbol ©", undefined, secSym],
  ["S", "section sign §", undefined, secSym],
  ["P", "pilcrow ¶", undefined, secSym],
  ["pounds", "pound sign £", undefined, secSym],
  ["textbackslash", "backslash glyph \\", undefined, secSym],
  ["textasciitilde", "tilde glyph ~", undefined, secSym],
  ["url", "URL (hyperref)", "\\url{$0}", secSym],
  ["href", "hyperlink (hyperref)", "\\href{$0}{}", secSym],
];

// ---------------------------------------------------------------------------
// Apply helpers
// ---------------------------------------------------------------------------

/** Single-slot template apply: insert `template`, caret at its $0 marker
 *  (end of the text if absent). String applies in CM6 cannot position the
 *  caret, so every templated command gets this. */
function slotApply(template: string) {
  const idx = template.indexOf("$0");
  const text = idx < 0 ? template : template.slice(0, idx) + template.slice(idx + 2);
  return (view: EditorView, completion: Completion, from: number, to: number) => {
    view.dispatch({
      changes: { from, to, insert: text },
      selection: { anchor: from + (idx < 0 ? text.length : idx) },
      scrollIntoView: true,
      annotations: [pickedCompletion.of(completion), Transaction.userEvent.of("input.complete")],
    });
  };
}

/** Apply for an environment name picked inside \begin{…} / \end{…}. For
 *  \begin the replacement range is extended back over `\begin{` and the full
 *  paired block is inserted — caret on the middle line, which mirrors the
 *  start line's indentation plus one indent unit; for \end only the name is
 *  completed. */
function envApply(view: EditorView, completion: Completion, from: number, to: number) {
  const state = view.state;
  const env = completion.label;
  const annotations = [pickedCompletion.of(completion), Transaction.userEvent.of("input.complete")];
  const before = state.doc.sliceString(Math.max(0, from - 12), from);
  const m = /\\(begin|end)(?:[ \t]*\{[ \t]*)?$/.exec(before);
  if (!m) {
    // Fallback (should not happen): replace the name range only.
    view.dispatch({
      changes: { from, to, insert: env },
      selection: { anchor: from + env.length },
      annotations,
    });
    return;
  }
  const start = from - m[0].length;
  if (m[1] === "end") {
    const text = `\\end{${env}}`;
    view.dispatch({
      changes: { from: start, to, insert: text },
      selection: { anchor: start + text.length },
      scrollIntoView: true,
      annotations,
    });
    return;
  }
  const spec = ENVIRONMENTS.find((e) => e[0] === env);
  const inner = spec ? spec[2] ?? "" : "";
  const line = state.doc.lineAt(start);
  const baseIndent = (line.text.match(/^[ \t]*/) || [""])[0];
  const unit = state.facet(indentUnit);
  const head = `\\begin{${env}}`;
  const insert = `${head}\n${baseIndent}${unit}${inner}\n${baseIndent}\\end{${env}}`;
  const cursor = start + head.length + 1 + baseIndent.length + unit.length + inner.length;
  view.dispatch({
    changes: { from: start, to, insert },
    selection: { anchor: cursor },
    scrollIntoView: true,
    annotations,
  });
}

const envOption = (name: string, detail: string, boost?: number): Completion => ({
  label: name,
  detail,
  boost,
  apply: envApply,
});

const ENV_OPTIONS: Completion[] = ENVIRONMENTS.map(([n, d]) => envOption(n, d));

// A small ranking boost keeps the most-used commands on top of equally
// matching alternatives from other sections (\\begin over \\beta, \\frac over
// \\framebox) — dynamic section ranks otherwise tie-break alphabetically.
const BOOSTS: Record<string, number> = { begin: 50, end: 50, frac: 50, textbf: 30, textit: 30, textrm: 30 };

const COMMAND_OPTIONS: Completion[] = COMMANDS.map(([name, detail, template, section]) => {
  const c: Completion = { label: "\\" + name, detail, section };
  if (BOOSTS[name] != null) c.boost = BOOSTS[name];
  if (template) c.apply = slotApply(template);
  return c;
});

// ---------------------------------------------------------------------------
// Document scan: which environments are currently open
// ---------------------------------------------------------------------------

/** Names of environments opened via \begin{…} before `pos` that have not
 *  been closed yet — innermost last. A plain scan; documents are small and
 *  this only runs while an environment picker is open. */
function openEnvsBefore(state: EditorState, pos: number): string[] {
  const stack: string[] = [];
  const re = /\\(begin|end)[ \t]*\{([a-zA-Z*]+)\}/g;
  const text = state.doc.sliceString(0, pos);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m[1] === "begin") stack.push(m[2]);
    else {
      const i = stack.lastIndexOf(m[2]);
      if (i >= 0) stack.splice(i, 1);
    }
  }
  return stack;
}

// ---------------------------------------------------------------------------
// The completion source
// ---------------------------------------------------------------------------

const ENV_NAME_RE = /\\(begin|end)[ \t]*\{[ \t]*([a-zA-Z]*)/;
const CMD_RE = /\\[a-zA-Z]*/;
const BARE_ENV_RE = /\\(begin|end)([a-zA-Z]*)$/;

/** Completion source for LaTeX files. Two contexts: an environment name
 *  inside an open \begin{…} / \end{…}, and a command name (\ + letters)
 *  ending at the caret. */
export const latexCompletionSource: CompletionSource = (context) => {
  const state = context.state;

  // Environment name inside an open \begin{…} / \end{…}.
  const envM = context.matchBefore(ENV_NAME_RE);
  if (envM) {
    const m = ENV_NAME_RE.exec(envM.text)!;
    const nameLen = (m[2] || "").length;
    const nameFrom = envM.from + envM.text.length - nameLen;
    let options: Completion[];
    if (m[1] === "end") {
      // Environments still open in the document come first.
      const seen = new Set<string>();
      options = [
        ...openEnvsBefore(state, context.pos)
          .slice()
          .reverse()
          .map((n, i) => {
            seen.add(n);
            return envOption(n, "currently open", 90 - i);
          }),
        ...ENV_OPTIONS.filter((o) => !seen.has(o.label)),
      ];
    } else {
      options = ENV_OPTIONS;
    }
    return { from: nameFrom, to: context.pos, options, validFor: /^[a-zA-Z*]*$/ };
  }

  // A bare \\begin / \\end (no braces yet) also picks an environment
  // name; selecting one inserts the braces — and, for \\begin, the full pair.
  const bareEnvM = context.matchBefore(BARE_ENV_RE);
  if (bareEnvM) {
    const m = BARE_ENV_RE.exec(bareEnvM.text)!;
    const nameLen = (m[2] || "").length;
    let options: Completion[];
    if (m[1] === "end") {
      // Environments still open in the document come first.
      const seen = new Set<string>();
      options = [
        ...openEnvsBefore(state, context.pos)
          .slice()
          .reverse()
          .map((n, i) => {
            seen.add(n);
            return envOption(n, "currently open", 90 - i);
          }),
        ...ENV_OPTIONS.filter((o) => !seen.has(o.label)),
      ];
    } else {
      options = ENV_OPTIONS;
    }
    return { from: context.pos - nameLen, to: context.pos, options, validFor: /^[a-zA-Z*]*$/ };
  }

  // Command name.
  const word = context.matchBefore(CMD_RE);
  if (!word) return null;
  // A bare backslash right after another one is a line break (\\), not a command.
  const bare = word.text.length === 1;
  if (bare && word.from > 0 && state.doc.sliceString(word.from - 1, word.from) === "\\") return null;
  return { from: word.from, to: context.pos, options: COMMAND_OPTIONS, validFor: /^[a-zA-Z]*$/ };
};

// ---------------------------------------------------------------------------
// Vesper styling for the overlay
// ---------------------------------------------------------------------------

export const latexCompletionTheme: Extension = EditorView.theme({
  "& .cm-tooltip.cm-tooltip-autocomplete": {
    background: "var(--bg-raised)",
    border: "1px solid var(--hairline-strong)",
    borderRadius: "3px",
    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.45)",
    fontFamily: "var(--font-ui)",
    fontSize: "12.5px",
    color: "var(--text-2)",
  },
  "& .cm-tooltip.cm-tooltip-autocomplete > ul": {
    maxHeight: "320px",
    minWidth: "300px",
    fontFamily: "inherit",
  },
  "& .cm-tooltip.cm-tooltip-autocomplete > ul > li": {
    padding: "3px 12px 3px 8px",
  },
  "& .cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]": {
    background: "rgba(123, 22, 18, 0.4)",
    color: "var(--pearl)",
  },
  "& .cm-tooltip.cm-tooltip-autocomplete > ul > completion-section": {
    padding: "6px 12px 3px 8px",
    margin: "3px 0 1px",
    color: "var(--text-3)",
    fontSize: "9.5px",
    fontWeight: "600",
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    borderBottom: "1px solid var(--hairline)",
    opacity: 1,
  },
  "& .cm-tooltip.cm-tooltip-autocomplete .cm-completionDetail": {
    color: "var(--text-3)",
    marginLeft: "0.8em",
  },
  "& .cm-tooltip.cm-tooltip-autocomplete .cm-completionMatchedText": {
    textDecoration: "none",
    color: "var(--gold-bright)",
    fontWeight: "600",
  },
});

/** After picking \begin / \end, re-open the picker at the new caret position
 *  (inside the braces) so environment names complete in one continuous flow. */
export const reOpenEnvPicker = (c: Completion): boolean => c.label === "\\begin" || c.label === "\\end";