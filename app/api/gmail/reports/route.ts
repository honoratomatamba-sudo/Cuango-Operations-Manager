import { NextRequest, NextResponse } from 'next/server';
import { ingestPdfBytes } from '@/lib/pdf-ingestion';

export const runtime = 'nodejs';
export const maxDuration = 60;

const AUTHORIZED_SENDER = 'alertasdigital@novatronica.com';

interface GmailPart {
  filename?: string;
  mimeType?: string;
  body?: {
    attachmentId?: string;
    size?: number;
    data?: string;
  };
  parts?: GmailPart[];
}

interface GmailMessage {
  id: string;
  threadId?: string;
  internalDate?: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
    parts?: GmailPart[];
    filename?: string;
    mimeType?: string;
    body?: {
      attachmentId?: string;
      size?: number;
    };
  };
}

export interface GmailPdfAttachmentItem {
  id: string;
  messageId: string;
  attachmentId: string;
  filename: string;
  sizeBytes: number;
  subject: string;
  from: string;
  date: string;
  internalDateMs: number;
}

function collectPdfParts(part: GmailPart | undefined, acc: GmailPart[] = []): GmailPart[] {
  if (!part) return acc;
  const isPdf =
    part.mimeType === 'application/pdf' ||
    (part.filename && part.filename.toLowerCase().endsWith('.pdf'));

  if (isPdf && part.body?.attachmentId) {
    acc.push(part);
  }
  if (Array.isArray(part.parts)) {
    for (const child of part.parts) {
      collectPdfParts(child, acc);
    }
  }
  return acc;
}

function getHeader(
  headers: Array<{ name: string; value: string }> | undefined,
  target: string
): string {
  if (!headers) return '';
  const found = headers.find(
    (h) => h.name.toLowerCase() === target.toLowerCase()
  );
  return found?.value ?? '';
}

function decodeBase64UrlToUint8(data: string): Uint8Array {
  const buf = Buffer.from(data.trim(), 'base64url');
  return new Uint8Array(buf);
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Sessão Gmail expirada ou não autenticada.' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const customQuery = searchParams.get('q')?.trim();

    // Strictly restrict Gmail search to emails from alertasdigital@novatronica.com with PDF attachments
    const baseQuery = `from:${AUTHORIZED_SENDER} has:attachment filename:pdf`;
    const query = customQuery ? `${baseQuery} ${customQuery}` : baseQuery;

    const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(
      query
    )}&maxResults=25`;

    const listRes = await fetch(listUrl, {
      headers: { Authorization: authHeader },
      cache: 'no-store',
    });

    const listRaw = await listRes.text();
    if (!listRes.ok) {
      return NextResponse.json(
        {
          error:
            listRes.status === 401
              ? 'Token do Gmail expirado. Inicie sessão novamente.'
              : `Erro Gmail API (${listRes.status}): ${listRaw.slice(0, 240)}`,
        },
        { status: listRes.status }
      );
    }

    const listData = JSON.parse(listRaw) as {
      messages?: Array<{ id: string }>;
    };
    const messageIds = (listData.messages ?? []).map((m) => m.id);

    if (messageIds.length === 0) {
      return NextResponse.json({ items: [], query, sender: AUTHORIZED_SENDER });
    }

    const messages = await Promise.all(
      messageIds.map(async (id) => {
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
          {
            headers: { Authorization: authHeader },
            cache: 'no-store',
          }
        );
        if (!msgRes.ok) return null;
        return (await msgRes.json()) as GmailMessage;
      })
    );

    const items: GmailPdfAttachmentItem[] = [];
    for (const msg of messages) {
      if (!msg) continue;
      const headers = msg.payload?.headers;
      const from = getHeader(headers, 'From') || '';

      // Enforce strict sender verification
      if (!from.toLowerCase().includes(AUTHORIZED_SENDER)) {
        continue;
      }

      const subject = getHeader(headers, 'Subject') || '(Sem assunto)';
      const date = getHeader(headers, 'Date') || '';
      const internalDateMs = parseInt(msg.internalDate ?? '0', 10) || 0;

      const rootPart: GmailPart = {
        filename: msg.payload?.filename,
        mimeType: msg.payload?.mimeType,
        body: msg.payload?.body,
        parts: msg.payload?.parts,
      };
      const pdfParts = collectPdfParts(rootPart);

      for (const part of pdfParts) {
        if (!part.body?.attachmentId) continue;
        items.push({
          id: `${msg.id}__${part.body.attachmentId}`,
          messageId: msg.id,
          attachmentId: part.body.attachmentId,
          filename: part.filename || 'relatorio.pdf',
          sizeBytes: part.body.size ?? 0,
          subject,
          from,
          date,
          internalDateMs,
        });
      }
    }

    items.sort((a, b) => b.internalDateMs - a.internalDateMs);

    return NextResponse.json({ items, query, sender: AUTHORIZED_SENDER });
  } catch (err) {
    console.error('Erro ao consultar Gmail:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao consultar Gmail.' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Sessão Gmail expirada ou não autenticada.' },
        { status: 401 }
      );
    }

    const body = (await req.json()) as {
      messageId?: string;
      attachmentId?: string;
      filename?: string;
    };

    if (!body.messageId || !body.attachmentId) {
      return NextResponse.json(
        { error: 'Identificadores do anexo Gmail em falta.' },
        { status: 400 }
      );
    }

    const fileName = body.filename || 'relatorio-email.pdf';
    const attRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${body.messageId}/attachments/${body.attachmentId}`,
      {
        headers: { Authorization: authHeader },
        cache: 'no-store',
      }
    );

    if (!attRes.ok) {
      const errTxt = await attRes.text();
      return NextResponse.json(
        {
          error: `Erro ao descarregar anexo do Gmail (${attRes.status}): ${errTxt.slice(0, 200)}`,
        },
        { status: attRes.status }
      );
    }

    const attJson = (await attRes.json()) as { data?: string };
    if (!attJson.data) {
      return NextResponse.json(
        { error: 'Anexo vazio recebido do Gmail.' },
        { status: 422 }
      );
    }

    const pdfUint8 = decodeBase64UrlToUint8(attJson.data);
    const result = await ingestPdfBytes(pdfUint8, fileName);
    return NextResponse.json(result);
  } catch (err) {
    console.error('Erro ao importar anexo Gmail:', err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Erro ao processar anexo do Gmail.',
      },
      { status: 422 }
    );
  }
}
