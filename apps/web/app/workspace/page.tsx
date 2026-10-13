import { redirect } from "next/navigation";
import { auth } from "../../lib/auth";
import { db } from "../../../../packages/db/src";
export const dynamic = "force-dynamic";
export default async function WorkspaceIndex() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const membership = await db.membership.findFirst({
    where: { userId: session.user.id },
    include: { organization: true },
  });
  redirect(
    membership ? `/workspace/${membership.organization.slug}` : "/onboarding",
  );
}
