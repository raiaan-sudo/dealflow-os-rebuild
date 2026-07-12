# Provider acceptance boundaries

This candidate separates configuration, isolated test execution, and live provider acceptance. Configuration alone is never reported as a connected provider.

## Deployment target

`DEALFLOW_DEPLOYMENT_TARGET` is the explicit execution authority. Valid values are `production`, `staging`, `preview`, `development`, and `test`. A `NODE_ENV=production` build without an explicit target is `unknown`: it is neither proof of production nor authority to enable a test harness.

## Noncommunication and no-spend defaults

- Provider loopback transports require `ALLOW_PROVIDER_LOOPBACK_TEST_TRANSPORT=true` and an explicit nonproduction target. Only localhost, `127.0.0.1`, and `::1` are accepted.
- OpenAI, HeyGen, ElevenLabs, and Twilio reject arbitrary provider origins. Official execution uses only each provider's official HTTPS origin.
- Stripe test acceptance uses only test keys, a QA organization allowlist, test-mode object assertions, a locally signed webhook proof, and deterministic cleanup.
- Twilio mock mode is hard-blocked on the production target. Test and loopback modes use separate test credentials and one exact allowlisted recipient.
- ElevenLabs execution is disabled unless `ALLOW_ELEVENLABS_VOICE_GENERATION=true`.
- Direct creative-builder paths cannot call a paid provider without the canonical durable provider-usage reservation workflow.

## Support destination

`internal_operator_inbox` is an internal-only database receipt, not an email or help-desk delivery. `staging_sink` is a noncommunication test adapter and requires `SUPPORT_STAGING_SINK_ENABLED=true` on an explicit nonproduction target. `external` intentionally fails closed with `support_external_destination_owner_blocked` until the owner selects the canonical mailbox or ticket system and separately authorizes communication acceptance.

No provider call, communication, billing action, deployment, or production mutation is authorized by these controls.
