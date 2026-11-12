/**
 * Client-Side End-to-End Encryption (ECDH P-256 key agreement + AES-256-GCM authenticated encryption)
 * Private keys stay exclusively inside local device storage and never leave the browser/device.
 */

const E2EE_STORAGE_KEY = "chitchat_e2ee_keypair_v1";
const E2EE_CHATS_KEY = "chitchat_e2ee_enabled_chats";
export const E2EE_PREFIX = "::e2ee:v1::";

const getSubtle = () => {
  const c = typeof globalThis !== "undefined" ? globalThis.crypto : null;
  if (!c?.subtle) throw new Error("WebCrypto SubtleCrypto is unavailable in this context.");
  return c;
};

const toBase64 = (buf) => {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
};

const fromBase64 = (b64) => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
};

export async function computeKeyFingerprint(publicJwk) {
  const { subtle } = getSubtle();
  const canonical = JSON.stringify({ crv: publicJwk.crv, kty: publicJwk.kty, x: publicJwk.x, y: publicJwk.y });
  const hash = await subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  const hex = Array.from(new Uint8Array(hash))
    .slice(0, 12)
    .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
    .join("");
  return hex.match(/.{1,4}/g).join(":");
}

export async function generateIdentityKeyPair() {
  const { subtle } = getSubtle();
  const pair = await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey"]);
  const publicJwk = await subtle.exportKey("jwk", pair.publicKey);
  const privateJwk = await subtle.exportKey("jwk", pair.privateKey);
  const fingerprint = await computeKeyFingerprint(publicJwk);
  return { publicJwk, privateJwk, fingerprint };
}

export function getStoredKeyPair() {
  try {
    const raw = localStorage.getItem(E2EE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function ensureLocalIdentityKeyPair() {
  const existing = getStoredKeyPair();
  if (existing?.publicJwk && existing?.privateJwk) return existing;
  const fresh = await generateIdentityKeyPair();
  try {
    localStorage.setItem(E2EE_STORAGE_KEY, JSON.stringify(fresh));
  } catch {
    // ignore storage quota
  }
  return fresh;
}

export async function rotateLocalIdentityKeyPair() {
  const fresh = await generateIdentityKeyPair();
  try {
    localStorage.setItem(E2EE_STORAGE_KEY, JSON.stringify(fresh));
  } catch {
    // ignore
  }
  return fresh;
}

export function isChatE2eeEnabled(chatId) {
  if (!chatId) return false;
  try {
    const map = JSON.parse(localStorage.getItem(E2EE_CHATS_KEY) || "{}");
    return Boolean(map[String(chatId)]);
  } catch {
    return false;
  }
}

export function setChatE2eeEnabled(chatId, enabled) {
  if (!chatId) return;
  try {
    const map = JSON.parse(localStorage.getItem(E2EE_CHATS_KEY) || "{}");
    map[String(chatId)] = Boolean(enabled);
    localStorage.setItem(E2EE_CHATS_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

async function deriveSharedAesKey(privateJwk, peerPublicJwk) {
  const { subtle } = getSubtle();
  const privKey = await subtle.importKey("jwk", privateJwk, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveKey"]);
  const pubKey = await subtle.importKey("jwk", peerPublicJwk, { name: "ECDH", namedCurve: "P-256" }, false, []);
  return subtle.deriveKey(
    { name: "ECDH", public: pubKey },
    privKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypts plaintext for a target user's ECDH P-256 public JWK, also wrapping for sender self-decryption
 * so the sender can still read their own sent messages in history.
 */
export async function encryptE2eeMessage(plaintext, myKeyPair, peerPublicJwk) {
  const cryptoApi = getSubtle();
  const ivPeer = cryptoApi.getRandomValues(new Uint8Array(12));
  const ivSelf = cryptoApi.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);

  const peerKey = await deriveSharedAesKey(myKeyPair.privateJwk, peerPublicJwk);
  const selfKey = await deriveSharedAesKey(myKeyPair.privateJwk, myKeyPair.publicJwk);

  const ctPeer = await cryptoApi.subtle.encrypt({ name: "AES-GCM", iv: ivPeer }, peerKey, encoded);
  const ctSelf = await cryptoApi.subtle.encrypt({ name: "AES-GCM", iv: ivSelf }, selfKey, encoded);

  const envelope = {
    v: 1,
    alg: "ECDH-P256+AES-GCM",
    senderPub: {
      kty: "EC",
      crv: "P-256",
      x: myKeyPair.publicJwk.x,
      y: myKeyPair.publicJwk.y,
    },
    iv: toBase64(ivPeer),
    ct: toBase64(ctPeer),
    selfIv: toBase64(ivSelf),
    selfCt: toBase64(ctSelf),
  };

  return E2EE_PREFIX + btoa(JSON.stringify(envelope));
}

export function isE2eePayload(content) {
  return typeof content === "string" && content.startsWith(E2EE_PREFIX);
}

export async function decryptE2eeMessage(payload, myKeyPair, isMine = false) {
  if (!isE2eePayload(payload)) return { encrypted: false, text: payload };
  if (!myKeyPair?.privateJwk) {
    return { encrypted: true, failed: true, text: "🔒 End-to-End Encrypted (no device key found)" };
  }
  try {
    const envelope = JSON.parse(atob(payload.slice(E2EE_PREFIX.length)));
    const { subtle } = getSubtle();
    const useSelf = isMine && envelope.selfCt && envelope.selfIv;
    const peerPub = useSelf ? myKeyPair.publicJwk : envelope.senderPub;
    const aesKey = await deriveSharedAesKey(myKeyPair.privateJwk, peerPub);
    const plainBuf = await subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(useSelf ? envelope.selfIv : envelope.iv) },
      aesKey,
      fromBase64(useSelf ? envelope.selfCt : envelope.ct)
    );
    return { encrypted: true, failed: false, text: new TextDecoder().decode(plainBuf) };
  } catch {
    return { encrypted: true, failed: true, text: "🔒 Encrypted on another key/device" };
  }
}

export async function exportEncryptedKeyBackup(keyPair, passphrase) {
  const cryptoApi = getSubtle();
  const salt = cryptoApi.getRandomValues(new Uint8Array(16));
  const iv = cryptoApi.getRandomValues(new Uint8Array(12));
  const baseKey = await cryptoApi.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  const aesKey = await cryptoApi.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );
  const ct = await cryptoApi.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    new TextEncoder().encode(JSON.stringify(keyPair))
  );
  return JSON.stringify({ v: 1, salt: toBase64(salt), iv: toBase64(iv), ct: toBase64(ct) });
}

export async function importEncryptedKeyBackup(backupJson, passphrase) {
  const cryptoApi = getSubtle();
  const parsed = JSON.parse(backupJson);
  const baseKey = await cryptoApi.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  const aesKey = await cryptoApi.subtle.deriveKey(
    { name: "PBKDF2", salt: fromBase64(parsed.salt), iterations: 100000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
  const plain = await cryptoApi.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(parsed.iv) }, aesKey, fromBase64(parsed.ct));
  const keyPair = JSON.parse(new TextDecoder().decode(plain));
  localStorage.setItem(E2EE_STORAGE_KEY, JSON.stringify(keyPair));
  return keyPair;
}

