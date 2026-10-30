// ESLint flat config.
//
// Next 16 removed `next lint`, so `npm run lint` now runs the ESLint CLI
// directly and eslint-config-next 16 is imported as native flat config (the
// FlatCompat shim it previously needed is gone with it).
import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const config = [
  {
    ignores: [".next/**", ".verify/**", "node_modules/**", "backend/**", "docs/**", "next-env.d.ts"],
  },
  ...coreWebVitals,
  ...typescript,
  {
    // eslint-config-next 16 enables the React Compiler lint set. Its
    // set-state-in-effect rule flags two client-only mount effects
    // (sessionStorage read in IntroModal, fetch-on-mount in /account) that are
    // deliberate. Kept visible as warnings rather than refactored inside a
    // dependency upgrade.
    plugins: { "react-hooks": coreWebVitals.find((b) => b.plugins?.["react-hooks"]).plugins["react-hooks"] },
    rules: { "react-hooks/set-state-in-effect": "warn" },
  },
  {
    files: ["**/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
];

export default config;
