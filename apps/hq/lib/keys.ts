/**
 * True when a keydown must be left to its target, so Board shortcuts don't hijack it: typing targets
 * own every key; a focused link/button owns only Enter and Space (activate), so j/k/Esc/1-4 keep
 * working after a nav click leaves focus on the link.
 */
export function ownsKeys(t: HTMLElement | null, key: string): boolean {
  if (!t) return false;
  if (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return true;
  return (key === "Enter" || key === " ") && !!t.closest("a,button,[role=button],summary");
}
