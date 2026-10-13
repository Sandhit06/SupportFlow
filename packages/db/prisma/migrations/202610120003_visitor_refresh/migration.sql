ALTER TABLE "VisitorSession" ADD COLUMN "refreshTokenHash" TEXT;
ALTER TABLE "VisitorSession" ADD COLUMN "installationId" UUID;
CREATE UNIQUE INDEX "VisitorSession_refreshTokenHash_key" ON "VisitorSession"("refreshTokenHash");
ALTER TABLE "VisitorSession" ADD CONSTRAINT "VisitorSession_installationId_fkey"
  FOREIGN KEY ("installationId") REFERENCES "WidgetInstallation"("id") ON DELETE CASCADE;
