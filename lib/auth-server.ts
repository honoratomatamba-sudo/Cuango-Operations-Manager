import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { PublicUser, UserRole } from './auth-types';
import { getSupabaseServerClient, isMissingSchemaError } from './supabase-server';

export const SESSION_COOKIE_NAME = 'cuango_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 dias
const FALLBACK_USERS_FILE = path.join(os.tmpdir(), 'cuango_fleet_users_v1.json');

interface InternalUserRow {
  id: string;
  username: string;
  full_name: string;
  email: string;
  role: UserRole;
  password_hash: string;
  active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

interface SessionPayload {
  uid: string;
  username: string;
  role: UserRole;
  exp: number;
}

function getSessionSecret(): string {
  const envSecret = process.env.AUTH_SESSION_SECRET?.trim();
  if (envSecret && envSecret.length >= 16) return envSecret;
  const seed =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    'cuango-fleet-bi-default-session-hmac-seed-2026';
  return crypto.createHash('sha256').update(seed).digest('hex');
}

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidUsername(username: string): boolean {
  return /^[a-z0-9._-]{3,40}$/.test(username);
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;
  const actualBuf = crypto.scryptSync(password, salt, 64);
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  if (actualBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(actualBuf, expectedBuf);
}

export function createSessionToken(user: PublicUser): string {
  const payload: SessionPayload = {
    uid: user.id,
    username: user.username,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  try {
    const dotIdx = token.indexOf('.');
    if (dotIdx <= 0) return null;
    const encoded = token.slice(0, dotIdx);
    const sig = token.slice(dotIdx + 1);
    if (!encoded || !sig) return null;

    const expectedSig = crypto
      .createHmac('sha256', getSessionSecret())
      .update(encoded)
      .digest('base64url');

    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedBuf.length) return null;
    if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

    const decoded = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8')
    ) as SessionPayload;

    if (!decoded.uid || !decoded.exp || decoded.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

export function getSessionTokenFromRequest(req: NextRequest): string | null {
  const cookieToken = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (cookieToken) return cookieToken;

  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) return bearer;
  }
  return null;
}

export function attachSessionCookie(
  res: NextResponse,
  req: NextRequest,
  token: string
): void {
  const proto = req.headers.get('x-forwarded-proto') || '';
  const isHttps = proto.includes('https') || req.nextUrl.protocol === 'https:';
  res.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
    sameSite: isHttps ? 'none' : 'lax',
    secure: isHttps,
  });
}

export function clearSessionCookie(res: NextResponse, req: NextRequest): void {
  const proto = req.headers.get('x-forwarded-proto') || '';
  const isHttps = proto.includes('https') || req.nextUrl.protocol === 'https:';
  res.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    path: '/',
    maxAge: 0,
    sameSite: isHttps ? 'none' : 'lax',
    secure: isHttps,
  });
}

function toPublicUser(row: InternalUserRow): PublicUser {
  return {
    id: row.id,
    username: row.username,
    fullName: row.full_name,
    email: row.email || '',
    role: row.role,
    active: Boolean(row.active),
    lastLoginAt: row.last_login_at ?? null,
    createdAt: row.created_at,
  };
}

// Local fallback storage used only while `cuango_users` table has not yet been created in Supabase
function readFallbackUsers(): InternalUserRow[] {
  try {
    if (!fs.existsSync(FALLBACK_USERS_FILE)) return [];
    const raw = fs.readFileSync(FALLBACK_USERS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as InternalUserRow[]) : [];
  } catch {
    return [];
  }
}

function writeFallbackUsers(rows: InternalUserRow[]): void {
  try {
    fs.writeFileSync(FALLBACK_USERS_FILE, JSON.stringify(rows, null, 2), 'utf8');
  } catch {
    // Ignore fs errors in restricted environments
  }
}

export async function listInternalUsers(): Promise<{
  rows: InternalUserRow[];
  schemaReady: boolean;
}> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('cuango_users')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    if (isMissingSchemaError(error)) {
      return { rows: readFallbackUsers(), schemaReady: false };
    }
    throw new Error(error.message);
  }

  return {
    rows: (data ?? []) as InternalUserRow[],
    schemaReady: true,
  };
}

export async function listPublicUsers(): Promise<{
  users: PublicUser[];
  schemaReady: boolean;
}> {
  const { rows, schemaReady } = await listInternalUsers();
  return {
    users: rows.map(toPublicUser),
    schemaReady,
  };
}

export async function getUserSetupStatus(): Promise<{
  userCount: number;
  schemaReady: boolean;
}> {
  const { rows, schemaReady } = await listInternalUsers();
  return { userCount: rows.length, schemaReady };
}

export async function findUserByIdentifier(
  identifier: string
): Promise<{ row: InternalUserRow | null; schemaReady: boolean }> {
  const norm = identifier.trim().toLowerCase();
  if (!norm) return { row: null, schemaReady: true };

  const { rows, schemaReady } = await listInternalUsers();
  const matched =
    rows.find(
      (r) =>
        r.username.toLowerCase() === norm ||
        (r.email && r.email.trim().toLowerCase() === norm)
    ) ?? null;

  return { row: matched, schemaReady };
}

export async function findUserById(
  id: string
): Promise<{ row: InternalUserRow | null; schemaReady: boolean }> {
  const { rows, schemaReady } = await listInternalUsers();
  return {
    row: rows.find((r) => r.id === id) ?? null,
    schemaReady,
  };
}

export async function createUserRecord(input: {
  username: string;
  fullName: string;
  email?: string;
  role: UserRole;
  password: string;
}): Promise<{ user: PublicUser; schemaReady: boolean }> {
  const username = normalizeUsername(input.username);
  if (!isValidUsername(username)) {
    throw new Error(
      'Nome de usuário inválido. Use 3 a 40 caracteres (letras, números, ".", "_" ou "-").'
    );
  }
  const fullName = input.fullName.trim();
  if (fullName.length < 2) {
    throw new Error('Informe o nome completo do utilizador.');
  }
  if (input.password.length < 6) {
    throw new Error('A senha deve ter pelo menos 6 caracteres.');
  }

  const email = (input.email ?? '').trim().toLowerCase();
  const { rows, schemaReady } = await listInternalUsers();

  if (rows.some((r) => r.username.toLowerCase() === username)) {
    throw new Error(`O usuário "${username}" já está registado.`);
  }
  if (email && rows.some((r) => r.email && r.email.toLowerCase() === email)) {
    throw new Error(`O e-mail "${email}" já está associado a outro usuário.`);
  }

  const now = new Date().toISOString();
  const newRow: InternalUserRow = {
    id: `usr_${crypto.randomUUID()}`,
    username,
    full_name: fullName,
    email,
    role: input.role,
    password_hash: hashPassword(input.password),
    active: true,
    last_login_at: null,
    created_at: now,
    updated_at: now,
  };

  if (!schemaReady) {
    writeFallbackUsers([...rows, newRow]);
    return { user: toPublicUser(newRow), schemaReady: false };
  }

  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from('cuango_users').insert(newRow);
  if (error) {
    if (isMissingSchemaError(error)) {
      writeFallbackUsers([...rows, newRow]);
      return { user: toPublicUser(newRow), schemaReady: false };
    }
    throw new Error(error.message);
  }

  return { user: toPublicUser(newRow), schemaReady: true };
}

export async function updateUserRecord(
  id: string,
  patch: {
    fullName?: string;
    email?: string;
    role?: UserRole;
    active?: boolean;
    newPassword?: string;
  }
): Promise<{ user: PublicUser; schemaReady: boolean }> {
  const { rows, schemaReady } = await listInternalUsers();
  const targetIdx = rows.findIndex((r) => r.id === id);
  if (targetIdx < 0) {
    throw new Error('Usuário não encontrado.');
  }
  const target = rows[targetIdx];

  const nextRole = patch.role ?? target.role;
  const nextActive = typeof patch.active === 'boolean' ? patch.active : target.active;

  // Guard: never remove/disable the last active administrator
  if (target.role === 'admin' && target.active && (nextRole !== 'admin' || !nextActive)) {
    const otherActiveAdmins = rows.filter(
      (r) => r.id !== id && r.role === 'admin' && r.active
    );
    if (otherActiveAdmins.length === 0) {
      throw new Error(
        'Não é possível desativar ou alterar o perfil do último administrador ativo.'
      );
    }
  }

  const nextEmail =
    typeof patch.email === 'string' ? patch.email.trim().toLowerCase() : target.email;
  if (
    nextEmail &&
    rows.some((r) => r.id !== id && r.email && r.email.toLowerCase() === nextEmail)
  ) {
    throw new Error(`O e-mail "${nextEmail}" já está em uso por outro usuário.`);
  }

  if (patch.newPassword !== undefined && patch.newPassword.length < 6) {
    throw new Error('A nova senha deve ter pelo menos 6 caracteres.');
  }

  const updated: InternalUserRow = {
    ...target,
    full_name:
      typeof patch.fullName === 'string' && patch.fullName.trim().length >= 2
        ? patch.fullName.trim()
        : target.full_name,
    email: nextEmail,
    role: nextRole,
    active: nextActive,
    password_hash: patch.newPassword
      ? hashPassword(patch.newPassword)
      : target.password_hash,
    updated_at: new Date().toISOString(),
  };

  if (!schemaReady) {
    const nextRows = [...rows];
    nextRows[targetIdx] = updated;
    writeFallbackUsers(nextRows);
    return { user: toPublicUser(updated), schemaReady: false };
  }

  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from('cuango_users')
    .update({
      full_name: updated.full_name,
      email: updated.email,
      role: updated.role,
      active: updated.active,
      password_hash: updated.password_hash,
      updated_at: updated.updated_at,
    })
    .eq('id', id);

  if (error) {
    throw new Error(error.message);
  }

  return { user: toPublicUser(updated), schemaReady: true };
}

export async function deleteUserRecord(
  id: string,
  actingUserId: string
): Promise<{ schemaReady: boolean }> {
  if (id === actingUserId) {
    throw new Error('Não pode eliminar o seu próprio usuário enquanto está autenticado.');
  }

  const { rows, schemaReady } = await listInternalUsers();
  const target = rows.find((r) => r.id === id);
  if (!target) {
    throw new Error('Usuário não encontrado.');
  }

  if (target.role === 'admin' && target.active) {
    const otherActiveAdmins = rows.filter(
      (r) => r.id !== id && r.role === 'admin' && r.active
    );
    if (otherActiveAdmins.length === 0) {
      throw new Error('Não é possível eliminar o último administrador ativo.');
    }
  }

  if (!schemaReady) {
    writeFallbackUsers(rows.filter((r) => r.id !== id));
    return { schemaReady: false };
  }

  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from('cuango_users').delete().eq('id', id);
  if (error) {
    throw new Error(error.message);
  }

  return { schemaReady: true };
}

export async function authenticateUser(
  identifier: string,
  password: string
): Promise<PublicUser> {
  const { row } = await findUserByIdentifier(identifier);
  if (!row || !verifyPassword(password, row.password_hash)) {
    throw new Error('Usuário ou senha incorretos.');
  }
  if (!row.active) {
    throw new Error('Esta conta está desativada. Contacte o administrador.');
  }

  const now = new Date().toISOString();
  const { rows, schemaReady } = await listInternalUsers();
  if (!schemaReady) {
    const nextRows = rows.map((r) =>
      r.id === row.id ? { ...r, last_login_at: now, updated_at: now } : r
    );
    writeFallbackUsers(nextRows);
  } else {
    const supabase = getSupabaseServerClient();
    await supabase
      .from('cuango_users')
      .update({ last_login_at: now, updated_at: now })
      .eq('id', row.id);
  }

  return toPublicUser({ ...row, last_login_at: now });
}

export async function changeOwnPassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const { row } = await findUserById(userId);
  if (!row) {
    throw new Error('Sessão inválida. Inicie sessão novamente.');
  }
  if (!verifyPassword(currentPassword, row.password_hash)) {
    throw new Error('A senha atual está incorreta.');
  }
  if (newPassword.length < 6) {
    throw new Error('A nova senha deve ter pelo menos 6 caracteres.');
  }

  await updateUserRecord(userId, { newPassword });
}

export async function getAuthenticatedUser(
  req: NextRequest
): Promise<PublicUser | null> {
  const token = getSessionTokenFromRequest(req);
  if (!token) return null;

  const payload = verifySessionToken(token);
  if (!payload) return null;

  const { row } = await findUserById(payload.uid);
  if (!row || !row.active) return null;

  return toPublicUser(row);
}
