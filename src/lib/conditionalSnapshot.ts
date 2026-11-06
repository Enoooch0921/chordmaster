/** A version belongs to the payload actually accepted by this view, not to a request. */
export interface ConditionalSnapshot<T> {
  version: string | null;
  payload: T | null;
}

export const parseConditionalSnapshot = <T>(
  data: unknown,
  knownVersion: string | null,
  isPayload: (value: unknown) => value is T
): ConditionalSnapshot<T> => {
  if (!data || typeof data !== 'object') throw new Error('Invalid sync response.');
  const response = data as Record<string, unknown>;
  if (typeof response.version !== 'string' || !/^[a-f0-9]{64}$/.test(response.version)) {
    throw new Error('Invalid sync version.');
  }
  if (response.unchanged === true) {
    if (!knownVersion || response.version !== knownVersion) throw new Error('Missing sync baseline.');
    return { version: response.version, payload: null };
  }
  if (response.unchanged !== false || !isPayload(response.payload)) throw new Error('Invalid sync payload.');
  return { version: response.version, payload: response.payload };
};
