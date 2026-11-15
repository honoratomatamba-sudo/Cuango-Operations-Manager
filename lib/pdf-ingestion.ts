import { GoogleGenAI, Type } from '@google/genai';
import { extractText } from 'unpdf';
import {
  deduplicateDataset,
  extractDateFromDateTime,
  extractHourFromDateTime,
  parseHMS,
  splitDriverIdentity,
} from './fleet-analytics';
import { FleetCycleRecord, FleetDataset, ReportMetadata } from './fleet-types';
import { parseNovatronicaPdfBytes } from './novatronica-pdf-parser';

function extractJsonSafely(raw: string): unknown {
  const trimmed = raw.trim();
  const unfenced = trimmed
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    return JSON.parse(unfenced);
  } catch {
    const firstBrace = unfenced.indexOf('{');
    const lastBrace = unfenced.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(unfenced.slice(firstBrace, lastBrace + 1));
    }
    throw new Error('A resposta da extração não retornou JSON válido.');
  }
}

function isValidPdfBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 5) return false;
  const header = Buffer.from(bytes.slice(0, 8)).toString('ascii');
  return header.includes('%PDF-');
}

const GEMINI_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    metadata: {
      type: Type.OBJECT,
      properties: {
        organizacao: { type: Type.STRING },
        sistema: { type: Type.STRING },
        grupoEquipamentos: { type: Type.STRING },
        areaSelecionada: { type: Type.STRING },
        dataInicio: { type: Type.STRING },
        dataFim: { type: Type.STRING },
      },
    },
    rows: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          numero: { type: Type.INTEGER },
          equipamento: { type: Type.STRING },
          condutor: { type: Type.STRING },
          entrada: { type: Type.STRING },
          saida: { type: Type.STRING },
          duracao: { type: Type.STRING },
          distanciaHoras: { type: Type.NUMBER },
          utilizacao: { type: Type.STRING },
          relanti: { type: Type.STRING },
          parado: { type: Type.STRING },
          contador: { type: Type.STRING },
          area: { type: Type.STRING },
        },
        required: [
          'numero',
          'equipamento',
          'condutor',
          'entrada',
          'saida',
          'duracao',
          'utilizacao',
          'relanti',
          'parado',
          'area',
        ],
      },
    },
  },
  required: ['rows'],
};

interface GeminiExtractedPayload {
  metadata?: Partial<ReportMetadata>;
  rows?: Array<{
    numero: number;
    equipamento: string;
    condutor: string;
    entrada: string;
    saida: string;
    duracao: string;
    distanciaHoras?: number;
    utilizacao: string;
    relanti: string;
    parado: string;
    contador?: string;
    area: string;
  }>;
}

export async function ingestPdfBytes(
  pdfUint8: Uint8Array,
  fileName: string
): Promise<{ dataset: FleetDataset; parser: 'deterministic' | 'gemini-text' | 'gemini-pdf' }> {
  if (!isValidPdfBytes(pdfUint8)) {
    throw new Error(
      `O ficheiro "${fileName}" não possui um cabeçalho PDF válido (%PDF-). Verifique se o anexo está corrompido ou protegido.`
    );
  }

  // 1. Deterministic 2D geometric X/Y coordinate parser via unpdf getDocumentProxy
  try {
    const deterministicDataset = await parseNovatronicaPdfBytes(pdfUint8, fileName);
    if (deterministicDataset && deterministicDataset.records.length > 0) {
      return {
        dataset: deduplicateDataset(deterministicDataset).dataset,
        parser: 'deterministic',
      };
    }
  } catch (geoErr) {
    console.warn('Extração geométrica PDF falhou, tentando fallback:', geoErr);
  }

  let extractedPages: string[] = [];
  try {
    const { text } = await extractText(pdfUint8, { mergePages: false });
    extractedPages = Array.isArray(text) ? text : [String(text ?? '')];
  } catch (pdfTextErr) {
    console.warn('Extração direta de texto PDF falhou:', pdfTextErr);
  }

  const combinedText = extractedPages.join('\n').trim();

  if (!process.env.GEMINI_API_KEY) {
    throw new Error(
      'Este PDF não corresponde ao formato tabular padrão da Novatronica e a chave GEMINI_API_KEY não está configurada.'
    );
  }

  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  let rawJsonText = '';
  let parserKind: 'gemini-text' | 'gemini-pdf' = 'gemini-text';

  // 2. Text-first Gemini extraction (avoids inlineData PDF 400 INVALID_ARGUMENT issues)
  if (combinedText.length >= 80) {
    const trimmedText =
      combinedText.length > 180000
        ? combinedText.slice(0, 180000)
        : combinedText;

    const prompt = `Extraia TODOS os registos de Entradas/Saídas de Áreas deste texto de relatório de frota GPS.
Regras:
1. Extraia os metadados (organizacao, areaSelecionada, dataInicio, dataFim) se disponíveis.
2. Extraia TODAS as linhas de movimentação com: numero, equipamento, condutor, entrada ("DD/MM/YYYY HH:MM:SS"), saida ("DD/MM/YYYY HH:MM:SS"), duracao ("HH:MM:SS"), distanciaHoras (número), utilizacao ("HH:MM:SS"), relanti ("HH:MM:SS"), parado ("HH:MM:SS"), area.
3. Se o PDF não for um relatório de frota ou não tiver entradas/saídas, retorne {"rows": []}.

Texto extraído do PDF "${fileName}":
${trimmedText}`;

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: GEMINI_RESPONSE_SCHEMA,
      },
    });
    rawJsonText = response.text ?? '{}';
    parserKind = 'gemini-text';
  } else {
    // 3. Binary inlineData fallback ONLY for scanned/image-only PDFs (< 15 MB)
    if (pdfUint8.length > 15 * 1024 * 1024) {
      throw new Error(
        `O PDF digitalizado "${fileName}" excede 15 MB para leitura multimodal direta.`
      );
    }

    parserKind = 'gemini-pdf';
    const base64Pdf = Buffer.from(pdfUint8).toString('base64');

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType: 'application/pdf', data: base64Pdf } },
              {
                text: `Extraia todos os registos de Entradas/Saídas de Áreas deste PDF de frota em JSON. Se o documento não for um relatório de frota, retorne {"rows": []}.`,
              },
            ],
          },
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: GEMINI_RESPONSE_SCHEMA,
        },
      });
      rawJsonText = response.text ?? '{}';
    } catch (geminiErr) {
      const msg = geminiErr instanceof Error ? geminiErr.message : String(geminiErr);
      if (msg.includes('INVALID_ARGUMENT') || msg.includes('400')) {
        throw new Error(
          `Não foi possível ler o PDF "${fileName}" (ficheiro digitalizado, encriptado ou formato incompatível).`
        );
      }
      throw geminiErr;
    }
  }

  const parsed = extractJsonSafely(rawJsonText) as GeminiExtractedPayload;
  const rows = parsed.rows ?? [];

  if (rows.length === 0) {
    throw new Error(
      `O ficheiro "${fileName}" não contém registos de Entradas/Saídas de Áreas de frota reconhecidos.`
    );
  }

  const cleanMetaArea =
    parsed.metadata?.areaSelecionada &&
    !/^(?:todos|todas|all|n\/d|-)$/i.test(parsed.metadata.areaSelecionada.trim()) &&
    !parsed.metadata.areaSelecionada.includes(',')
      ? parsed.metadata.areaSelecionada.trim()
      : undefined;

  const stamp = Date.now();
  const records: FleetCycleRecord[] = rows.map((row, idx) => {
    const duracaoSeg = parseHMS(row.duracao);
    const utilizacaoSeg = parseHMS(row.utilizacao);
    const relantiSeg = parseHMS(row.relanti);
    const paradoSeg = parseHMS(row.parado);
    const produtivoSeg = Math.max(0, utilizacaoSeg - relantiSeg);
    const { nome, codigo } = splitDriverIdentity(row.condutor || 'Não identificado');
    const rawRowArea = (row.area || '').trim();
    const area =
      rawRowArea && !/^(?:todos|todas|all|n\/d|-)$/i.test(rawRowArea)
        ? rawRowArea
        : cleanMetaArea || 'N/D';

    return {
      id: `pdf-${stamp}-${row.numero ?? idx + 1}-${idx}`,
      numero: row.numero ?? idx + 1,
      equipamento: (row.equipamento || 'N/D').trim(),
      condutorCompleto: (row.condutor || 'Não identificado').trim(),
      condutorNome: nome,
      condutorCodigo: codigo,
      entrada: (row.entrada || '').trim(),
      saida: (row.saida || '').trim(),
      data: extractDateFromDateTime(row.entrada || ''),
      horaEntrada: extractHourFromDateTime(row.entrada || ''),
      duracaoSeg,
      distanciaHoras: Number(row.distanciaHoras ?? 0) || 0,
      utilizacaoSeg,
      relantiSeg,
      paradoSeg,
      produtivoSeg,
      contador: (row.contador || 'Indisponível').trim(),
      area,
      origemArquivo: fileName,
    };
  });

  const extractedAreas = Array.from(
    new Set(
      records
        .map((r) => r.area)
        .filter((a) => !/^(?:todos|todas|all|n\/d|-)$/i.test(a.trim()))
    )
  );

  const metadata: ReportMetadata = {
    organizacao: parsed.metadata?.organizacao || 'SOCMINEIRACUANGO',
    sistema: parsed.metadata?.sistema || 'Novatronica Gestão de Frotas por GPS',
    grupoEquipamentos: parsed.metadata?.grupoEquipamentos || 'Pesados Metalurgia',
    equipamentosNoFiltro: Array.from(new Set(records.map((r) => r.equipamento))),
    grupoCondutores: 'Todos',
    grupoAreas: 'Todos',
    areaSelecionada:
      extractedAreas.length > 0
        ? extractedAreas.join(', ')
        : cleanMetaArea || 'N/D',
    margem: '00:00:10',
    dataInicio: parsed.metadata?.dataInicio || records[0]?.data || '',
    dataFim: parsed.metadata?.dataFim || records[records.length - 1]?.data || '',
    fusoHorario: '(UTC+01:00) West Central Africa',
    geradoEm: new Date().toLocaleString('pt-PT'),
    arquivoOrigem: fileName,
  };

  const dataset = deduplicateDataset({ metadata, records }).dataset;

  return { dataset, parser: parserKind };
}
