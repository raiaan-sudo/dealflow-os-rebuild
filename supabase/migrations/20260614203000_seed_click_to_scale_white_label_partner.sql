-- dealflow:migration classification=TENANT-NEUTRAL_FORWARD-EQUIVALENT_DATA_MIGRATION remote_version=20260614203000 remote_name=seed_click_to_scale_white_label_partner original_body_status=NOT_RECOVERED authority_sha256=145fb511c7028854f0c541f3a6933dd16667ec687d6afd4c144710a8addccb7d
-- TENANT-NEUTRAL FORWARD-EQUIVALENT DATA MIGRATION; ORIGINAL BODY NOT RECOVERED.
-- Remote lineage identity: 20260614203000_seed_click_to_scale_white_label_partner.
-- Authoritative current-catalog capture: sha256:145fb511c7028854f0c541f3a6933dd16667ec687d6afd4c144710a8addccb7d.
-- This file is generated. Edit scripts/generate-forward-migration-portfolio.mjs or its frozen fixtures.
-- It must never be represented as the historical SQL that originally ran.
-- Intentional no-op: the unavailable original was data-only and tenant-specific.
-- No customer, partner, credential, branding, or provider row is invented by reconstruction.
-- dealflow:statement id=20260614203000.data_noop.001 sha256=0107f5360448e0612f16803bd0681d4b11bf0fd739fea422b575c80a942287a6
SELECT true AS tenant_neutral_noop;

DO $dealflow_postcondition_20260614203000$ BEGIN PERFORM 1; END $dealflow_postcondition_20260614203000$;
