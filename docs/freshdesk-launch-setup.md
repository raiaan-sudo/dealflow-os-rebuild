# Freshdesk Launch Setup

DealFlow OS does not need a custom Freshdesk runtime integration for the launch build. Freshdesk owns email-to-ticket ingestion, so the production requirement is dashboard configuration:

1. Connect the active launch support email. Current launch proof uses `support@scaleholdings.freshdesk.com`; switch to `support@agentdealflow.io` after the branded mailbox is ready.
2. Verify forwarding from the domain mailbox to the Freshdesk forwarding address.
3. Create ticket categories:
   - Billing
   - Technical
   - Setup
4. Add one assignment rule that leaves uncategorized tickets visible in the default support queue.
5. Send one test email to the active support address and confirm a ticket is created.

Do not store Freshdesk mailbox credentials or API tokens in the app unless product support workflows later need ticket creation from inside DealFlow OS.
