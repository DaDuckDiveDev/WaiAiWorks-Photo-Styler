/**
 * Session auth.
 *
 * The studio uses one shared account. Its password is stored as a PBKDF2 hash.
 * Legacy STYLER_USERS settings are intentionally ignored.
 *
 * Sessions are stateless: a signed, expiring cookie carrying only the
 * username. Everything here uses Web Crypto so the module loads in both the
 * Node and Edge runtimes — middleware needs the Edge one.
 */

export const SESSION_COOKIE = "kaiel_styler_session";
export const SESSION_MAX_AGE = 60 * 60 * 12; // 12 hours

type SessionPayload = { u: string; exp: number };

// The explicit ArrayBuffer type argument keeps Web Crypto's BufferSource happy
// across the DOM lib versions Next ships with.
function textToBytes(value: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(value) as Uint8Array<ArrayBuffer>;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "SESSION_SECRET is missing or too short. Set a random 32+ character value."
    );
  }
  return secret;
}

async function sign(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    textToBytes(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, textToBytes(data));
  return bytesToBase64Url(new Uint8Array(signature));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** The only account allowed to sign in. */
export function getUsers(): Map<string, string> {
  return new Map([
    ["general", "pbkdf2$210000$wdSMu5GASiWLh0VlxE1iFg$fgmx6XRqOuE4jlvq5ahcbWnlK3YOTnzevW5cowIhsi0"],
  ]);
}

/* -------------------------------------------------------------------------- */
/* password verification                                                       */
/* -------------------------------------------------------------------------- */

export const PBKDF2_PREFIX = "pbkdf2$";
export const PBKDF2_ITERATIONS = 210_000; // OWASP 2023 guidance for SHA-256
const PBKDF2_KEY_BITS = 256;

export async function pbkdf2(
  password: string,
  salt: Uint8Array,
  iterations: number
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    textToBytes(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as Uint8Array<ArrayBuffer>, iterations, hash: "SHA-256" },
    key,
    PBKDF2_KEY_BITS
  );
  return new Uint8Array(bits);
}

/** `pbkdf2$<iterations>$<salt>$<hash>`, both parts base64url. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derived = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return [
    "pbkdf2",
    PBKDF2_ITERATIONS,
    bytesToBase64Url(salt),
    bytesToBase64Url(derived),
  ].join("$");
}

/**
 * Compare a submitted password against a stored secret. Runs the hash path if
 * the secret looks like one, otherwise falls back to a constant-time plaintext
 * compare so existing STYLER_USERS values keep working.
 */
export async function verifyPassword(
  stored: string,
  submitted: string
): Promise<boolean> {
  if (!stored.startsWith(PBKDF2_PREFIX)) {
    return timingSafeEqual(stored, submitted);
  }
  const [, iterationsRaw, saltRaw, hashRaw] = stored.split("$");
  const iterations = Number(iterationsRaw);
  if (!Number.isFinite(iterations) || iterations < 1 || !saltRaw || !hashRaw) {
    return false;
  }
  try {
    const derived = await pbkdf2(submitted, base64UrlToBytes(saltRaw), iterations);
    return timingSafeEqual(bytesToBase64Url(derived), hashRaw);
  } catch {
    return false;
  }
}

/** Returns the canonical username on success, or null. */
export async function authenticate(
  username: string,
  password: string
): Promise<string | null> {
  const users = getUsers();
  const key = username.trim().toLowerCase();
  const expected = users.get(key);
  // Burn a comparable amount of time on unknown usernames so response timing
  // doesn't reveal which accounts exist.
  if (!expected) {
    await pbkdf2(password, new Uint8Array(16), PBKDF2_ITERATIONS);
    return null;
  }
  if (!(await verifyPassword(expected, password))) return null;
  return key;
}

/** The one account allowed to see /admin/stats. */
export function isAdmin(username: string | null): boolean {
  if (!username) return false;
  const admins = (process.env.STYLER_ADMINS ?? "admin")
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(username.toLowerCase());
}

export async function createSession(username: string): Promise<string> {
  const payload: SessionPayload = {
    u: username,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
  };
  const body = bytesToBase64Url(textToBytes(JSON.stringify(payload)));
  const signature = await sign(body);
  return `${body}.${signature}`;
}

/** Returns the username if the token is valid and unexpired, else null. */
export async function verifySession(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  let expectedSignature: string;
  try {
    expectedSignature = await sign(body);
  } catch {
    return null;
  }
  if (!timingSafeEqual(expectedSignature, signature)) return null;

  try {
    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlToBytes(body))
    ) as SessionPayload;
    if (!payload.u || typeof payload.exp !== "number") return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (!getUsers().has(payload.u)) return null;
    return payload.u;
  } catch {
    return null;
  }
}
