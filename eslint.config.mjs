// ESLint flat config. Without this file `next lint` stops at an interactive
// "How would you like to configure ESLint?" prompt, which hangs in CI and
// means the lint step never actually ran.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

const config = [
  {
    ignores: [".next/**", ".verify/**", "node_modules/**", "backend/**", "docs/**"],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];

export default config;
