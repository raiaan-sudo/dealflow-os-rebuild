-- dealflow:migration classification=FORWARD-EQUIVALENT_RECONSTRUCTION remote_version=20260504220000 remote_name=harden_rls_and_fk_advisors original_body_status=NOT_RECOVERED authority_sha256=145fb511c7028854f0c541f3a6933dd16667ec687d6afd4c144710a8addccb7d
-- FORWARD-EQUIVALENT RECONSTRUCTION; ORIGINAL BODY NOT RECOVERED.
-- Remote lineage identity: 20260504220000_harden_rls_and_fk_advisors.
-- Authoritative current-catalog capture: sha256:145fb511c7028854f0c541f3a6933dd16667ec687d6afd4c144710a8addccb7d.
-- This file is generated. Edit scripts/generate-forward-migration-portfolio.mjs or its frozen fixtures.
-- It must never be represented as the historical SQL that originally ran.
-- No unique DDL can be attributed to this unavailable body. Its forward-equivalent postconditions are emitted by the cumulative reconciliation files in this portfolio.
-- dealflow:statement id=20260504220000.forward_noop.001 sha256=4e1480e68adcb5f611e7e5504b5316b61fd50680cc4451a1636364995dc83eef
SELECT true AS forward_equivalent_noop;

DO $dealflow_postcondition_20260504220000$ BEGIN PERFORM 1; END $dealflow_postcondition_20260504220000$;
