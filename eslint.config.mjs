import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const config = [
  {
    ignores: [
      ".next/**",
      ".next.stale-*/**",
      ".playwright-cli/**",
      ".tmp-playwright/**",
      "node_modules/**",
      "node_modules.corrupt*/**",
      "out/**",
      "test-results/**",
      "coverage/**",
    ],
  },
  ...nextCoreWebVitals,
  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
  },
];

export default config;
