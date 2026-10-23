import { createServerSupabase } from "@bcn-services/tenant";
import { switchWorkspace } from "./staff-actions";
import { StaffSelect } from "./staff-select";

type Workspace = { slug: string; name: string; current: boolean };

/** Workspace dropdown for staff. `api.staff_workspaces` is [] for everyone else, so nothing renders. */
export async function StaffSwitcher() {
  const supabase = createServerSupabase();
  if (!supabase) return null;
  const { data } = await supabase.schema("api").rpc("staff_workspaces");
  const workspaces = Array.isArray(data) ? (data as Workspace[]) : []; // jsonb array from our own RPC
  if (workspaces.length === 0) return null;
  return (
    <form action={switchWorkspace}>
      <StaffSelect current={workspaces.find((w) => w.current)?.slug ?? ""} workspaces={workspaces} />
    </form>
  );
}
