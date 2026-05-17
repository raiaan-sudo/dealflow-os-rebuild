const DEFAULT_OPERATOR_PAGE_TIMEOUT_MS = 6500;

export type OperatorPageSection<T> = {
  data: T;
  degraded: boolean;
  reason: string | null;
};

export async function loadOperatorPageSection<T>(
  label: string,
  loader: () => Promise<T>,
  fallback: T,
  timeoutMs = DEFAULT_OPERATOR_PAGE_TIMEOUT_MS,
): Promise<OperatorPageSection<T>> {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      loader().then((data) => ({
        data,
        degraded: false,
        reason: null,
      })),
      new Promise<OperatorPageSection<T>>((resolve) => {
        timeout = setTimeout(() => {
          resolve({
            data: fallback,
            degraded: true,
            reason: `${label} did not respond before the operator page timeout.`,
          });
        }, timeoutMs);
      }),
    ]);
  } catch {
    return {
      data: fallback,
      degraded: true,
      reason: `${label} is temporarily unavailable.`,
    };
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}
