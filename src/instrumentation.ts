import { assertRequiredSchemaReady } from "@/lib/services/schema-validation-service";

export async function register() {
  if (
    process.env.NODE_ENV === "test" ||
    process.env.NEXT_PHASE === "phase-production-build"
  ) {
    return;
  }

  await assertRequiredSchemaReady({ context: "startup" });
}
