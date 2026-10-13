# Deployment status

Local container topology is defined in docker-compose.yml. No public deployment
was attempted. The production image and complete local Compose startup were
verified on Windows with Docker Desktop; connected browser tests passed against
the containers. The same image is shared by the web, gateway, worker, and migration
services. Environment files are excluded from the image and injected at runtime.
Before deploying, complete the remaining security/quality items in
README.md and docs/threat-model.md, validate the Compose startup on a clean host,
and use external secrets, HTTPS/WSS and restricted network access to data stores.

Build the Next frontend for its actual gateway URL using NEXT_PUBLIC_REALTIME_URL.
Update CSP connect-src and exact widget origins for that environment. Do not deploy
the persistent gateway or worker as serverless request handlers. Disable seeding
in deployment pipelines and remove local demo accounts.
