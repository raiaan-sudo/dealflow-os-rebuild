type SignOutFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export async function requestConfirmedServerSignOut(
  fetcher: SignOutFetch = fetch,
): Promise<boolean> {
  try {
    const response = await fetcher("/api/auth/session", {
      method: "DELETE",
      credentials: "same-origin",
    });
    if (!response.ok) return false;

    const payload: unknown = await response.json();
    return (
      typeof payload === "object" &&
      payload !== null &&
      "success" in payload &&
      payload.success === true
    );
  } catch {
    return false;
  }
}
