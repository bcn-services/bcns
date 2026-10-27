// Fires = things that need Nate now, merged from independent sources so items 4 and 6 own disjoint files.
export type Fire = {
  key: string; // stable id, e.g. "ops:connector:<tenant>:<source>" or "task:<id>"
  kind: "connector" | "job" | "ticket" | "task" | "ops";
  title: string;
  detail?: string;
  href?: string;
  severity: "urgent" | "warn";
};

import { taskFires } from "./fires-tasks";
import { opsFires } from "./fires-ops";

export async function getFires(): Promise<Fire[]> {
  const parts = await Promise.allSettled([taskFires(), opsFires()]);
  return parts.flatMap((p) => (p.status === "fulfilled" ? p.value : []));
}
