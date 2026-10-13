import { notFound, redirect } from "next/navigation";
import { auth } from "../../../lib/auth";
import { db } from "../../../../../packages/db/src";
import { member, workspace } from "../../../../../packages/core/src/service";
import { Workspace } from "../../../components/workspace";
import type { WorkspaceData } from "../../../lib/demo";
export const dynamic = "force-dynamic";
export default async function ConnectedWorkspace({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { slug } = await params;
  const organization = await db.organization.findFirst({
    where: { slug, memberships: { some: { userId: session.user.id } } },
  });
  if (!organization) notFound();
  const actor = await member(session.user.id, organization.id);
  const data = await workspace(actor);
  return (
    <Workspace
      orgId={organization.id}
      initialData={JSON.parse(JSON.stringify(data)) as WorkspaceData}
    />
  );
}
