"use client";

import { OWNERS, type Owner } from "@/lib/tasks";

/**
 * Owner checkboxes, all named "owner": read them with `FormData.getAll("owner")` or `onChange`.
 * None checked = unassigned.
 */
export function OwnerChecks(props: {
  defaultValue?: readonly Owner[];
  disabled?: boolean;
  label?: string;
  onChange?: (owners: Owner[]) => void;
}) {
  const { defaultValue = [], disabled, label = "Owners", onChange } = props;
  return (
    <span
      className="oc"
      role="group"
      aria-label={label}
      title="None ticked = Unassigned"
      onClick={(e) => e.stopPropagation()}
      onChange={(e) =>
        onChange?.(
          OWNERS.filter(
            (o) => e.currentTarget.querySelector<HTMLInputElement>(`input[value=${o}]`)?.checked
          )
        )
      }
    >
      {OWNERS.map((o) => (
        <label key={o}>
          <input
            type="checkbox"
            name="owner"
            value={o}
            defaultChecked={defaultValue.includes(o)}
            disabled={disabled}
          />
          {o.charAt(0).toUpperCase() + o.slice(1)}
        </label>
      ))}
    </span>
  );
}
