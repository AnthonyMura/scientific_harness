// The emscripten loader ships without types; only its default export is used.
declare module "hunspell-wasm/wasm/hunspell.js" {
  const init: (moduleArg?: Record<string, unknown>) => Promise<unknown>;
  export default init;
}
