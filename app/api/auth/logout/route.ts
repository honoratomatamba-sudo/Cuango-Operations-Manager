import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/auth-server';

export async function POST(req: NextRequest) {
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res, req);
  return res;
}
