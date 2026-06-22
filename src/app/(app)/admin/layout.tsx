import { notFound } from "next/navigation";
import { ApiError } from "@/lib/api/route";
import { assertInternalOperatorAccess } from "@/lib/services/internal-launch-monitor";

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  try {
    await assertInternalOperatorAccess();
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      notFound();
    }

    throw error;
  }

  return children;
}
