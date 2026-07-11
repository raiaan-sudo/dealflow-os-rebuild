# Dead, duplicate, legacy, orphaned, and excessive logic

These are disposition candidates, not authorization to delete, consolidate, refactor, or archive.

| id | classification | description | truth_status | evidence | disposition |
| --- | --- | --- | --- | --- | --- |
| DEBT-001 | duplicate | Eleven app/checkouts plus non-Git copies share overlapping DealFlow source lineage. | CONFIRMED | Repository inventory | decide later; no removal or consolidation performed |
| DEBT-002 | orphan | REPO-007 linked worktree points to an absent /private/tmp Git directory. | CONFIRMED | REPO-007 | decide later; no removal or consolidation performed |
| DEBT-003 | legacy/experiment | REPO-008 Next 16 test branch has no valid local or remote head. | CONFIRMED | REPO-008 | decide later; no removal or consolidation performed |
| DEBT-004 | container | REPO-009 wrapper Git repo has no valid head/index and only contains nested repos. | CONFIRMED | REPO-009 | decide later; no removal or consolidation performed |
| DEBT-005 | legacy | REPO-012 dealflow-os-local is a non-Git runner/jobs prototype. | CANDIDATE | REPO-012 | decide later; no removal or consolidation performed |
| DEBT-006 | duplicate docs | Sales Brain exists as nested untracked docs and a separate 28-file copy; exact equality not proven. | CANDIDATE | REPO-015; REPO-018 | decide later; no removal or consolidation performed |
| DEBT-007 | untracked docs | Revenue OS and Sales Brain knowledge packages are untracked inside the primary dirty checkout. | CONFIRMED | REPO-014; REPO-015 | decide later; no removal or consolidation performed |
| DEBT-008 | generated/stale | 262 of 934 primary inventory rows are generated, backup, or prior-output artifacts explicitly excluded from source truth. | CONFIRMED | module inventory | decide later; no removal or consolidation performed |
| DEBT-009 | duplicate routes | Across four UI candidates, 124 page instances collapse to 71 unique patterns plus 53 duplicate instances. | CONFIRMED | UI static inventory | decide later; no removal or consolidation performed |
| DEBT-010 | candidate-only surface | Sixteen routes exist only in alternate UI candidates, including SEO and control-room surfaces. | CONFIRMED | UI route inventory | decide later; no removal or consolidation performed |
| DEBT-011 | excessive component | Marketing homepage centers on an approximately 2000-line client component with multiple runtime effects. | CONFIRMED | FIND-055 | decide later; no removal or consolidation performed |
| DEBT-012 | mixed tenancy | Organization membership, user ownership and workspace mapping are all used for related resources. | CONFIRMED | FIND-005; FIND-006; FIND-012 | decide later; no removal or consolidation performed |
| DEBT-013 | split worker | Marketing Studio requires a separate operator CLI worker absent from normal Vercel cron architecture. | CONFIRMED_ARCHITECTURE; runtime NOT_PROVEN | FIND-025 | decide later; no removal or consolidation performed |
| DEBT-014 | false abstraction | GHL next_retry_at models a retry schedule without an observed consumer. | NOT_PROVEN_REPO_WIDE | FIND-043 | decide later; no removal or consolidation performed |
| DEBT-015 | weak type contract | Supabase database types are generic any/unknown rather than generated schema types. | CONFIRMED | FIND-040 | decide later; no removal or consolidation performed |
| DEBT-016 | stale proof | Command center embeds historical proof text and hard-coded readiness percentages. | CONFIRMED | FIND-010 | decide later; no removal or consolidation performed |
| DEBT-017 | partial registry | Provider readiness registry omits material integrations and mixes configured with ready. | CONFIRMED | FIND-029 | decide later; no removal or consolidation performed |
| DEBT-018 | duplicated form semantics | Focus/status/dialog accessibility behavior is inconsistent between shared primitives and native/custom controls. | CONFIRMED | FIND-048 through FIND-051 | decide later; no removal or consolidation performed |
| DEBT-019 | lexical safety gate | Route-security script uses string markers rather than semantic authorization proof. | CONFIRMED | FIND-016 | decide later; no removal or consolidation performed |
| DEBT-020 | compatibility route | Results and selected legacy build routes act as compatibility/recovery redirects; current necessity not owner-decided. | CANDIDATE | primary route inventory | decide later; no removal or consolidation performed |
## Counts

| classification | count |
| --- | --- |
| duplicate | 1 |
| orphan | 1 |
| legacy/experiment | 1 |
| container | 1 |
| legacy | 1 |
| duplicate docs | 1 |
| untracked docs | 1 |
| generated/stale | 1 |
| duplicate routes | 1 |
| candidate-only surface | 1 |
| excessive component | 1 |
| mixed tenancy | 1 |
| split worker | 1 |
| false abstraction | 1 |
| weak type contract | 1 |
| stale proof | 1 |
| partial registry | 1 |
| duplicated form semantics | 1 |
| lexical safety gate | 1 |
| compatibility route | 1 |

## Highest-leverage simplification order

- First decide canonical sources and domain roles; cleanup before that risks deleting evidence or active work.
- Then unify tenancy/resource ownership and queue/effect state models.
- Then remove false abstractions: hard-coded readiness, lexical security proof, inert retry semantics, generic DB types.
- Then consolidate accessible dialog/form/status primitives and marketing component complexity based on measured evidence.
- Archive/delete decisions require Raiaan approval and are outside this read-only audit.

