import { headers } from "next/headers";
import { GhlEmbedBootstrap } from "./ghl-embed-bootstrap";
import { getAllowedGhlParentOrigins } from "@/lib/white-label/ghl-embed-capability";

export const dynamic = "force-dynamic";

export default async function GhlEmbedPage() {
  const headerStore = await headers();
  const host = headerStore.get("x-dealflow-verified-partner-domain") ?? "";
  return <GhlEmbedBootstrap allowedParentOrigins={getAllowedGhlParentOrigins(host)} />;
}
