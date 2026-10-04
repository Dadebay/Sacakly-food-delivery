import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";
export default tseslint.config(
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts"] },
  { files: ["**/*.{js,mjs}"], ...js.configs.recommended, languageOptions: { globals: globals.node } },
  { files: ["public/sw.js"], languageOptions: { globals: globals.serviceworker } },
  ...tseslint.configs.recommended,
  { files: ["src/**/*.{ts,tsx}"], languageOptions: { globals: { ...globals.browser, ...globals.node } }, plugins: { "react-hooks": reactHooks }, rules: { ...reactHooks.configs.flat["recommended-latest"].rules } },
);
