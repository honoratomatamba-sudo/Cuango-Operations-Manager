import { NextRequest, NextResponse } from 'next/server';
import {
  formatHMS,
  getEntryCount,
  getShiftMeta,
  OFFICIAL_REPORT_FOOTER,
} from '@/lib/fleet-analytics';
import { FleetDataset, ShiftScheme } from '@/lib/fleet-types';
import { getActiveServerDataset, setActiveServerDataset } from '@/lib/server-store';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const schemeParam = searchParams.get('turnoModelo');
  const scheme: ShiftScheme = schemeParam === '2x12h' ? '2x12h' : '3x8h';
  const areaFilter = searchParams.get('area');
  const equipFilter = searchParams.get('equipamento');
  const detailMode = searchParams.get('detalhe') === 'lista';

  const dataset = getActiveServerDataset();
  const baseRows =
    detailMode && dataset.detailCycles && dataset.detailCycles.length > 0
      ? dataset.detailCycles
      : dataset.records;

  const filtered = baseRows.filter((r) => {
    if (areaFilter && areaFilter !== 'ALL' && r.area !== areaFilter) return false;
    if (equipFilter && equipFilter !== 'ALL' && r.equipamento !== equipFilter) return false;
    return true;
  });

  const enrichedRecords = filtered.map((r) => {
    const shift = getShiftMeta(r.horaEntrada, scheme);
    return {
      numero: r.numero,
      data: r.data,
      horaEntrada: r.horaEntrada,
      turno: shift.label,
      janelaTurno: shift.windowLabel,
      equipamento: r.equipamento,
      area: r.area,
      condutorCompleto: r.condutorCompleto,
      condutorNome: r.condutorNome,
      condutorCodigo: r.condutorCodigo,
      entrada: r.entrada,
      saida: r.saida,
      inicio: r.inicio ?? r.entrada,
      fim: r.fim ?? r.saida,
      entradasCount: getEntryCount(r),
      duracaoHMS: formatHMS(r.duracaoSeg),
      utilizacaoHMS: formatHMS(r.utilizacaoSeg),
      produtivoHMS: formatHMS(r.produtivoSeg),
      relantiHMS: formatHMS(r.relantiSeg),
      paradoHMS: formatHMS(r.paradoSeg),
      duracaoSeg: r.duracaoSeg,
      utilizacaoSeg: r.utilizacaoSeg,
      produtivoSeg: r.produtivoSeg,
      relantiSeg: r.relantiSeg,
      paradoSeg: r.paradoSeg,
      distanciaHoras: r.distanciaHoras,
      eficienciaEfetivaPct:
        r.duracaoSeg > 0 ? Number(((r.produtivoSeg / r.duracaoSeg) * 100).toFixed(2)) : 0,
      fonteSecao: r.sourceSection ?? 'resumo',
      arquivoOrigem: r.origemArquivo ?? dataset.metadata.arquivoOrigem,
    };
  });

  return NextResponse.json(
    {
      schemaVersion: '1.1',
      organizacao: dataset.metadata.organizacao,
      periodo: `${dataset.metadata.dataInicio} - ${dataset.metadata.dataFim}`,
      modeloTurno: scheme,
      fontePrincipal: detailMode ? 'Lista' : 'Resumo',
      totalRegistros: enrichedRecords.length,
      totalEntradas: enrichedRecords.reduce((acc, r) => acc + r.entradasCount, 0),
      rodape: OFFICIAL_REPORT_FOOTER,
      records: enrichedRecords,
    },
    {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
    }
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { dataset?: FleetDataset };
    if (!body.dataset || !Array.isArray(body.dataset.records)) {
      return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 });
    }
    setActiveServerDataset(body.dataset);
    return NextResponse.json({ ok: true, total: body.dataset.records.length });
  } catch {
    return NextResponse.json({ error: 'Erro ao sincronizar feed.' }, { status: 400 });
  }
}
