export function secureCookieOverrideForUrl(
  configuredUrl: string | undefined,
): boolean | undefined {
  if (!configuredUrl) return undefined;
  try {
    return new URL(configuredUrl).protocol === "https:";
  } catch {
    return undefined;
  }
}
