import { assertRequiredSchemaReady } from "@/lib/services/schema-validation-service";

export async function register() {
  if (process.env.NODE_ENV === "test") {
    return;
  }

  await assertRequiredSchemaReady({ context: "startup" });
}
