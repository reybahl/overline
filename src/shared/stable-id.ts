/**
 * Heuristic for whether an element `id` is stable enough to target across page
 * loads/renders. Framework-generated ids (React `useId`, React Aria, Radix,
 * Headless UI, …) change on every render, so a selector built from them is dead
 * on replay — we must fall back to text/aria/href instead.
 */
const UNSTABLE_ID_PATTERNS: readonly RegExp[] = [
  /^:r[a-z0-9]+:$/i, // React 18 useId / MUI (colon form)
  /^_r_[a-z0-9]/i, // React useId with colons sanitized to underscores
  /^react-aria/i, // React Aria
  /^radix-/i, // Radix UI
  /^headlessui-/i, // Headless UI
  /^[a-f0-9-]{20,}$/i, // hex blobs / uuids
];

export function isStableId(id: string): boolean {
  if (!id) {
    return false;
  }

  return !UNSTABLE_ID_PATTERNS.some((pattern) => pattern.test(id));
}
