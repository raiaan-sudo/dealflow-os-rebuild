export const EXPECTED_HOSTED_SAFE_BROWSER_ORIGIN =
  "https://dealflow-os-rebuild-selfserve-clean.vercel.app";

export function assertExactHostedSafeBrowserOrigin(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Hosted safe-browser base URL is invalid");
  }
  if (
    url.origin !== EXPECTED_HOSTED_SAFE_BROWSER_ORIGIN ||
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error("Hosted safe-browser base URL is not the exact isolated staging origin");
  }
  return url;
}
