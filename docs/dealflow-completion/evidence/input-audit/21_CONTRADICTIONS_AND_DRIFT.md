# Contradictions and drift

Every row is an explicit mismatch between source, runtime, configuration, state models, tools, documentation, or candidate checkouts. It does not assume which side is intended.

| id | contradiction | related_evidence | status |
| --- | --- | --- | --- |
| CONTRA-001 | Primary source root renders a landing page; live app/apex roots redirect to login. | FIND-054 | CONFIRMED_OR_EXPLICITLY_QUALIFIED |
| CONTRA-002 | Historical runbooks describe apex/www behavior that current live responses contradict. | DEP-002; DEP-003 | CONFIRMED_OR_EXPLICITLY_QUALIFIED |
| CONTRA-003 | REPO-004 and REPO-005 share HEAD but package manifests differ. | repository inventory | CONFIRMED_OR_EXPLICITLY_QUALIFIED |
| CONTRA-004 | Strongest app and marketing candidates differ from observed remote branch tips. | REPO-001; REPO-010 | CONFIRMED_OR_EXPLICITLY_QUALIFIED |
| CONTRA-005 | Repo instructions require Node 20 while REPO-006 manifest requests Node 24.x. | REPO-006 | CONFIRMED_OR_EXPLICITLY_QUALIFIED |
| CONTRA-006 | Cron schedule is one minute in most clones, five minutes in REPO-008, and scale monitor appears only in alternates. | repository/deployment inventory | CONFIRMED_OR_EXPLICITLY_QUALIFIED |
| CONTRA-007 | Creative selection allows zero UGC; launch requires at least one. | FIND-018 | CONFIRMED_OR_EXPLICITLY_QUALIFIED |
| CONTRA-008 | Meta OAuth and execution use different hard-coded API versions; META_SCOPES is not applied by connect. | FIND-027 | CONFIRMED_OR_EXPLICITLY_QUALIFIED |
| CONTRA-009 | Lead parent job can be completed while a child provider result is failed. | FIND-003 | CONFIRMED_OR_EXPLICITLY_QUALIFIED |
| CONTRA-010 | GHL next_retry_at implies scheduled retry but no consumer is observed. | FIND-043 | CONFIRMED_OR_EXPLICITLY_QUALIFIED |
| CONTRA-011 | Command center can report all-zero/hard-coded readiness when data is unavailable. | FIND-010 | CONFIRMED_OR_EXPLICITLY_QUALIFIED |
| CONTRA-012 | Provider registry can say ready while omitting material providers and using env presence. | FIND-029 | CONFIRMED_OR_EXPLICITLY_QUALIFIED |
| CONTRA-013 | App layout expects x-dealflow-auth-state; proxy does not set it. | FIND-020 | CONFIRMED_OR_EXPLICITLY_QUALIFIED |
| CONTRA-014 | Meta deletion endpoint returns confirmation without deletion workflow. | FIND-004 | CONFIRMED_OR_EXPLICITLY_QUALIFIED |
| CONTRA-015 | Tools labeled safe write builds/reports/sessions/data under their documented flows. | FIND-053 | CONFIRMED_OR_EXPLICITLY_QUALIFIED |
| CONTRA-016 | Route-security checker can report green from lexical markers without semantic guards. | FIND-016 | CONFIRMED_OR_EXPLICITLY_QUALIFIED |
| CONTRA-017 | Onboarding marks completion yet retains the full PII draft in localStorage. | FIND-013 | CONFIRMED_OR_EXPLICITLY_QUALIFIED |
| CONTRA-018 | Public funnel is published while exposing internal template labels and broken copy. | FIND-033 | CONFIRMED_OR_EXPLICITLY_QUALIFIED |
## Decision rule

Do not resolve these by trusting filenames, branch labels, hard-coded readiness, or old runbooks. Resolve with owner intent plus current canonical source, deployed provenance, schema/config presence attestation, and isolated execution proof.

