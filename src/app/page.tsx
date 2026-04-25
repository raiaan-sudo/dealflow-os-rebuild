import { redirect } from "next/navigation";
import { isAuthBypassEnabled } from "@/lib/env";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

export default async function HomePage() {
  if (isAuthBypassEnabled()) {
    redirect("/dashboard");
  }

  const supabase = await createRouteHandlerClient();

  if (!supabase) {
    redirect("/login");
  }

  const user = await withTimeout(
    supabase.auth.getUser().then((result) => result.data.user).catch(() => null),
    2_500,
    null,
  );

  redirect(user ? "/dashboard" : "/login");
}
