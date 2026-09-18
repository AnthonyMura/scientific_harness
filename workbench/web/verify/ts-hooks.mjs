// Node ESM resolution hook: retry relative/parent specifiers with a .ts
// suffix so bundler-style extensionless imports (e.g. "./bibFormat") load
// under --experimental-strip-types. Run harnesses with:
//   node --experimental-strip-types --import ./verify/ts-hooks.mjs verify/<name>.mjs
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if ((specifier.startsWith("./") || specifier.startsWith("../")) && !specifier.endsWith(".ts")) {
        return nextResolve(specifier + ".ts", context);
      }
      throw err;
    }
  },
});