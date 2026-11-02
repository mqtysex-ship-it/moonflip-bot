import crypto from 'node:crypto';

export function signSession(payload, secret) {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `mf1.${encoded}.${signature}`;
}

export function verifySession(token, secret, now = Date.now()) {
  if (typeof token !== 'string' || !token.startsWith('mf1.')) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [, encoded, signature] = parts;
  const expected = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  const actualBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (actualBytes.length !== expectedBytes.length || !crypto.timingSafeEqual(actualBytes, expectedBytes)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    const lifetime = 30 * 24 * 60 * 60 * 1000;
    if (!Number.isFinite(payload.t) || payload.t > now || now - payload.t >= lifetime) return null;
    return payload;
  }
  catch { return null; }
}
