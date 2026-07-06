export function cn(
  ...parts: Array<string | false | null | undefined | ((...args: never) => string | undefined)>
): string {
  return parts
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join(" ");
}
