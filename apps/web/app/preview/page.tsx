import { Workspace } from "../../components/workspace";
import { createDemo } from "../../lib/demo";
export const dynamic = "force-dynamic";
export default function Preview() {
  return <Workspace preview initialData={createDemo()} />;
}
