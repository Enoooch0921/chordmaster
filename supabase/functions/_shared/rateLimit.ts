// @ts-nocheck

const encoder = new TextEncoder();

const hashSubject = async (value: string) => {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

const getClientAddress = (request: Request) => (
  request.headers.get('x-real-ip')?.trim()
  || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  || 'unknown'
);

export const consumeRequestLimit = async (
  adminSupabase,
  request: Request,
  bucket: string,
  maxRequests: number,
  windowSeconds = 60,
  subject?: string
) => {
  const subjectHash = await hashSubject(`${bucket}:${subject ?? getClientAddress(request)}`);
  const { data, error } = await adminSupabase.rpc('consume_edge_rate_limit', {
    p_bucket: bucket,
    p_subject_hash: subjectHash,
    p_max_requests: maxRequests,
    p_window_seconds: windowSeconds
  });

  if (error) {
    console.error('Rate limit check failed', { bucket, code: error.code });
    throw new Error('Rate limit check failed.');
  }

  return data === true;
};
