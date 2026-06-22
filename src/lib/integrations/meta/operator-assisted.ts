export const META_OPERATOR_ASSISTED_MODE_LABEL = "Operator-assisted beta";

export const META_OPERATOR_ASSISTED_NOTICE =
  "Meta connection is currently operator-assisted. Please confirm you've been added to the Meta app before connecting.";

export const META_OPERATOR_ASSISTED_ADMIN_CHECKLIST =
  "Add customer to Meta app role before Meta connect.";

export const META_OPERATOR_ASSISTED_PUBLIC_SELF_SERVE_BLOCKER =
  "Public self-serve Meta launch remains blocked until Meta app review and business verification are complete.";

export const META_OPERATOR_ASSISTED_REQUIRED_FAILURE_CODES = [
  "meta_app_role_required",
  "app_not_live",
  "business_verification_required",
  "oauth_access_denied",
  "token_missing",
  "token_expired",
  "page_permission_missing",
  "ad_account_permission_missing",
] as const;

export type MetaOperatorAssistedFailureCode =
  (typeof META_OPERATOR_ASSISTED_REQUIRED_FAILURE_CODES)[number];
