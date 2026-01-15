import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'crypto';

type ReceiptPayload = {
  v: number;
  license_id: string;
  project_id: string;
  activation_id: string;
  device_id_hash: string;
  plan: string;
  max_activations: number;
  issued_at: string;
  expires_at: string | null;
  grace_period_days: number;
};

const base64Url = (value: Buffer): string =>
  value
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

const fromBase64Url = (value: string): Buffer => {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(value.length + (4 - (value.length % 4 || 4)) % 4, '=');
  return Buffer.from(padded, 'base64');
};

const loadKeyPair = () => {
  const envKey = process.env.RECEIPT_PRIVATE_KEY;
  if (envKey) {
    const normalizedKey = envKey.includes('\\n') ? envKey.replace(/\\n/g, '\n') : envKey;
    const privateKey = normalizedKey.includes('BEGIN')
      ? createPrivateKey(normalizedKey)
      : createPrivateKey({ key: Buffer.from(envKey, 'base64'), format: 'der', type: 'pkcs8' });
    return {
      privateKey,
      publicKey: createPublicKey(privateKey),
    };
  }
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return { privateKey, publicKey };
};

const keyPair = loadKeyPair();

export const createReceipt = (payload: ReceiptPayload): string => {
  const payloadJson = JSON.stringify(payload);
  const payloadB64 = base64Url(Buffer.from(payloadJson, 'utf-8'));
  const signature = sign(null, Buffer.from(payloadB64, 'utf-8'), keyPair.privateKey);
  const signatureB64 = base64Url(signature);
  return `v1.${payloadB64}.${signatureB64}`;
};

export const verifyReceipt = (token: string): { valid: boolean; payload?: ReceiptPayload } => {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') {
    return { valid: false };
  }
  const payloadB64 = parts[1];
  const signature = fromBase64Url(parts[2]);
  const ok = verify(null, Buffer.from(payloadB64, 'utf-8'), keyPair.publicKey, signature);
  if (!ok) {
    return { valid: false };
  }
  try {
    const payloadJson = fromBase64Url(payloadB64).toString('utf-8');
    const payload = JSON.parse(payloadJson) as ReceiptPayload;
    return { valid: true, payload };
  } catch {
    return { valid: false };
  }
};
