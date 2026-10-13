ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_assigned_member_fkey"
  FOREIGN KEY ("organizationId", "assignedUserId") REFERENCES "Membership"("organizationId", "userId");
ALTER TABLE "ActionProposal" ADD CONSTRAINT "proposal_positive_amount" CHECK ("amountCents" > 0);
ALTER TABLE "ExternalOrder" ADD CONSTRAINT "order_positive_amount" CHECK ("amountCents" > 0);
ALTER TABLE "Organization" ADD CONSTRAINT "retention_bounded" CHECK ("retentionDays" BETWEEN 1 AND 3650);
CREATE INDEX "KnowledgeArticle_search_idx" ON "KnowledgeArticle"
  USING GIN (to_tsvector('english', title || ' ' || body)) WHERE published = true;
