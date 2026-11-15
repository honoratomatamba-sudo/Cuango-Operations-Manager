import { NextRequest, NextResponse } from 'next/server';
import { changeOwnPassword, getAuthenticatedUser } from '@/lib/auth-server';

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json(
      { error: 'Sessão expirada. Inicie sessão novamente.' },
      { status: 401 }
    );
  }

  try {
    const body = (await req.json()) as {
      currentPassword?: string;
      newPassword?: string;
    };

    await changeOwnPassword(
      user.id,
      body.currentPassword ?? '',
      body.newPassword ?? ''
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Erro ao alterar a senha.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
