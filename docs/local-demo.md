# Local fictional accounts

Run `pnpm db:seed` only against a local database. The seed reads `DEMO_PASSWORD`
from your local environment and hashes it with Argon2. The `.env.example` password
is public test data, never a deployment secret.

| Organization | Owner | Agent | Viewer |
|---|---|---|---|
| Acme Bikes | owner@acme-bikes.test | agent@acme-bikes.test | viewer@acme-bikes.test |
| Northstar Gadgets | owner@northstar-gadgets.test | agent@northstar-gadgets.test | viewer@northstar-gadgets.test |

Each organization seeds 20 conversations, 100 messages, 8 tickets, 10 articles,
and intentionally overlapping order numbers. Seeds are repeatable and do not
overwrite existing workspace conversations or rotate passwords.

New anonymous visitors do not own preseeded orders. They must be refused access
to those orders. Integration tests create authorized visitor fixtures to exercise
verified order lookup. A secure demo-order provisioning flow remains to be built.
