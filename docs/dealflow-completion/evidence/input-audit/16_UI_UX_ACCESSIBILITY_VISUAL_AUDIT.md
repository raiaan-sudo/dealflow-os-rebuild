# UI, UX, accessibility, and visual audit

## Scope and counts

- 147 route/UI surface instances across four candidates = 124 pages + 23 layouts/boundaries; 71 unique route patterns and 53 duplicate page instances.
- Primary: 131 UI TSX files read; 70 action-bearing files; 383 raw control/action JSX occurrences; 279 event-prop occurrences; 39 functional UI action families.
- Static signals: semantic root lang, design tokens/Tailwind mapping, shared Button/Input focus-visible states, overflow wrappers around discovered primary tables, and no missing alt in the inspected static image pattern.
- Live root-browser evidence supersedes the UI subagent browser blocker: the root agent successfully used the in-app Chromium browser later and retained 9 sanitized screenshots.

## Visual/design-system assessment

- Primary app is dark-first with semantic HSL variables, df-* Tailwind tokens, design-system color/spacing/typography modules, and shared primitives.
- Desktop sidebar collapses below lg and mobile navigation becomes horizontally scrollable. The root public pages showed no horizontal overflow at tested widths.
- Marketing homepage is visually polished and responsive, but its approximately 2000-line client component creates an unmeasured hydration/performance risk.
- The inspected public funnel is not publication-quality: internal scaffolding labels, repetition, double punctuation/grammar problems, and an excessively long mobile hero are visible.
- Full-page stitched screenshot background repetition can be a capture artifact and was not filed as a product defect.

## Live browser evidence

| url | roles | viewports_checked | horizontal_overflow | console_warn_error | notes |
| --- | --- | --- | --- | --- | --- |
| https://www.agentdealflow.io/ | anonymous | 320,360,375,390,414,768,1024,1280,1440,1920 | 0 | 0 | Title, one H1, semantic header/nav/main/footer, 29 interactives, no unnamed interactives in simple DOM check, no detected skip link. |
| https://app.agentdealflow.io/login | anonymous | 390x844,1440x900 | 0 | 0 | H1/form/email/password accessible names; document title absent; one sub-24px target heuristic. |
| https://app.agentdealflow.io/f/buyer-funnel-1773194718175 | anonymous | 390x844,1440x900 | 0 | 0 | Name/email/phone and explicit SMS consent names present; document title absent; internal template copy and three sub-24px target heuristics. |
| https://app.agentdealflow.io/dashboard | anonymous redirect | default |  | 0 | Redirected to login with expired/redirectedFrom reason; protected content not accessed. |

## Accessibility findings

| id | severity | title | truth_status | evidence | impact |
| --- | --- | --- | --- | --- | --- |
| FIND-034 | P2 | Login and public funnel have no document title | CONFIRMED | Live browser DOM and GET body markers at 2026-07-10T23:18Z | Screen-reader/orientation friction and search/share quality loss. |
| FIND-035 | P3 | Some mobile controls are below heuristic touch-target size | NOT_PROVEN | Browser DOM heuristic: login one, funnel three controls below 24px in 390px viewport | Potential motor-access friction. |
| FIND-036 | P3 | Marketing page has no detected skip link | NOT_PROVEN | Public homepage DOM/navigation inspection at desktop/mobile | Keyboard-navigation friction. |
| FIND-047 | P2 | Some nominal page renders write telemetry or browser storage | CONFIRMED | preview/page.tsx:174-184; paywall/page.tsx:75-85; dashboard/page.tsx:566-577; onboarding/page.tsx:579-689 | Read-only inspection changes telemetry/local browser state and can distort analytics. |
| FIND-048 | P2 | Material native controls remove focus outline without replacement | CONFIRMED | f/[slug]/lead-capture-form.tsx:270-319; builder-panels.tsx:1445-1528; launch-meta-selection-panel.tsx:197-241 | Keyboard users can lose location and control context. |
| FIND-049 | P2 | Dialogs lack proven focus lifecycle | CONFIRMED | support-widget.tsx:174-179; feedback-widget.tsx:116-121; static-creative-preview-card.tsx:145-165; creative-wizard.tsx:1112-1133 | Keyboard/screen-reader users can leave or lose modal context. |
| FIND-050 | P2 | Auth and lead form status messages are not live-announced | CONFIRMED | login-form.tsx:452-462; lead-capture-form.tsx:340-349; comparison cancellation-intent-form.tsx:125 | Screen-reader users may miss failures or successful submission state. |
| FIND-051 | P2 | No skip-to-main link in app shell or long marketing page | CONFIRMED | 0 skip links across inspected primary/homepage UI; app layout and marketing navigation precede main content | Keyboard users repeat long navigation on each page. |
| FIND-056 | P3 | Selection controls incompletely expose selected/tab state | CONFIRMED | creative-wizard.tsx:717-729; home-command-center.tsx:683-707,1077-1093,1179-1195 | Screen-reader and keyboard users may not perceive or operate state changes. |

## Static source findings

- Public lead fields and builder/Meta selects remove outlines without consistent replacement.
- Four dialogs lack source-proven focus trap/initial focus/restoration; only support handles Escape.
- Login and lead submission status messages lack live announcement while other forms implement it.
- No skip-to-main/content link was found in primary or marketing candidates.
- Creative tab/toggle and marketing selection semantics are incomplete.
- Some page GET renders write telemetry or browser storage, complicating read-only inspection and analytics truth.

## Responsive/browser matrix

- Marketing widths tested in Chromium: 320, 360, 375, 390, 414, 768, 1024, 1280, 1440, 1920; no horizontal overflow.
- Login and funnel tested at 390x844 and 1440x900; no horizontal overflow.
- Firefox/WebKit, 200/400 percent zoom, screen reader, keyboard-only full journey, Core Web Vitals, authenticated roles, paid/provider/error/loading states: BLOCKED or SKIPPED_SAFETY.
- No WCAG conformance claim is made. WCAG 2.2 AA is a control taxonomy for the findings.

## Screenshot handling

Nine public screenshots are indexed in artifact 17. They contain public marketing/login/funnel content only. No dashboard/customer data, cookie, token, private email/phone, or provider/admin panel was intentionally captured.

