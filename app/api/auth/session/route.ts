import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, getUserSetupStatus } from '@/lib/auth-server';

export async function GET(req: NextRequest) {
  try {
    const [{ userCount, schemaReady }, user] = await Promise.all([
      getUserSetupStatus(),
      getAuthenticatedUser(req),
    ]);

    return NextResponse.json({
      authenticated: Boolean(user),
      user,
      needsSetup: userCount === 0,
      schemaReady,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Erro ao verificar sessão.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
