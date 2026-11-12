import "server-only";
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { db } from "./db";

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, keylen: number) => Promise<Buffer>;

export const SESSION_COOKIE = "gm_session";
const SESSION_DAYS = 30;

export interface SessionUser {
  id: string;
  username: string;
}

// ---------- senhas (scrypt, com sal aleatório) ----------
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 64);
  return ["scrypt", salt.toString("base64"), hash.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, saltB64, hashB64] = stored.split("$");
  if (alg !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scryptAsync(password, Buffer.from(saltB64, "base64"), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// ---------- validação ----------
export function validateCredentials(username: unknown, password: unknown): string | null {
  if (typeof username !== "string" || !/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    return "O nome de usuário deve ter de 3 a 20 letras, números ou _.";
  }
  if (typeof password !== "string" || password.length < 6 || password.length > 100) {
    return "A senha deve ter pelo menos 6 caracteres.";
  }
  return null;
}

// ---------- sessões (token aleatório no cookie; no banco fica só o hash) ----------
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await db().session.create({ data: { tokenHash: sha256(token), userId, expiresAt } });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db().session.findUnique({
    where: { tokenHash: sha256(token) },
    select: { expiresAt: true, user: { select: { id: true, username: true } } },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return session.user;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db().session.deleteMany({ where: { tokenHash: sha256(token) } });
  jar.delete(SESSION_COOKIE);
}
