export type AccessKeySuccessTruthState = {
  state: "verified_key_available" | "verified_key_unavailable" | "unverified";
  eyebrow: string;
  title: string;
  description: string;
  notice: string | null;
};

export function getAccessKeySuccessTruthState(params: {
  checkoutVerified: boolean;
  keyAvailable: boolean;
}): AccessKeySuccessTruthState {
  if (params.checkoutVerified && params.keyAvailable) {
    return {
      state: "verified_key_available",
      eyebrow: "Checkout verified",
      title: "Your access key is ready",
      description:
        "Use this key on the create account screen. Once claimed, it links this verified paid Stripe subscription to your DealFlow workspace.",
      notice: null,
    };
  }

  if (params.checkoutVerified) {
    return {
      state: "verified_key_unavailable",
      eyebrow: "Checkout verified",
      title: "Access key is not available in this browser",
      description:
        "The paid checkout is verified, but no key is available to reveal in this browser session. A prior delivery may already be complete, or another short reveal lease may still be active.",
      notice:
        "This checkout is verified, but DealFlow cannot reveal the key from this browser handoff. Return to checkout or use the original verified handoff.",
    };
  }

  return {
    state: "unverified",
    eyebrow: "Checkout not verified",
    title: "Access key is not ready",
    description:
      "This browser session does not have a verified paid checkout handoff. No key is available to reveal.",
    notice:
      "Checkout could not be verified for this browser session. Return to checkout or use the original verified handoff.",
  };
}
