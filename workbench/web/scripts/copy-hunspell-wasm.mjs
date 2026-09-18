// Copy the hunspell WASM binary into public/ so the emscripten loader can
// fetch it. The loader (hunspell-wasm/wasm/hunspell.js) resolves the binary as
// a bare relative URL in the browser, which Vite serves from the public root
// in dev and copies verbatim into dist/ on build. Runs on every npm install
// so a fresh checkout always has the asset (see package.json postinstall).
import { copyFileSync, mkdirSync } from "node:fs";

mkdirSync("public", { recursive: true });
copyFileSync(
  "node_modules/hunspell-wasm/wasm/hunspell.wasm",
  "public/hunspell.wasm",
);
