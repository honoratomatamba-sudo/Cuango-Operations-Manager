import { NextRequest, NextResponse } from 'next/server';
import {
  createUserRecord,
  deleteUserRecord,
  getAuthenticatedUser,
  listPublicUsers,
  updateUserRecord,
} from '@/lib/auth-server';
import { UserRole } from '@/lib/auth-types';

const ALLOWED_ROLES: UserRole[] = ['admin', 'operador', 'visualizador'];

async function requireAdmin(req: NextRequest) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return {
      error: NextResponse.json(
        { error: 'Autenticação necessária.' },
        { status: 401 }
      ),
      user: null,
    };
  }
  if (user.role !== 'admin') {
    return {
      error: NextResponse.json(
        { error: 'Apenas administradores podem gerir utilizadores.' },
        { status: 403 }
      ),
      user: null,
    };
  }
  return { error: null, user };
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const { users, schemaReady } = await listPublicUsers();
    return NextResponse.json({ users, schemaReady });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : 'Erro ao listar utilizadores.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const body = (await req.json()) as {
      username?: string;
      fullName?: string;
      email?: string;
      role?: UserRole;
      password?: string;
    };

    const role: UserRole =
      body.role && ALLOWED_ROLES.includes(body.role) ? body.role : 'operador';

    const { user, schemaReady } = await createUserRecord({
      username: body.username ?? '',
      fullName: body.fullName ?? '',
      email: body.email ?? '',
      role,
      password: body.password ?? '',
    });

    return NextResponse.json({ user, schemaReady }, { status: 201 });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : 'Erro ao criar utilizador.';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const body = (await req.json()) as {
      id?: string;
      fullName?: string;
      email?: string;
      role?: UserRole;
      active?: boolean;
      newPassword?: string;
    };

    if (!body.id) {
      return NextResponse.json(
        { error: 'Identificador do utilizador em falta.' },
        { status: 400 }
      );
    }

    const role =
      body.role && ALLOWED_ROLES.includes(body.role) ? body.role : undefined;

    const { user, schemaReady } = await updateUserRecord(body.id, {
      fullName: body.fullName,
      email: body.email,
      role,
      active: body.active,
      newPassword: body.newPassword?.trim() ? body.newPassword : undefined,
    });

    return NextResponse.json({ user, schemaReady });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : 'Erro ao atualizar utilizador.';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error || !auth.user) return auth.error!;

  try {
    const body = (await req.json()) as { id?: string };
    if (!body.id) {
      return NextResponse.json(
        { error: 'Identificador do utilizador em falta.' },
        { status: 400 }
      );
    }

    const { schemaReady } = await deleteUserRecord(body.id, auth.user.id);
    return NextResponse.json({ ok: true, schemaReady });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : 'Erro ao eliminar utilizador.';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
