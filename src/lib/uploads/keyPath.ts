/**
 * Path-traversal guard for object storage keys.
 *
 * Upload keys embed the client's file name (`uploads/<ms>-<id>-<name>`), and
 * names like `logo..png` or `tricou_L....png` are common, so a substring
 * `key.includes("..")` check wrongly rejects them. Only a whole path segment
 * equal to `.` or `..` (split on `/` and `\`) is traversal.
 */
export function hasDotSegment(key: string): boolean {
  return key.split(/[/\\]/).some((s) => s === "." || s === "..");
}

/**
 * True when a storage key cannot escape its prefix: no `.` / `..` segment, no
 * backslash, no control characters.
 */
export function isSafeKeyPath(key: string): boolean {
  return !hasDotSegment(key) && !key.includes("\\") && !/[\u0000-\u001f\u007f]/.test(key);
}
