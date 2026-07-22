import { headers } from "next/headers";
import { GhlEmbedBootstrap } from "@/app/ghl/embed/ghl-embed-bootstrap";
import { getAllowedGhlParentOrigins } from "@/lib/white-label/ghl-embed-capability";

export const dynamic = "force-dynamic";

export default async function CrmEmbedPage() {
  const headerStore = await headers();
  const host = headerStore.get("x-dealflow-ghl-embed-host") ?? "";
  return <GhlEmbedBootstrap allowedParentOrigins={getAllowedGhlParentOrigins(host)} />;
}
