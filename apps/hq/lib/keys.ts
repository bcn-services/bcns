/** True when a keydown target handles its own keys (typing, or activating a link/button), so Board shortcuts must leave it alone. */
export function ownsKeys(t: HTMLElement | null): boolean {
  return !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || !!t.closest("a,button,[role=button],summary"));
}
