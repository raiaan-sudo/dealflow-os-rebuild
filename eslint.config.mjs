import nextPlugin from "@next/eslint-plugin-next";
import nextParser from "eslint-config-next/parser";
import globals from "globals";

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
  {
    files: ["**/*.{js,jsx,mjs,ts,tsx}"],
    plugins: {
      "@next/next": nextPlugin,
    },
    languageOptions: {
      parser: nextParser,
      parserOptions: {
        requireConfigFile: false,
        sourceType: "module",
        allowImportExportEverywhere: true,
        babelOptions: {
          presets: ["next/babel"],
          caller: {
            supportsTopLevelAwait: true,
          },
        },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      "@next/next/no-html-link-for-pages": "off",
    },
  },
];

export default config;
