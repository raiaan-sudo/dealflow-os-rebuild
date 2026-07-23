import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const config = [
  {
    ignores: [
      ".next/**",
      ".next-safe-e2e/**",
      "node_modules/**",
      "out/**",
      "coverage/**",
      "src/client/**",
      "src/server/**",
      "src/shared/**",
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
