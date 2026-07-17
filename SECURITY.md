# DealFlow security policy

## Supported release

Only the exact production deployment identified by the current signed DealFlow
release seal is supported. Source presence, a preview deployment, or a branch
name is not proof that a release is supported.

## Reporting a vulnerability

Do not open a public issue containing a vulnerability, credential, token,
customer record, provider identifier, or exploit detail. Use the private
security-reporting channel configured on the authoritative repository. If that
channel is unavailable, stop and contact the repository owner through an
already verified private channel; do not guess an email address.

Include the affected route or component, impact, minimal reproduction, and the
exact observed deployment identity. Never include real customer data or live
credentials.

## Response and disclosure

Receipt, severity, remediation, disclosure timing, and any customer or provider
communication require the assigned security owner. The application and its
automation must fail closed when that owner or channel is not configured.
