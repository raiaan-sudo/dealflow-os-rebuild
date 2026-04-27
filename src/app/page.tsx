import { redirect } from "next/navigation";
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

function getSafeRedirectPath(value?: string | null) {
  if (!value) {
    return "/dashboard";
  }

  if (!value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }

  return value;
}

export default async function HomePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createRouteHandlerClient();
  const params = searchParams ? await searchParams : {};
  const nextPath =
    typeof params.next === "string" ? getSafeRedirectPath(params.next) : "/dashboard";

  if (!supabase) {
    redirect("/login");
  }

  const user = await withTimeout(
    supabase.auth.getUser().then((result) => result.data.user).catch(() => null),
    2_500,
    null,
  );

  redirect(user ? nextPath : "/login");
}
