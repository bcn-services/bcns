"use client";

/** Submits its form on change; the server action does the switch. */
export function StaffSelect({ current, workspaces }: { current: string; workspaces: { slug: string; name: string }[] }) {
  return (
    <select
      name="slug"
      defaultValue={current}
      aria-label="Workspace"
      className="btn btn-out btn-sm"
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
    >
      {workspaces.map((w) => (
        <option key={w.slug} value={w.slug}>
          {w.name}
        </option>
      ))}
    </select>
  );
}
