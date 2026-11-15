import { NextRequest, NextResponse } from 'next/server';
import {
  attachSessionCookie,
  authenticateUser,
  createSessionToken,
} from '@/lib/auth-server';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      identifier?: string;
      password?: string;
    };

    const identifier = (body.identifier ?? '').trim();
    const password = body.password ?? '';

    if (!identifier || !password) {
      return NextResponse.json(
        { error: 'Informe o nome de usuário e a senha.' },
        { status: 400 }
      );
    }

    const user = await authenticateUser(identifier, password);
    const token = createSessionToken(user);

    const res = NextResponse.json({
      authenticated: true,
      user,
      token,
    });
    attachSessionCookie(res, req, token);
    return res;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Falha na autenticação.';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
