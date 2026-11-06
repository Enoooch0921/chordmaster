/** Call only after resolving the current, authorized resource. Never caches access checks. */
export const conditionalPayload = async (
  payload: unknown,
  knownVersion: unknown
) => {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const version = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  return version === knownVersion
    ? { version, unchanged: true as const }
    : { version, unchanged: false as const, payload };
};
