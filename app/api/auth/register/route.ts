import { NextRequest, NextResponse } from 'next/server';
import {
  attachSessionCookie,
  createSessionToken,
  createUserRecord,
  getUserSetupStatus,
} from '@/lib/auth-server';

export async function POST(req: NextRequest) {
  try {
    const { userCount } = await getUserSetupStatus();
    if (userCount > 0) {
      return NextResponse.json(
        {
          error:
            'O sistema já possui administrador configurado. Solicite acesso ao administrador.',
        },
        { status: 403 }
      );
    }

    const body = (await req.json()) as {
      username?: string;
      fullName?: string;
      email?: string;
      password?: string;
    };

    const { user, schemaReady } = await createUserRecord({
      username: body.username ?? '',
      fullName: body.fullName ?? '',
      email: body.email ?? '',
      role: 'admin',
      password: body.password ?? '',
    });

    const token = createSessionToken(user);
    const res = NextResponse.json({
      authenticated: true,
      user,
      token,
      schemaReady,
    });
    attachSessionCookie(res, req, token);
    return res;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Não foi possível criar a conta.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
