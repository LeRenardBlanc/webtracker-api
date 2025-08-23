import nacl from 'tweetnacl';
import { createHash } from 'crypto';

export function sha256Base16(input) {
  const h = createHash('sha256');
  h.update(input);
  return h.digest('hex');
}

export function b64ToUint8(b64) {
  return Uint8Array.from(Buffer.from(b64, 'base64'));
}

export function verifyEd25519Signature({ signBase, sigB64, pubkeyB64 }) {
  const sig = b64ToUint8(sigB64);
  const pub = b64ToUint8(pubkeyB64);
  const msg = new TextEncoder().encode(signBase);
  return nacl.sign.detached.verify(msg, sig, pub);
}
