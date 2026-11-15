import { NextRequest, NextResponse } from 'next/server';
import { ingestPdfBytes } from '@/lib/pdf-ingestion';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';
    let fileName = 'relatorio.pdf';
    let pdfUint8: Uint8Array;

    if (contentType.includes('application/json')) {
      const body = (await req.json()) as {
        fileName?: string;
        base64Pdf?: string;
      };
      if (!body.base64Pdf) {
        return NextResponse.json(
          { error: 'Conteúdo PDF base64 não fornecido.' },
          { status: 400 }
        );
      }
      fileName = body.fileName || 'relatorio.pdf';
      pdfUint8 = new Uint8Array(Buffer.from(body.base64Pdf, 'base64'));
    } else {
      const formData = await req.formData();
      const file = formData.get('file');
      if (!file || !(file instanceof File)) {
        return NextResponse.json(
          { error: 'Nenhum arquivo PDF enviado.' },
          { status: 400 }
        );
      }
      if (file.size > 20 * 1024 * 1024) {
        return NextResponse.json(
          { error: 'Arquivo excede o limite de 20 MB.' },
          { status: 400 }
        );
      }
      fileName = file.name;
      const arrayBuffer = await file.arrayBuffer();
      pdfUint8 = new Uint8Array(arrayBuffer);
    }

    const result = await ingestPdfBytes(pdfUint8, fileName);
    return NextResponse.json(result);
  } catch (err) {
    console.error('Erro ao processar PDF:', err);
    const message = err instanceof Error ? err.message : 'Erro interno ao processar PDF.';
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
