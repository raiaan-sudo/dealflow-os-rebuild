import { notFound } from "next/navigation";

/**
 * The former multi-plan design preview exposed archived Starter/Growth states
 * through a public application route. DealFlow now has one acquisition plan,
 * so this internal design artifact is permanently unavailable at runtime.
 */
export default function UIDirectionPage() {
  notFound();
}
