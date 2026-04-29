# Next 16 Upgrade Assessment

Date: 2026-04-28

## Verdict

Do not merge the Next 16 upgrade into the launch branch for the current public-launch hardening window.

The upgrade was tested in an isolated worktree/branch, `codex/next-16-upgrade-test`, so the production branch stayed stable. The application can typecheck and build on Next 16 after compatibility edits, but the upgrade does not currently remove the dependency advisory and it requires lint compatibility exceptions. That makes it a risky launch-window change with no proven security payoff.

## What Was Tested

Upgrade set:

- `next@16.2.4`
- `react@19.2.3`
- `react-dom@19.2.3`
- `eslint@9.39.2`
- `eslint-config-next@16.2.4`
- `@types/react@19`
- `@types/react-dom@19`
- compatible TypeScript, Tailwind, Supabase, and Lucide patch versions

Commands run in the isolated worktree:

```bash
npm run lint
npm run typecheck
npm run build
npm run smoke:offline
npm audit --omit=dev
```

## Findings

- `next lint` is removed in the Next 16 toolchain, so the project needs an ESLint 9 flat config and the lint script must change to `eslint .`.
- React 19 types required a local Lucide wrapper type adjustment from global `JSX` to React's exported `JSX` type.
- Next 16 build updated `tsconfig.json` to use `jsx: "react-jsx"` and include `.next/dev/types/**/*.ts`.
- ESLint 9 with Next 16 surfaced new React hook rules across existing client components. The isolated test required disabling `react-hooks/set-state-in-effect` and ignoring vendored framework source folders to keep lint practical during this launch window.
- `npm audit --omit=dev` still reported a PostCSS advisory through Next's nested dependency after the Next 16 upgrade. Because the upgrade did not clear the audit finding, it should not be forced into production solely for dependency mitigation.

## Required Follow-Up Before Merge

1. Create a dedicated Next 16 PR outside the launch hardening PR.
2. Replace `next lint` with a reviewed ESLint 9 flat config.
3. Decide whether to refactor the flagged synchronous `setState` effects or explicitly disable the new React hook rules with documented rationale.
4. Remove or exclude vendored framework source folders from lint/typecheck if they are not application code.
5. Re-run full validation and browser smoke against a Vercel preview deployment.
6. Confirm `npm audit --omit=dev` output after the upstream Next/PostCSS advisory state changes.

## Launch Mitigation

For the controlled launch window, keep the current Next 14 production branch and document the dependency advisory as a monitored non-blocking risk. The app is hosted on Vercel, not self-hosted, and no broad public launch claim should depend on the unfinished Next 16 migration.
