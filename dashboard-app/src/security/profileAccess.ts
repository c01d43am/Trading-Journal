import type { AccessMethod } from "../types";

const ITERATIONS = 600_000;

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

export function accessCodeError(method: AccessMethod, code: string) {
  if (method === "pin") return /^\d{6,12}$/.test(code) ? "" : "Use a PIN with 6–12 digits.";
  if (method === "passcode") return code.length >= 6 && code.length <= 64 ? "" : "Use a passcode with 6–64 characters.";
  return code.length >= 8 && code.length <= 128 ? "" : "Use a password with 8–128 characters.";
}

async function deriveHash(code: string, salt: Uint8Array) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(code), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS },
    key,
    256,
  );
  return toBase64(new Uint8Array(bits));
}

export async function hashAccessCode(code: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return {
    accessSalt: toBase64(salt),
    accessHash: await deriveHash(code, salt),
  };
}

export async function verifyAccessCode(code: string, salt: string, expectedHash: string) {
  const actual = await deriveHash(code, fromBase64(salt));
  if (actual.length !== expectedHash.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) {
    difference |= actual.charCodeAt(index) ^ expectedHash.charCodeAt(index);
  }
  return difference === 0;
}
