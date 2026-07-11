# DealFlow Owner Vision Ledger

## Capture status

- Mode: `VISION_CAPTURE`
- Vision status: `OPERATING_MODEL_AND_SCOPE_APPROVED`
- Current chunk: `CHUNK-002`
- Stop marker received: `IMPLICIT_OWNER_CAPTURE_COMPLETE`
- Reconciliation against technical audit: `INITIAL_RECONCILIATION_COMPLETE`
- Implementation planning: `MASTER_EXECUTION_PROMPT_ISSUED_NOT_EXECUTED`
- Capture stage: `COMPLETE`

This ledger records Raiaan's desired DealFlow. It does not treat statements about current implementation as verified facts.

## North Star and positioning

### VISION-001 — Realtor-only platform

- Classification: `NON_NEGOTIABLE`
- Desired state: DealFlow is purpose-built for realtors and real-estate agents.
- Boundary: Do not broaden the product to non-realtor industries.

### VISION-002 — Customer outcome

- Classification: `NON_NEGOTIABLE`
- Desired state: Customers pay for leads and real sales conversations.
- Intent: DealFlow must produce meaningful pipeline, not merely generate marketing assets.

### VISION-003 — Lower-barrier alternative to agencies

- Classification: `NON_NEGOTIABLE`
- Desired state: DealFlow replaces or materially reduces dependence on expensive marketing agencies through a substantially lower-barrier software product.
- Value thesis: The software should perform the major advertising-system work customers currently pay agencies large retainers or upfront fees to perform.

## Three flawless journeys

### VISION-004 — Personalized onboarding

- Classification: `NON_NEGOTIABLE`
- Desired state: A realtor completes a clear, low-confusion onboarding form.
- The onboarding data must become the authoritative input for the customer's funnel, offer, headlines, ad copy, creatives, targeting context, and campaign setup.

### VISION-005 — Personalized output integrity

- Classification: `NON_NEGOTIABLE`
- Desired state: Every generated funnel, creative, and piece of copy must accurately reflect the onboarding inputs, including audience type, seller/buyer focus, offer, market, brand, and other collected context.
- Protected behavior: No generic or mismatched output when the required customer context exists.

### VISION-006 — Seamless campaign launch

- Classification: `NON_NEGOTIABLE`
- Desired state: The customer connects their own Meta/Facebook account, selects the appropriate assets and pixel, selects ad spend, explicitly clicks launch, and DealFlow reliably creates/schedules the campaign.

### VISION-007 — Perfect tracking and lead capture

- Classification: `NON_NEGOTIABLE`
- Desired state: Pixel/tracking setup, funnel or instant-form submission, lead persistence, attribution, and delivery must work every time without silent loss.
- Product truth requirement: DealFlow must prove whether a lead was received, stored, routed, and delivered.

### VISION-008 — Autonomous optimization

- Classification: `NON_NEGOTIABLE`
- Desired state: Once campaigns are live, DealFlow actively monitors and optimizes them using defined performance rules and feedback.
- Intent: Optimization must be operational behavior, not static recommendations or dormant code.

### VISION-009 — Live and truthful reporting

- Classification: `NON_NEGOTIABLE`
- Desired state: Results and campaign metrics populate continuously and accurately for every customer.
- Product truth requirement: The UI must distinguish current, delayed, missing, estimated, and provider-confirmed data.

## Golden customer journey

### VISION-010 — Onboarding experience

- Classification: `NON_NEGOTIABLE`
- Desired state: Onboarding is simple enough that the customer is not overwhelmed or confused.

### VISION-011 — Automatic campaign asset construction

- Classification: `NON_NEGOTIABLE`
- Desired state: After onboarding, DealFlow automatically builds the funnel, ad copy, and creatives from the customer's inputs.
- Desired reaction: The customer should immediately perceive the output as unusually valuable, impressive, and ready to use.

### VISION-012 — Explicit customer launch control

- Classification: `NON_NEGOTIABLE`
- Desired state: The customer owns and connects their Meta account, chooses their budget and relevant assets, and initiates launch.
- Approval boundary: DealFlow must not choose or initiate the initial spend without the customer's explicit launch action.

### VISION-013 — 9:00 a.m. Eastern launch scheduling

- Classification: `STRONG_PREFERENCE`
- Desired state: New campaigns begin at 9:00 a.m. America/Toronto/Eastern rather than immediately at an arbitrary onboarding or launch time.
- Example rule supplied: A customer launching at 4:00 p.m. should be scheduled for 9:00 a.m. the next day.
- Exact cutoff/weekend/holiday behavior: `UNDECIDED`

### VISION-014 — Lead delivery after launch

- Classification: `NON_NEGOTIABLE`
- Desired state: Leads submitted through DealFlow funnels or Meta instant forms are reliably captured, persisted, attributed, and delivered to the correct customer system.

### VISION-015 — Reporting after launch

- Classification: `NON_NEGOTIABLE`
- Desired state: The Results experience shows live campaign and lead metrics rather than empty or stale screens.

## GoHighLevel-centered operating model

### VISION-016 — GoHighLevel connection during onboarding

- Classification: `NON_NEGOTIABLE`
- Desired state: Every new realtor receives their own DealFlow-provided GoHighLevel account/location as part of starting with DealFlow. The required snapshot is already installed before the customer begins using the connected experience.

### VISION-017 — GoHighLevel-hosted funnels

- Classification: `STRONG_PREFERENCE`
- Desired state: DealFlow automatically creates and hosts each customer's advertising funnel directly inside GoHighLevel instead of relying on an unclear parallel funnel system.

### VISION-018 — Leads flow directly into GoHighLevel

- Classification: `NON_NEGOTIABLE` if the GHL-centered model is approved
- Desired state: Funnel and instant-form leads arrive in the correct GoHighLevel location automatically and without duplicate or lost records.

### VISION-019 — Snapshot-based follow-up infrastructure

- Classification: `NON_NEGOTIABLE`
- Desired state: Each newly provided GoHighLevel account/location arrives with the approved, versioned DealFlow snapshot already installed, including the intended follow-ups, tags, tracking, pipeline behavior, and related lead-handling infrastructure.

### VISION-020 — DealFlow embedded in GoHighLevel

- Classification: `STRONG_PREFERENCE`
- Desired state: White-label/partner customers can access DealFlow as an embedded advertising-platform tab within GoHighLevel.
- Evidence source described by owner: An existing partner implementation demonstrates this model.
- Private partner details: redacted from this ledger.

### VISION-021 — Seamless DealFlow/GHL experience

- Classification: `NON_NEGOTIABLE` if the GHL-centered model is approved
- Desired state: Customers experience DealFlow and GoHighLevel as one connected advertising-to-lead-follow-up system rather than disconnected tools requiring manual handoffs.

## Activation and paywall

### VISION-022 — Value-building onboarding before paywall

- Classification: `STRONG_PREFERENCE`
- Desired state: Customers complete enough onboarding to become invested in seeing their personalized campaign output before encountering the paywall.

### VISION-023 — Commercial activation event

- Classification: `NON_NEGOTIABLE`
- Definition supplied: A customer becomes an active DealFlow user when payment succeeds through the Stripe paywall after onboarding.
- Boundary: Technical setup, campaign launch, or a test lead may be tracked as readiness milestones, but they do not redefine customer activation.

## Automation and ownership

### VISION-024 — Automatic funnel creation

- Classification: `NON_NEGOTIABLE`
- Desired state: DealFlow constructs the funnel from onboarding data.

### VISION-025 — Automatic creative generation

- Classification: `NON_NEGOTIABLE`
- Desired state: DealFlow generates creative assets through Higgsfield and any approved creative pipeline without requiring the customer to design them manually.

### VISION-026 — Automatic ad-copy creation

- Classification: `NON_NEGOTIABLE`
- Desired state: DealFlow generates ad copy aligned with the customer's onboarding inputs and offer.

### VISION-027 — Automatic live-campaign optimization

- Classification: `NON_NEGOTIABLE`
- Desired state: DealFlow applies approved optimization rules to active campaigns and uses performance feedback continuously.
- Approval and spend guardrails: DealFlow may act autonomously inside the customer's approved advertising budget and the approved optimization rulebook. The existing thresholds, minimum-data requirements, scale/cut rules, cooldowns, caps, and emergency stops must be recovered, reconciled, simulated, and safety-approved before live use.

### VISION-028 — DealFlow's intended responsibility

- Classification: `STRONG_PREFERENCE`
- Desired state: DealFlow owns or centrally manages the advertising system, funnel construction, creatives, ad copy, campaign workflow, and autonomous optimization.
- Meaning of legal/data ownership versus operational responsibility: `UNDECIDED`

### VISION-029 — Customer-owned external accounts

- Classification: `NON_NEGOTIABLE`
- Desired state: The customer retains ownership of their Meta/Facebook account, calendar, Stripe account, and other external business accounts.

## Support

### VISION-030 — In-product support ticket flow

- Classification: `NON_NEGOTIABLE`
- Desired state: A bottom-right support control lets customers submit a problem immediately from DealFlow.
- Desired routing: The submission reaches the designated DealFlow support mailbox automatically.
- Support address and ticket-system source of truth: `UNDECIDED`

### VISION-031 — Fast support response

- Classification: `STRONG_PREFERENCE`
- Desired state: The support system works immediately and failures involving generation, publishing, payments, integrations, jobs, or providers can be escalated without friction.
- Exact response-time commitments: `UNDECIDED`

## Pricing, credits, and limits

### VISION-032 — One standard subscription

- Classification: `NON_NEGOTIABLE` at current vision stage
- Desired state: One standard DealFlow price of `$297` through a Stripe paywall.

### VISION-033 — Discount codes

- Classification: `STRONG_PREFERENCE`
- Desired state: Approved discounts are applied through codes rather than separate informal pricing logic.

### VISION-034 — Included generation credit

- Classification: `NON_NEGOTIABLE` at current vision stage
- Desired state: A newly enrolled paying customer receives `$10` in generation credit.

### VISION-035 — Generation prices

- Classification: `NON_NEGOTIABLE` at current vision stage
- Desired state: AI video generation costs the customer `$5` per generation; static-ad generation costs `$1` per generation.

### VISION-036 — Zero-credit enforcement

- Classification: `NON_NEGOTIABLE`
- Desired state: At a zero balance, the customer cannot generate additional creative until they purchase more credit.
- Top-up products, expiry, failed-generation refunds, reservations, and concurrency rules: `UNDECIDED`

## Success

### VISION-037 — Retention is the leading success signal

- Classification: `NON_NEGOTIABLE`
- Desired state: Continued payment and low churn demonstrate that customers perceive recurring value.

### VISION-038 — Stable and growing MRR

- Classification: `NON_NEGOTIABLE`
- Desired state: MRR should remain stable and grow rather than being undermined by preventable customer drop-off.

### VISION-039 — High output and product quality

- Classification: `NON_NEGOTIABLE`
- Desired state: Creative, funnel, campaign, reporting, and overall product quality remain consistently high.

## Preservation and implementation posture

### VISION-040 — Preserve the current UI and layout

- Classification: `NON_NEGOTIABLE`
- Desired state: Retain the current DealFlow visual direction, interface structure, and layout.
- Change boundary: Do not redesign the product for novelty. Change UI only where the audit proves a correctness, security, accessibility, responsiveness, consistency, or material usability problem.

### VISION-041 — Preserve the current onboarding experience

- Classification: `NON_NEGOTIABLE`
- Owner assessment: The current onboarding form works well.
- Desired state: Preserve its effective flow and presentation while repairing any audit-proven data propagation, validation, persistence, or edge-case defects.

### VISION-042 — Preserve the current paywall

- Classification: `NON_NEGOTIABLE`
- Owner assessment: The current paywall and core payment flow are substantially established.
- Desired state: Preserve the intended experience while repairing any audit-proven billing, entitlement, security, status, or failure-handling defects.

### VISION-043 — Surgical remediation rather than wholesale rebuild

- Classification: `NON_NEGOTIABLE`
- Desired state: Reuse the substantial existing DealFlow infrastructure. Fix root-cause bugs, close missing connections, remove contradictions, and implement the approved GoHighLevel changes without casually replacing working systems.

### VISION-044 — GoHighLevel migration is the primary architectural change

- Classification: `STRONG_PREFERENCE`
- Desired state: The major planned change is deeper GoHighLevel integration, including moving funnel creation/hosting into GHL and connecting lead follow-up infrastructure.
- Exact migration and provider-ownership model: DealFlow provides each realtor's GHL account/location and pre-installs the snapshot. Existing funnel migration, compatibility, and rollback mechanics still require implementation design and proof.

### VISION-045 — Owner estimates current product at approximately 90% complete

- Classification: `OWNER_ASSESSMENT_NOT_VERIFIED`
- Meaning: Raiaan believes most infrastructure and intended UX already exist and the remaining gap is mainly bugs, missing connections, GHL expansion, and funnel migration.
- Audit rule: Do not use the percentage as technical proof. Recalculate readiness from the completed evidence-backed audit.

## Locked operating-model decisions

### VISION-046 — Realtor-first ownership model

- Classification: `NON_NEGOTIABLE`
- Desired state: The ordinary product experience is designed for individual realtors. White-label partners may manage multiple realtor environments. Team and brokerage complexity is not a current product priority.
- UI boundary: Resource ownership and tenant hierarchy must exist securely underneath the product but remain invisible to an ordinary realtor unless directly relevant.

### VISION-047 — Approved systems of record

- Classification: `NON_NEGOTIABLE`
- Meta owns advertising delivery metrics and provider-confirmed campaign performance.
- GoHighLevel owns CRM contacts, opportunities, pipeline, appointments, and follow-up lifecycle after verified ingestion.
- Stripe owns subscription and payment truth.
- DealFlow owns onboarding/configuration intent, generated assets, funnel/campaign workflow, launch receipts, job state, optimization decisions, cross-system identity mappings, and unified reconciliation status.

### VISION-048 — Autonomous optimization authority

- Classification: `NON_NEGOTIABLE`
- Desired state: DealFlow may automatically cut, pause, scale, or reallocate advertising within the customer's approved budget when the approved rulebook authorizes the action.
- Safety boundary: The implementation must recover the previously supplied operating rules, detect contradictions, validate them against minimum-data and budget-safety requirements, simulate them, and produce a final explicit rulebook before enabling live action.
- Proof boundary: Every decision and action requires a reason, inputs, before/after state, authority check, idempotency, audit history, and recovery path.

### VISION-049 — Activation means payment

- Classification: `NON_NEGOTIABLE`
- Definition: A user is activated when their DealFlow payment succeeds.
- Boundary: Setup completion, campaign launch, first lead, and readiness may be separate operational milestones but are not activation.

### VISION-050 — No-regression baseline protection

- Classification: `NON_NEGOTIABLE`
- Desired state: No implementation or release may restore, merge, build from, or deploy an older or unverified DealFlow version.
- Required control: Prove the canonical repository, branch, commit, deployment ancestry, live domain mapping, schema state, and protected current behavior before implementation begins.

### VISION-051 — Permanent fixes only

- Classification: `NON_NEGOTIABLE`
- Desired state: Fix root causes with durable state, constraints, idempotency, retries, recovery, truthful UI, tests, and documentation. Do not accept quick patches, symptom masking, swallowed errors, fabricated success, or hard-coded readiness.

### VISION-052 — Additive product development

- Classification: `NON_NEGOTIABLE`
- Desired state: Keep the existing UI structure and working infrastructure, repair proven defects surgically, and develop the approved GHL operating model on top of the verified current product.
- Change boundary: No broad redesign, rewrite, speculative framework migration, dependency-wide upgrade, or unrelated cleanup without separate owner approval.

## Protected-behavior register

### PROTECTED-001 — Existing visual product direction

Preserve the current UI/layout unless a change is justified by an audit finding or an explicit later owner decision.

### PROTECTED-002 — Existing onboarding strengths

Preserve the effective onboarding flow while proving that its data drives every downstream output correctly.

### PROTECTED-003 — Existing paywall and pricing journey

Preserve the current intended paywall journey while validating payment, entitlement, discount, credit, failure, and recovery behavior.

### PROTECTED-004 — Existing working infrastructure

Prefer targeted repairs and consolidation over replacement. A subsystem should be rebuilt only when evidence shows repair would be less reliable, less secure, or materially more expensive than replacement.

## Reported current-state problems for audit reconciliation

These are owner reports, not verified audit findings.

### REPORTED-001 — Funnel leads may be lost or not persisted

- Status: `REPORTED_NOT_VERIFIED`
- Report: Some funnel submissions may not be stored, tracked, or delivered correctly.

### REPORTED-002 — Pixel/tracking may be misconfigured

- Status: `REPORTED_NOT_VERIFIED`
- Report: Current campaign/funnel setup may have incorrect or incomplete Meta pixel/tracking behavior.

### REPORTED-003 — Results metrics may be empty

- Status: `REPORTED_NOT_VERIFIED`
- Report: At least one existing customer results view reportedly showed no campaign metrics.
- Private customer details: redacted from this ledger.

### REPORTED-004 — Autonomous optimization may not be operating

- Status: `REPORTED_NOT_VERIFIED`
- Report: Optimization logic was previously specified, but actual live monitoring and action are not proven.

## Remaining implementation-detail register

The operating model is locked. These details do not block approval of the pre-implementation scope. They must be discovered during the read-only continuation audit or resolved conservatively before the affected capability is released.

1. Exact definition of a qualified lead and a meaningful sales conversation.
2. Exact 9:00 a.m. Eastern cutoff, weekend, holiday, and override behavior.
3. Exact GHL agency/location ownership and provisioning mechanics for direct versus white-label customers.
4. Operational control versus legal/data ownership of funnels created in DealFlow-provided GHL environments.
5. Exact realtor, white-label partner, and platform-admin permission boundaries.
6. The normalized numerical optimizer rulebook: minimum data, CTR/CPL thresholds, cut/scale caps, cooldowns, emergency stops, and rollback.
7. Reporting metric definitions, attribution rules, refresh targets, and delayed-data behavior within the approved systems-of-record split.
8. Support destination, ticket storage, alert ownership, response targets, and escalation.
9. Credit top-ups, reservation timing, failed-generation refunds, expiry, and concurrent use.
10. Taxes, currency, billing interval, cancellation, grace periods, refunds, and plan changes.
11. Provider outage, partial launch, lead-sync failure, and duplicate-prevention policy.
12. Exact MRR, retention, churn, lead-quality, conversation, and time-to-value targets.
