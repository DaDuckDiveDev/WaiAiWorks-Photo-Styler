#!/usr/bin/env node
/**
 * Generate PBKDF2 hashes for STYLER_USERS so passwords never sit in plain text
 * in the Render dashboard or in an .env file.
 *
 *   npm run hash-password -- hardrock lulus kuhio
 *
 * Prints a ready-to-paste STYLER_USERS line with a freshly generated password
 * for each username. Copy the plaintext column to the people who need it, then
 * throw it away — the hash is all the app ever needs.
 *
 *   npm run hash-password -- --password 'my chosen password'
 *
 * Hashes one password you supply instead of generating any.
 */

import { pbkdf2 as pbkdf2Cb, randomBytes } from "node:crypto";
import { promisify } from "node:util";

const pbkdf2 = promisify(pbkdf2Cb);

const ITERATIONS = 210_000;
const KEY_BYTES = 32;
const SALT_BYTES = 16;

const b64url = (buf) => buf.toString("base64url");

async function hash(password) {
  const salt = randomBytes(SALT_BYTES);
  const derived = await pbkdf2(password, salt, ITERATIONS, KEY_BYTES, "sha256");
  return `pbkdf2$${ITERATIONS}$${b64url(salt)}$${b64url(derived)}`;
}

// Ambiguity-free alphabet: no O/0, l/1, I.
const ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generatePassword(length = 16) {
  const bytes = randomBytes(length * 2);
  let out = "";
  for (const byte of bytes) {
    if (out.length === length) break;
    // Reject above the largest clean multiple to keep the draw uniform.
    if (byte >= 256 - (256 % ALPHABET.length)) continue;
    out += ALPHABET[byte % ALPHABET.length];
  }
  return out.length === length ? out : generatePassword(length);
}

const args = process.argv.slice(2);

if (!args.length || args.includes("--help") || args.includes("-h")) {
  console.log(
    [
      "Usage:",
      "  npm run hash-password -- <username> [username...]",
      "  npm run hash-password -- --password '<password>'",
      "",
      "The first form invents a password per user and prints both the plaintext",
      "to hand out and the STYLER_USERS line to paste into Render.",
    ].join("\n")
  );
  process.exit(args.length ? 0 : 1);
}

if (args[0] === "--password") {
  const password = args[1];
  if (!password) {
    console.error("--password needs a value.");
    process.exit(1);
  }
  console.log(await hash(password));
  process.exit(0);
}

const rows = [];
for (const raw of args) {
  const username = raw.trim().toLowerCase();
  if (!username) continue;
  const password = generatePassword();
  rows.push({ username, password, hash: await hash(password) });
}

const width = Math.max(...rows.map((r) => r.username.length));

console.log("\nHand these out, then delete them:\n");
for (const row of rows) {
  console.log(`  ${row.username.padEnd(width)}  ${row.password}`);
}

console.log("\nPaste this into STYLER_USERS on Render:\n");
console.log(rows.map((r) => `${r.username}:${r.hash}`).join(","));
console.log("");
