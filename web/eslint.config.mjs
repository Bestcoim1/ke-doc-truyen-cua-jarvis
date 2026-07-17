import { defineConfig } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

// Next 16 exports native flat configs; FlatCompat cannot serialize their plugin cycles.
export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  {
    // Generated and minified by Serwist during `next build`.
    ignores: ["public/sw.js"],
  },
]);
