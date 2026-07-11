# Canonical Accessibility and Truth Tranche

Status: `LOCALLY VERIFIED ANONYMOUS SURFACES / AUTHENTICATED AND ASSISTIVE-TECH PROOF BLOCKED / NO_GO`

Current reconciliation: candidate anonymous root/login desktop and mobile
inspection later passed at the retained viewports with no observed horizontal
overflow and an empty checked console. Invalid tiled full-page captures were
excluded. Authenticated roles/errors, workspace switching, 200% zoom,
screen-reader announcement quality, reduced motion, forced colors, and
Firefox/WebKit remain not proven.

## Scope and safety

- Canonical starting commit: `d37c50945ff7004d700301fc89c15eb9273dac5b`.
- Isolated worktree: `/Users/raiaanreza/.codex/worktrees/dealflow-completion-20260710`.
- Scope: FIND-008, the login redirect portion of FIND-015, FIND-034, FIND-036, FIND-048, the assigned feedback-dialog portion of FIND-049, FIND-050, FIND-051, and FIND-056.
- No deployment, provider call, production write, customer record, communication, dependency, migration, configuration, or external mutation was performed.
- Existing visual layout, color system, spacing, and content hierarchy were preserved. Changes are semantic or visible only during keyboard focus.

## Implemented contracts

### Authentication truth and recovery safety

- Recovery fragments are parsed and removed synchronously before Supabase client creation, `setSession`, or third-party Turnstile script setup can run.
- The fragment remains removed when the client is unavailable, recovery tokens are incomplete, or `setSession` fails.
- Login redirects now reject absolute URLs, scheme-relative URLs, slash-backslash network paths, any backslash-bearing path, root/login loops, and malformed values.
- Accepted redirects are resolved against and normalized to the exact current origin.
- The login route has a specific metadata title; the root layout supplies a descriptive fallback title inherited by public funnel routes.

### Keyboard and focus behavior

- App-shell repeated navigation has a first-focusable skip link targeting the focusable `main` region.
- Marketing repeated navigation has a first-focusable skip link targeting the focusable hero content immediately after its header/navigation.
- A high-contrast `:focus-visible` outline is enforced for interactive controls, including forced-colors support.
- Public lead fields, consent, submit, legal links, and Meta selection controls have explicit focus-visible rings without changing their resting appearance.
- The feedback dialog now establishes initial focus, contains Tab and Shift+Tab navigation, closes on Escape, and restores focus to the opener.

### Programmatic status and selection semantics

- Login, lead capture, feedback, creative selection, and Meta selection updates expose polite status or assertive alert semantics as appropriate.
- Busy forms/panels expose `aria-busy`.
- Marketing mode controls expose group labels, `aria-pressed`, and `aria-controls` relationships.
- The canonical creative test-set buttons already exposed `aria-pressed`; this tranche adds a named group, a relationship to the live selection count, and alert semantics for selection errors.
- Meta selects now have explicit label/control identifiers in addition to their visible labels.

## Finding disposition within this tranche

| Finding | Tranche result | Remaining proof or scope |
| --- | --- | --- |
| FIND-008 | Implemented and hermetically verified | Real-browser failure-path inspection remains required before release. |
| FIND-015 | Login redirect portion implemented and tested with nine positive/negative cases | Meta connect/callback return-path code is outside this tranche. |
| FIND-034 | Login-specific and inherited fallback titles implemented | Verify final SSR/browser titles on login and a real published funnel; campaign-specific funnel titles are not proven here. |
| FIND-036 / FIND-051 | App and marketing skip paths implemented | Confirm first-Tab visibility and post-navigation focus in browser. |
| FIND-048 | Global focus fallback and explicit assigned-control focus rings implemented | Confirm contrast, clipping, zoom, and forced-colors behavior in browser. |
| FIND-049 | Assigned feedback dialog lifecycle implemented | The canonical creative wizard contains no dialog; other dialog implementations remain outside this tranche. |
| FIND-050 | Assigned dynamic auth, lead, feedback, creative, and Meta messages now have live semantics | VoiceOver/NVDA announcement quality requires assistive-technology proof. |
| FIND-056 | Canonical marketing mode controls completed; existing creative selection semantics strengthened | Arrow-key tab behavior from the older audited candidate was not present in this canonical creative wizard. |

## Deterministic verification

Runtime used: Node `v24.14.1`, npm `11.11.0`.

| Check | Result |
| --- | --- |
| `node scripts/test-accessibility-truth-contract.mjs` | PASS — nine redirect cases plus cleanup ordering, title, skip-link, focus, dialog, live-region, and selection contracts. |
| Targeted ESLint across all changed source files and the contract test | PASS — no findings. |
| `npm run typecheck` | PASS. |
| `node scripts/test-ghl-iframe-embed-security.mjs` | PASS. |
| `npm run test:public-funnel-thank-you` | PASS. |
| `npm run test:homepage` | PASS. |
| `npm run test:production-route-contract` | PASS. |
| `git diff --check` | PASS. |

## Browser-only acceptance proof still required

1. On marketing and authenticated app shells, press Tab from a fresh navigation and confirm the skip link appears without layout shift; activate it and confirm focus lands after repeated navigation.
2. Open Feedback by keyboard, confirm focus starts in “What confused you?”, cycles within the dialog in both directions, closes on Escape, and returns to the Feedback trigger.
3. Tab through the public funnel and Meta selectors at 100%, 200%, and forced-colors/high-contrast settings; confirm the focus indicator is visible and not clipped.
4. Trigger representative login, lead, feedback, creative-selection, and Meta error/success states with VoiceOver or NVDA and confirm each message is announced once with suitable urgency.
5. Inspect `document.title` and the server-rendered head on `/login` and a real published `/f/[slug]` route.
6. Exercise a recovery link whose `setSession` call fails and inspect the address bar before any third-party script loads; the token fragment must already be absent.

These browser checks were intentionally not claimed as completed by the offline source and contract tests.
