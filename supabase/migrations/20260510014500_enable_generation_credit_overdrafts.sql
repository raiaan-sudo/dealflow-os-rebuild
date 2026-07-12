-- dealflow:migration classification=FORWARD-EQUIVALENT_RECONSTRUCTION remote_version=20260510014500 remote_name=enable_generation_credit_overdrafts original_body_status=NOT_RECOVERED authority_sha256=145fb511c7028854f0c541f3a6933dd16667ec687d6afd4c144710a8addccb7d
-- FORWARD-EQUIVALENT RECONSTRUCTION; ORIGINAL BODY NOT RECOVERED.
-- Remote lineage identity: 20260510014500_enable_generation_credit_overdrafts.
-- Authoritative current-catalog capture: sha256:145fb511c7028854f0c541f3a6933dd16667ec687d6afd4c144710a8addccb7d.
-- This file is generated. Edit scripts/generate-forward-migration-portfolio.mjs or its frozen fixtures.
-- It must never be represented as the historical SQL that originally ran.
-- constraints
-- dealflow:statement id=20260510014500.constraints.001 sha256=bd8efaed1ff1e772e3b95bf82d0b27d249f658370bd9d5034142026e9db87622
ALTER TABLE "public"."user_credit_ledger" DROP CONSTRAINT IF EXISTS "user_credit_ledger_balance_after_nonnegative";

-- dealflow:statement id=20260510014500.constraints.002 sha256=bc33cf89976edf4346636489b2616fd5a34c6ea429c65f5299fac0f0685de5dc
ALTER TABLE "public"."user_credits" DROP CONSTRAINT IF EXISTS "user_credits_balance_nonnegative";

DO $dealflow_postcondition_20260510014500$ BEGIN PERFORM 1; END $dealflow_postcondition_20260510014500$;
