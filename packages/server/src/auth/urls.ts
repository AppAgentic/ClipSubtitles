import { hmacSign, hmacVerify } from './tokens';

export type SignedKind = 'asset' | 'export' | 'upload';

export interface SignedUrlInput {
  secret: string;
  apiPublicUrl: string;
  kind: SignedKind;
  id: string;
  workspaceId: string;
  /** Unix seconds. */
  expiresAt: number;
}

function payload(kind: SignedKind, id: string, workspaceId: string, exp: number): string {
  return `${kind}:${id}:${workspaceId}:${exp}`;
}

/** Short-lived HMAC-signed URL. Persistent asset identity stays server-side. */
export function signContentUrl(input: SignedUrlInput): string {
  const sig = hmacSign(input.secret, payload(input.kind, input.id, input.workspaceId, input.expiresAt));
  const base = input.kind === 'upload' ? `${input.apiPublicUrl}/v1/uploads/${input.id}` : `${input.apiPublicUrl}/v1/${input.kind}s/${input.id}/content`;
  return `${base}?exp=${input.expiresAt}&ws=${encodeURIComponent(input.workspaceId)}&sig=${sig}`;
}

export function verifyContentSignature(input: {
  secret: string;
  kind: SignedKind;
  id: string;
  workspaceId: string;
  expiresAt: number;
  signature: string;
  nowSeconds: number;
}): boolean {
  if (!Number.isFinite(input.expiresAt) || input.expiresAt < input.nowSeconds) return false;
  if (!input.signature || input.signature.length > 128) return false;
  return hmacVerify(input.secret, payload(input.kind, input.id, input.workspaceId, input.expiresAt), input.signature);
}
