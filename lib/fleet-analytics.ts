import {
  DriverMetrics,
  EquipmentAreaMetrics,
  EquipmentFuelProfile,
  ExplorationAreaMetric,
  ExplorationEquipmentMetric,
  FilterState,
  FleetCycleRecord,
  FleetDataset,
  FleetModuleId,
  FuelGlobalKPIs,
  FuelRatePair,
  GlobalKPIs,
  HourlyBucket,
  ShiftId,
  ShiftMetrics,
  ShiftScheme,
} from './fleet-types';

export function parseHMS(hms: string): number {
  const clean = (hms || '00:00:00').trim();
  const parts = clean.split(':').map((p) => parseInt(p, 10));
  if (parts.length === 3 && parts.every((n) => !Number.isNaN(n))) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2 && parts.every((n) => !Number.isNaN(n))) {
    return parts[0] * 60 + parts[1];
  }
  return 0;
}

export function formatHMS(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

export function formatHM(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

export function splitDriverIdentity(condutorCompleto: string): {
  nome: string;
  codigo: string;
} {
  const match = condutorCompleto.trim().match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (match) {
    return { nome: match[1].trim(), codigo: match[2].trim() };
  }
  return { nome: condutorCompleto.trim(), codigo: '—' };
}

export function extractHourFromDateTime(dt: string): number {
  const timePart = dt.trim().split(/\s+/)[1] ?? '00:00:00';
  const hour = parseInt(timePart.split(':')[0] ?? '0', 10);
  return Number.isNaN(hour) ? 0 : Math.min(23, Math.max(0, hour));
}

export function extractDateFromDateTime(dt: string): string {
  return dt.trim().split(/\s+/)[0] ?? '';
}

export function getEntryCount(r: FleetCycleRecord): number {
  return typeof r.entradasCount === 'number' && r.entradasCount >= 0
    ? r.entradasCount
    : 1;
}

export function getShiftMeta(
  hour: number,
  scheme: ShiftScheme
): { id: ShiftId; label: string; windowLabel: string; order: number } {
  if (scheme === '2x12h') {
    if (hour >= 6 && hour < 18) {
      return {
        id: 'dia_12h',
        label: '1º Turno (12h)',
        windowLabel: '06:00 – 18:00',
        order: 1,
      };
    }
    return {
      id: 'noite_12h',
      label: '2º Turno (12h)',
      windowLabel: '18:00 – 06:00',
      order: 2,
    };
  }

  // 3x8h mining shift standard (1º, 2º e 3º Turno)
  if (hour >= 6 && hour < 14) {
    return {
      id: 'manha',
      label: '1º Turno',
      windowLabel: '06:00 – 14:00',
      order: 1,
    };
  }
  if (hour >= 14 && hour < 22) {
    return {
      id: 'tarde',
      label: '2º Turno',
      windowLabel: '14:00 – 22:00',
      order: 2,
    };
  }
  return {
    id: 'noite',
    label: '3º Turno',
    windowLabel: '22:00 – 06:00',
    order: 3,
  };
}

export function getAllShiftOptions(
  scheme: ShiftScheme
): Array<{ id: ShiftId; label: string; windowLabel: string; order: number }> {
  if (scheme === '2x12h') {
    return [
      { id: 'dia_12h', label: '1º Turno (12h)', windowLabel: '06:00 – 18:00', order: 1 },
      { id: 'noite_12h', label: '2º Turno (12h)', windowLabel: '18:00 – 06:00', order: 2 },
    ];
  }
  return [
    { id: 'manha', label: '1º Turno', windowLabel: '06:00 – 14:00', order: 1 },
    { id: 'tarde', label: '2º Turno', windowLabel: '14:00 – 22:00', order: 2 },
    { id: 'noite', label: '3º Turno', windowLabel: '22:00 – 06:00', order: 3 },
  ];
}

export function applyFilters(
  records: FleetCycleRecord[],
  filters: FilterState
): FleetCycleRecord[] {
  const q = filters.searchQuery.trim().toLowerCase();
  return records.filter((r) => {
    if (filters.area !== 'ALL' && r.area !== filters.area) return false;
    if (filters.equipamento !== 'ALL' && r.equipamento !== filters.equipamento) return false;
    if (filters.condutor !== 'ALL' && r.condutorCompleto !== filters.condutor) return false;
    if (filters.shiftId !== 'ALL') {
      const shift = getShiftMeta(r.horaEntrada, filters.shiftScheme);
      if (shift.id !== filters.shiftId) return false;
    }
    if (filters.hour !== null && r.horaEntrada !== filters.hour) return false;
    if (q) {
      const haystack = `${r.numero} ${r.equipamento} ${r.condutorCompleto} ${r.area} ${r.entrada} ${r.origemArquivo ?? ''}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

export function computeGlobalKPIs(records: FleetCycleRecord[]): GlobalKPIs {
  const totalEntradas = records.reduce((acc, r) => acc + getEntryCount(r), 0);
  const equipamentosSet = new Set(records.map((r) => r.equipamento));
  const condutoresSet = new Set(records.map((r) => r.condutorCompleto));
  const areasSet = new Set(records.map((r) => r.area));

  let permanenciaSeg = 0;
  let utilizacaoSeg = 0;
  let relantiSeg = 0;
  let paradoSeg = 0;
  let produtivoSeg = 0;
  let distanciaHoras = 0;

  for (const r of records) {
    permanenciaSeg += r.duracaoSeg;
    utilizacaoSeg += r.utilizacaoSeg;
    relantiSeg += r.relantiSeg;
    paradoSeg += r.paradoSeg;
    produtivoSeg += r.produtivoSeg;
    distanciaHoras += r.distanciaHoras;
  }

  const mediaPermanenciaPorEntradaSeg =
    totalEntradas > 0 ? Math.round(permanenciaSeg / totalEntradas) : 0;
  const disponibilidadeMotorPct =
    permanenciaSeg > 0 ? (utilizacaoSeg / permanenciaSeg) * 100 : 0;
  const eficienciaEfetivaPct =
    permanenciaSeg > 0 ? (produtivoSeg / permanenciaSeg) * 100 : 0;
  const taxaRelantiSobrePermanenciaPct =
    permanenciaSeg > 0 ? (relantiSeg / permanenciaSeg) * 100 : 0;
  const taxaRelantiSobreUtilizacaoPct =
    utilizacaoSeg > 0 ? (relantiSeg / utilizacaoSeg) * 100 : 0;
  const taxaParadoPct =
    permanenciaSeg > 0 ? (paradoSeg / permanenciaSeg) * 100 : 0;

  return {
    totalEntradas,
    totalEquipamentosAtivos: equipamentosSet.size,
    totalCondutoresAtivos: condutoresSet.size,
    totalAreasAtivas: areasSet.size,
    permanenciaSeg,
    utilizacaoSeg,
    relantiSeg,
    paradoSeg,
    produtivoSeg,
    distanciaHoras: Math.round(distanciaHoras * 10) / 10,
    mediaPermanenciaPorEntradaSeg,
    disponibilidadeMotorPct,
    eficienciaEfetivaPct,
    taxaRelantiSobrePermanenciaPct,
    taxaRelantiSobreUtilizacaoPct,
    taxaParadoPct,
  };
}

export function computeShiftMetrics(
  records: FleetCycleRecord[],
  scheme: ShiftScheme
): ShiftMetrics[] {
  const options = getAllShiftOptions(scheme);
  const totalPermanenciaAll = records.reduce((acc, r) => acc + r.duracaoSeg, 0);

  return options.map((opt) => {
    const subset = records.filter(
      (r) => getShiftMeta(r.horaEntrada, scheme).id === opt.id
    );
    const entradas = subset.reduce((s, r) => s + getEntryCount(r), 0);
    const permanenciaSeg = subset.reduce((s, r) => s + r.duracaoSeg, 0);
    const utilizacaoSeg = subset.reduce((s, r) => s + r.utilizacaoSeg, 0);
    const relantiSeg = subset.reduce((s, r) => s + r.relantiSeg, 0);
    const paradoSeg = subset.reduce((s, r) => s + r.paradoSeg, 0);
    const produtivoSeg = subset.reduce((s, r) => s + r.produtivoSeg, 0);

    return {
      shiftId: opt.id,
      label: opt.label,
      windowLabel: opt.windowLabel,
      entradas,
      equipamentosCount: new Set(subset.map((r) => r.equipamento)).size,
      condutores: Array.from(new Set(subset.map((r) => r.condutorNome))),
      permanenciaSeg,
      utilizacaoSeg,
      produtivoSeg,
      relantiSeg,
      paradoSeg,
      mediaCicloSeg: entradas > 0 ? Math.round(permanenciaSeg / entradas) : 0,
      eficienciaEfetivaPct:
        permanenciaSeg > 0 ? (produtivoSeg / permanenciaSeg) * 100 : 0,
      taxaRelantiPct:
        permanenciaSeg > 0 ? (relantiSeg / permanenciaSeg) * 100 : 0,
      taxaParadoPct:
        permanenciaSeg > 0 ? (paradoSeg / permanenciaSeg) * 100 : 0,
      participacaoTempoPct:
        totalPermanenciaAll > 0 ? (permanenciaSeg / totalPermanenciaAll) * 100 : 0,
    };
  });
}

export function computeDriverMetrics(
  records: FleetCycleRecord[],
  scheme: ShiftScheme
): DriverMetrics[] {
  const totalEntradas = records.reduce((acc, r) => acc + getEntryCount(r), 0);
  const groups = new Map<string, FleetCycleRecord[]>();

  for (const r of records) {
    const list = groups.get(r.condutorCompleto) ?? [];
    list.push(r);
    groups.set(r.condutorCompleto, list);
  }

  const result: DriverMetrics[] = [];
  for (const [condutorCompleto, list] of groups.entries()) {
    const sorted = [...list].sort((a, b) => a.entrada.localeCompare(b.entrada));
    const entradas = list.reduce((s, r) => s + getEntryCount(r), 0);
    const permanenciaSeg = list.reduce((s, r) => s + r.duracaoSeg, 0);
    const utilizacaoSeg = list.reduce((s, r) => s + r.utilizacaoSeg, 0);
    const produtivoSeg = list.reduce((s, r) => s + r.produtivoSeg, 0);
    const relantiSeg = list.reduce((s, r) => s + r.relantiSeg, 0);
    const paradoSeg = list.reduce((s, r) => s + r.paradoSeg, 0);
    const distanciaHoras =
      Math.round(list.reduce((s, r) => s + r.distanciaHoras, 0) * 10) / 10;

    result.push({
      condutorCompleto,
      condutorNome: list[0].condutorNome,
      condutorCodigo: list[0].condutorCodigo,
      entradas,
      primeiraEntrada: sorted[0]?.entrada ?? '—',
      ultimaSaida: sorted[sorted.length - 1]?.saida ?? '—',
      equipamentos: Array.from(new Set(list.map((r) => r.equipamento))),
      areas: Array.from(new Set(list.map((r) => r.area))),
      turnos: Array.from(
        new Set(list.map((r) => getShiftMeta(r.horaEntrada, scheme).label))
      ),
      permanenciaSeg,
      utilizacaoSeg,
      produtivoSeg,
      relantiSeg,
      paradoSeg,
      distanciaHoras,
      mediaCicloSeg: entradas > 0 ? Math.round(permanenciaSeg / entradas) : 0,
      eficienciaEfetivaPct:
        permanenciaSeg > 0 ? (produtivoSeg / permanenciaSeg) * 100 : 0,
      taxaRelantiPct:
        permanenciaSeg > 0 ? (relantiSeg / permanenciaSeg) * 100 : 0,
      taxaParadoPct:
        permanenciaSeg > 0 ? (paradoSeg / permanenciaSeg) * 100 : 0,
      participacaoEntradasPct:
        totalEntradas > 0 ? (entradas / totalEntradas) * 100 : 0,
    });
  }

  return result.sort((a, b) => b.permanenciaSeg - a.permanenciaSeg);
}

export function computeEquipmentAreaMetrics(
  records: FleetCycleRecord[]
): EquipmentAreaMetrics[] {
  const groups = new Map<string, FleetCycleRecord[]>();

  for (const r of records) {
    const key = `${r.equipamento}__${r.area}`;
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }

  const result: EquipmentAreaMetrics[] = [];
  for (const list of groups.values()) {
    const sorted = [...list].sort((a, b) => a.entrada.localeCompare(b.entrada));
    const entradas = list.reduce((s, r) => s + getEntryCount(r), 0);
    const permanenciaSeg = list.reduce((s, r) => s + r.duracaoSeg, 0);
    const utilizacaoSeg = list.reduce((s, r) => s + r.utilizacaoSeg, 0);
    const produtivoSeg = list.reduce((s, r) => s + r.produtivoSeg, 0);
    const relantiSeg = list.reduce((s, r) => s + r.relantiSeg, 0);
    const paradoSeg = list.reduce((s, r) => s + r.paradoSeg, 0);
    const distanciaHoras =
      Math.round(list.reduce((s, r) => s + r.distanciaHoras, 0) * 10) / 10;
    const condutores = Array.from(new Set(list.map((r) => r.condutorCompleto)));

    result.push({
      equipamento: list[0].equipamento,
      area: list[0].area,
      entradas,
      condutoresCount: condutores.length,
      condutores,
      primeiraEntrada: sorted[0]?.entrada ?? '—',
      ultimaSaida: sorted[sorted.length - 1]?.saida ?? '—',
      permanenciaSeg,
      utilizacaoSeg,
      produtivoSeg,
      relantiSeg,
      paradoSeg,
      distanciaHoras,
      mediaCicloSeg: entradas > 0 ? Math.round(permanenciaSeg / entradas) : 0,
      eficienciaEfetivaPct:
        permanenciaSeg > 0 ? (produtivoSeg / permanenciaSeg) * 100 : 0,
      taxaRelantiPct:
        permanenciaSeg > 0 ? (relantiSeg / permanenciaSeg) * 100 : 0,
    });
  }

  return result.sort((a, b) => b.permanenciaSeg - a.permanenciaSeg);
}

export function computeHourlyDistribution(
  records: FleetCycleRecord[]
): HourlyBucket[] {
  const buckets: HourlyBucket[] = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    hourLabel: `${String(hour).padStart(2, '0')}h`,
    entradas: 0,
    permanenciaSeg: 0,
    produtivoSeg: 0,
    relantiSeg: 0,
    paradoSeg: 0,
    eficienciaPct: 0,
  }));

  for (const r of records) {
    const b = buckets[r.horaEntrada];
    if (!b) continue;
    b.entradas += getEntryCount(r);
    b.permanenciaSeg += r.duracaoSeg;
    b.produtivoSeg += r.produtivoSeg;
    b.relantiSeg += r.relantiSeg;
    b.paradoSeg += r.paradoSeg;
  }

  for (const b of buckets) {
    b.eficienciaPct =
      b.permanenciaSeg > 0 ? (b.produtivoSeg / b.permanenciaSeg) * 100 : 0;
  }

  return buckets;
}

export const OFFICIAL_REPORT_FOOTER =
  '© Todos os direitos reservados Sociedade Mineira do Cuango Sistema desenvolvido por Honorato Matamba';

export function generatePowerBICSV(
  records: FleetCycleRecord[],
  scheme: ShiftScheme
): string {
  const headers = [
    'Numero_Linha',
    'Data',
    'Hora_Entrada',
    'Turno_Trabalho',
    'Janela_Turno',
    'Equipamento',
    'Area_Selecionada',
    'Condutor_Nome',
    'Condutor_Codigo',
    'Entrada_Timestamp',
    'Saida_Timestamp',
    'Inicio_Operacao',
    'Fim_Operacao',
    'Entradas_Area',
    'Duracao_HMS',
    'Utilizacao_HMS',
    'Trabalho_Efetivo_HMS',
    'Relanti_HMS',
    'Parado_HMS',
    'Duracao_Segundos',
    'Utilizacao_Segundos',
    'Trabalho_Efetivo_Segundos',
    'Relanti_Segundos',
    'Parado_Segundos',
    'Distancia_Horas',
    'Eficiencia_Efetiva_Pct',
    'Taxa_Relanti_Pct',
    'Fonte_Relatorio',
    'Arquivo_Origem',
  ];

  const escapeCsv = (val: string | number) => {
    const s = String(val);
    if (s.includes(';') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const rows = records.map((r) => {
    const shift = getShiftMeta(r.horaEntrada, scheme);
    const effPct =
      r.duracaoSeg > 0 ? ((r.produtivoSeg / r.duracaoSeg) * 100).toFixed(2) : '0.00';
    const relPct =
      r.duracaoSeg > 0 ? ((r.relantiSeg / r.duracaoSeg) * 100).toFixed(2) : '0.00';

    return [
      r.numero,
      r.data,
      `${String(r.horaEntrada).padStart(2, '0')}:00`,
      shift.label,
      shift.windowLabel,
      r.equipamento,
      r.area,
      r.condutorNome,
      r.condutorCodigo,
      r.entrada,
      r.saida,
      r.inicio ?? r.entrada,
      r.fim ?? r.saida,
      getEntryCount(r),
      formatHMS(r.duracaoSeg),
      formatHMS(r.utilizacaoSeg),
      formatHMS(r.produtivoSeg),
      formatHMS(r.relantiSeg),
      formatHMS(r.paradoSeg),
      r.duracaoSeg,
      r.utilizacaoSeg,
      r.produtivoSeg,
      r.relantiSeg,
      r.paradoSeg,
      r.distanciaHoras.toFixed(1).replace('.', ','),
      effPct.replace('.', ','),
      relPct.replace('.', ','),
      r.sourceSection === 'resumo' ? 'Resumo' : 'Lista',
      r.origemArquivo ?? 'PDF Novatronica',
    ]
      .map(escapeCsv)
      .join(';');
  });

  return (
    '\uFEFF' +
    [
      headers.join(';'),
      ...rows,
      '',
      escapeCsv(OFFICIAL_REPORT_FOOTER),
    ].join('\r\n')
  );
}

export type ReportCategory =
  | 'executive'
  | 'optimization'
  | 'equipment'
  | 'drivers'
  | 'shifts'
  | 'summary';

function escapeCsvCell(val: string | number): string {
  const s = String(val);
  if (s.includes(';') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function escapeHtmlCell(val: string | number): string {
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function generateInstitutionalReportCSV(params: {
  moduleId?: FleetModuleId;
  category: ReportCategory;
  title: string;
  organizacao: string;
  periodo: string;
  areaLabel: string;
  kpis: GlobalKPIs;
  equipmentRows: EquipmentAreaMetrics[];
  driverRows: DriverMetrics[];
  shiftRows: ShiftMetrics[];
  records: FleetCycleRecord[];
  scheme: ShiftScheme;
  fuelKpis?: FuelGlobalKPIs;
  explorationEquipRows?: ExplorationEquipmentMetric[];
  explorationAreaRows?: ExplorationAreaMetric[];
}): string {
  const {
    moduleId = 'metalurgia',
    category,
    title,
    organizacao,
    periodo,
    areaLabel,
    kpis,
    equipmentRows,
    driverRows,
    shiftRows,
    records,
    scheme,
    fuelKpis,
    explorationEquipRows = [],
    explorationAreaRows = [],
  } = params;

  const moduleLabel =
    moduleId === 'exploracao' ? 'Módulo: EXPLORAÇÃO' : 'Módulo: METALURGIA';

  const summaryHeaderCells = [
    `Entradas: ${kpis.totalEntradas}`,
    `Permanência: ${formatHMS(kpis.permanenciaSeg)}`,
    `Operação Motor: ${formatHMS(kpis.utilizacaoSeg)}`,
    `Trabalho Efetivo: ${formatHMS(kpis.produtivoSeg)}`,
    `Relanti: ${formatHMS(kpis.relantiSeg)}`,
    `Eficiência: ${kpis.eficienciaEfetivaPct.toFixed(1).replace('.', ',')}%`,
  ];

  if (moduleId === 'exploracao' && fuelKpis) {
    summaryHeaderCells.push(
      `Combustível Operação: ${fuelKpis.combustivelOperacaoLitros.toFixed(1).replace('.', ',')} L (${fuelKpis.taxaMediaOperacaoLh.toFixed(1).replace('.', ',')} L/h)`,
      `Combustível Relanti: ${fuelKpis.combustivelRelantiLitros.toFixed(1).replace('.', ',')} L (${fuelKpis.taxaMediaRelantiLh.toFixed(1).replace('.', ',')} L/h)`,
      `Combustível Total: ${fuelKpis.combustivelTotalLitros.toFixed(1).replace('.', ',')} L`,
      `Média Motor: ${fuelKpis.consumoMedioUtilizacaoLh.toFixed(1).replace('.', ',')} L/h`
    );
  }

  const lines: string[] = [
    [title, organizacao, moduleLabel, `Área: ${areaLabel}`, `Período: ${periodo}`]
      .map(escapeCsvCell)
      .join(';'),
    summaryHeaderCells.map(escapeCsvCell).join(';'),
    '',
  ];

  if (
    moduleId === 'exploracao' &&
    (category === 'optimization' || category === 'executive')
  ) {
    lines.push('OPTIMIZAÇÃO & CONSUMO DE COMBUSTÍVEL POR EQUIPAMENTO (L/h)');
    lines.push(
      [
        'Equipamento',
        'Categoria',
        'Entradas',
        'Permanencia',
        'Trabalho_Efetivo',
        'Relanti',
        'Parado',
        'Taxa_Operacao_Lh',
        'Combustivel_Operacao_L',
        'Taxa_Relanti_Lh',
        'Combustivel_Relanti_L',
        'Combustivel_Total_L',
        'Consumo_Medio_Motor_Lh',
        'Desperdicio_Relanti_Pct',
        'Eficiencia_Pct',
        'Estado_Otimizacao',
      ].join(';')
    );
    for (const eq of explorationEquipRows) {
      lines.push(
        [
          eq.equipamento,
          eq.categoria,
          eq.entradas,
          formatHMS(eq.permanenciaSeg),
          formatHMS(eq.produtivoSeg),
          formatHMS(eq.relantiSeg),
          formatHMS(eq.paradoSeg),
          eq.operacaoLh.toFixed(1).replace('.', ','),
          eq.combustivelOperacaoLitros.toFixed(1).replace('.', ','),
          eq.relantiLh.toFixed(1).replace('.', ','),
          eq.combustivelRelantiLitros.toFixed(1).replace('.', ','),
          eq.combustivelTotalLitros.toFixed(1).replace('.', ','),
          eq.consumoMedioUtilizacaoLh.toFixed(1).replace('.', ','),
          `${eq.pctDesperdicioCombustivel.toFixed(1).replace('.', ',')}%`,
          `${eq.eficienciaEfetivaPct.toFixed(1).replace('.', ',')}%`,
          eq.nivelOtimizacao,
        ]
          .map(escapeCsvCell)
          .join(';')
      );
    }
    lines.push('');

    if (explorationAreaRows.length > 0) {
      lines.push('DESEMPENHO & GARGALOS POR ÁREA OPERACIONAL');
      lines.push(
        [
          'Area',
          'Entradas',
          'Equipamentos',
          'Permanencia',
          'Trabalho_Efetivo',
          'Relanti',
          'Parado',
          'Media_Ciclo',
          'Combustivel_Operacao_L',
          'Combustivel_Relanti_L',
          'Combustivel_Total_L',
          'Eficiencia_Pct',
        ].join(';')
      );
      for (const ar of explorationAreaRows) {
        lines.push(
          [
            ar.area,
            ar.entradas,
            ar.equipamentosCount,
            formatHMS(ar.permanenciaSeg),
            formatHMS(ar.produtivoSeg),
            formatHMS(ar.relantiSeg),
            formatHMS(ar.paradoSeg),
            formatHMS(ar.mediaCicloSeg),
            ar.combustivelOperacaoLitros.toFixed(1).replace('.', ','),
            ar.combustivelRelantiLitros.toFixed(1).replace('.', ','),
            ar.combustivelTotalLitros.toFixed(1).replace('.', ','),
            `${ar.eficienciaEfetivaPct.toFixed(1).replace('.', ',')}%`,
          ]
            .map(escapeCsvCell)
            .join(';')
        );
      }
      lines.push('');
    }
  }

  if (category === 'equipment' || category === 'executive') {
    if (category === 'executive') lines.push('EQUIPAMENTOS POR ÁREA');
    lines.push(
      [
        'Equipamento',
        'Área',
        'Entradas_Area',
        'Condutores',
        'Permanencia',
        'Operacao_Motor',
        'Trabalho_Efetivo',
        'Relanti',
        'Distancia_h',
        'Eficiencia_Pct',
      ].join(';')
    );
    for (const r of equipmentRows) {
      lines.push(
        [
          r.equipamento,
          r.area,
          r.entradas,
          r.condutoresCount,
          formatHMS(r.permanenciaSeg),
          formatHMS(r.utilizacaoSeg),
          formatHMS(r.produtivoSeg),
          formatHMS(r.relantiSeg),
          r.distanciaHoras.toFixed(1).replace('.', ','),
          `${r.eficienciaEfetivaPct.toFixed(1).replace('.', ',')}%`,
        ]
          .map(escapeCsvCell)
          .join(';')
      );
    }
    if (category === 'executive') lines.push('');
  }

  if (category === 'drivers' || category === 'executive') {
    if (category === 'executive') lines.push('DESEMPENHO DOS CONDUTORES');
    lines.push(
      [
        'Condutor',
        'Codigo',
        'Equipamentos',
        'Turnos',
        'Entradas',
        'Permanencia',
        'Operacao_Motor',
        'Trabalho_Efetivo',
        'Relanti',
        'Parado',
        'Eficiencia_Pct',
      ].join(';')
    );
    for (const d of driverRows) {
      lines.push(
        [
          d.condutorNome,
          d.condutorCodigo,
          d.equipamentos.join(', '),
          d.turnos.join(', '),
          d.entradas,
          formatHMS(d.permanenciaSeg),
          formatHMS(d.utilizacaoSeg),
          formatHMS(d.produtivoSeg),
          formatHMS(d.relantiSeg),
          formatHMS(d.paradoSeg),
          `${d.eficienciaEfetivaPct.toFixed(1).replace('.', ',')}%`,
        ]
          .map(escapeCsvCell)
          .join(';')
      );
    }
    if (category === 'executive') lines.push('');
  }

  if (category === 'shifts' || category === 'executive') {
    if (category === 'executive') lines.push('EFICIÊNCIA POR TURNO DE TRABALHO');
    lines.push(
      [
        'Turno',
        'Janela',
        'Entradas',
        'Equipamentos',
        'Permanencia',
        'Operacao_Motor',
        'Trabalho_Efetivo',
        'Relanti',
        'Parado',
        'Eficiencia_Pct',
      ].join(';')
    );
    for (const s of shiftRows) {
      lines.push(
        [
          s.label,
          s.windowLabel,
          s.entradas,
          s.equipamentosCount,
          formatHMS(s.permanenciaSeg),
          formatHMS(s.utilizacaoSeg),
          formatHMS(s.produtivoSeg),
          formatHMS(s.relantiSeg),
          formatHMS(s.paradoSeg),
          `${s.eficienciaEfetivaPct.toFixed(1).replace('.', ',')}%`,
        ]
          .map(escapeCsvCell)
          .join(';')
      );
    }
  }

  if (category === 'summary') {
    return generatePowerBICSV(records, scheme);
  }

  lines.push('', escapeCsvCell(OFFICIAL_REPORT_FOOTER));
  return '\uFEFF' + lines.join('\r\n');
}

export function generateInstitutionalReportExcelHtml(params: {
  moduleId?: FleetModuleId;
  category: ReportCategory;
  title: string;
  organizacao: string;
  periodo: string;
  areaLabel: string;
  generatedAt: string;
  kpis: GlobalKPIs;
  equipmentRows: EquipmentAreaMetrics[];
  driverRows: DriverMetrics[];
  shiftRows: ShiftMetrics[];
  records: FleetCycleRecord[];
  scheme: ShiftScheme;
  fuelKpis?: FuelGlobalKPIs;
  explorationEquipRows?: ExplorationEquipmentMetric[];
  explorationAreaRows?: ExplorationAreaMetric[];
}): string {
  const {
    moduleId = 'metalurgia',
    category,
    title,
    organizacao,
    periodo,
    areaLabel,
    generatedAt,
    kpis,
    equipmentRows,
    driverRows,
    shiftRows,
    records,
    scheme,
    fuelKpis,
    explorationEquipRows = [],
    explorationAreaRows = [],
  } = params;

  const moduleBadgeLabel =
    moduleId === 'exploracao'
      ? 'EXPLORAÇÃO — Optimização das Operações'
      : 'METALURGIA';

  const thStyle =
    'background:#EA580C;color:#FFFFFF;font-weight:bold;padding:6px 10px;border:1px solid #FDBA74;text-align:left;';
  const tdStyle = 'padding:5px 10px;border:1px solid #E2E8F0;color:#0F172A;';

  const sections: string[] = [];

  if (
    moduleId === 'exploracao' &&
    (category === 'optimization' || category === 'executive')
  ) {
    sections.push(`
      <h3 style="color:#9A3412;margin-top:16px;">Consumo de Combustível (L/h) & Optimização por Equipamento</h3>
      <table style="border-collapse:collapse;width:100%;font-size:12px;">
        <thead><tr>
          <th style="${thStyle}">Equipamento</th>
          <th style="${thStyle}">Categoria</th>
          <th style="${thStyle}">Entradas</th>
          <th style="${thStyle}">Trabalho Efetivo</th>
          <th style="${thStyle}">Relanti</th>
          <th style="${thStyle}">Parado</th>
          <th style="${thStyle}">Taxa Oper. (L/h)</th>
          <th style="${thStyle}">Gasto Oper. (L)</th>
          <th style="${thStyle}">Taxa Relanti (L/h)</th>
          <th style="${thStyle}">Gasto Relanti (L)</th>
          <th style="${thStyle}">Total Comb. (L)</th>
          <th style="${thStyle}">Média Motor (L/h)</th>
          <th style="${thStyle}">% Relanti Comb.</th>
          <th style="${thStyle}">Estado</th>
        </tr></thead>
        <tbody>
          ${explorationEquipRows
            .map(
              (eq) => `<tr>
                <td style="${tdStyle}"><strong>${escapeHtmlCell(eq.equipamento)}</strong></td>
                <td style="${tdStyle}">${escapeHtmlCell(eq.categoria)}</td>
                <td style="${tdStyle}">${eq.entradas}</td>
                <td style="${tdStyle}">${formatHMS(eq.produtivoSeg)}</td>
                <td style="${tdStyle}">${formatHMS(eq.relantiSeg)}</td>
                <td style="${tdStyle}">${formatHMS(eq.paradoSeg)}</td>
                <td style="${tdStyle}">${eq.operacaoLh.toFixed(1).replace('.', ',')}</td>
                <td style="${tdStyle}">${eq.combustivelOperacaoLitros.toFixed(1).replace('.', ',')}</td>
                <td style="${tdStyle}">${eq.relantiLh.toFixed(1).replace('.', ',')}</td>
                <td style="${tdStyle}">${eq.combustivelRelantiLitros.toFixed(1).replace('.', ',')}</td>
                <td style="${tdStyle}"><strong>${eq.combustivelTotalLitros.toFixed(1).replace('.', ',')}</strong></td>
                <td style="${tdStyle}">${eq.consumoMedioUtilizacaoLh.toFixed(1).replace('.', ',')}</td>
                <td style="${tdStyle}">${eq.pctDesperdicioCombustivel.toFixed(1).replace('.', ',')}%</td>
                <td style="${tdStyle}">${escapeHtmlCell(eq.nivelOtimizacao)}</td>
              </tr>`
            )
            .join('')}
        </tbody>
      </table>
    `);

    if (explorationAreaRows.length > 0) {
      sections.push(`
        <h3 style="color:#9A3412;margin-top:16px;">Desempenho & Consumo por Área Operacional</h3>
        <table style="border-collapse:collapse;width:100%;font-size:12px;">
          <thead><tr>
            <th style="${thStyle}">Área</th>
            <th style="${thStyle}">Entradas</th>
            <th style="${thStyle}">Equipamentos</th>
            <th style="${thStyle}">Permanência</th>
            <th style="${thStyle}">Trabalho Efetivo</th>
            <th style="${thStyle}">Relanti</th>
            <th style="${thStyle}">Gasto Oper. (L)</th>
            <th style="${thStyle}">Gasto Relanti (L)</th>
            <th style="${thStyle}">Total Comb. (L)</th>
            <th style="${thStyle}">Eficiência</th>
          </tr></thead>
          <tbody>
            ${explorationAreaRows
              .map(
                (ar) => `<tr>
                  <td style="${tdStyle}">${escapeHtmlCell(ar.area)}</td>
                  <td style="${tdStyle}">${ar.entradas}</td>
                  <td style="${tdStyle}">${ar.equipamentosCount}</td>
                  <td style="${tdStyle}">${formatHMS(ar.permanenciaSeg)}</td>
                  <td style="${tdStyle}">${formatHMS(ar.produtivoSeg)}</td>
                  <td style="${tdStyle}">${formatHMS(ar.relantiSeg)}</td>
                  <td style="${tdStyle}">${ar.combustivelOperacaoLitros.toFixed(1).replace('.', ',')}</td>
                  <td style="${tdStyle}">${ar.combustivelRelantiLitros.toFixed(1).replace('.', ',')}</td>
                  <td style="${tdStyle}"><strong>${ar.combustivelTotalLitros.toFixed(1).replace('.', ',')}</strong></td>
                  <td style="${tdStyle}">${ar.eficienciaEfetivaPct.toFixed(1).replace('.', ',')}%</td>
                </tr>`
              )
              .join('')}
          </tbody>
        </table>
      `);
    }
  }

  if (category === 'equipment' || category === 'executive') {
    sections.push(`
      <h3 style="color:#9A3412;margin-top:16px;">Equipamentos por Área Selecionada</h3>
      <table style="border-collapse:collapse;width:100%;font-size:12px;">
        <thead><tr>
          <th style="${thStyle}">Equipamento</th>
          <th style="${thStyle}">Área</th>
          <th style="${thStyle}">Entradas</th>
          <th style="${thStyle}">Condutores</th>
          <th style="${thStyle}">Permanência</th>
          <th style="${thStyle}">Operação Motor</th>
          <th style="${thStyle}">Trabalho Efetivo</th>
          <th style="${thStyle}">Relanti</th>
          <th style="${thStyle}">Distância (h)</th>
          <th style="${thStyle}">Eficiência</th>
        </tr></thead>
        <tbody>
          ${equipmentRows
            .map(
              (r) => `<tr>
                <td style="${tdStyle}">${escapeHtmlCell(r.equipamento)}</td>
                <td style="${tdStyle}">${escapeHtmlCell(r.area)}</td>
                <td style="${tdStyle}">${r.entradas}</td>
                <td style="${tdStyle}">${r.condutoresCount}</td>
                <td style="${tdStyle}">${formatHMS(r.permanenciaSeg)}</td>
                <td style="${tdStyle}">${formatHMS(r.utilizacaoSeg)}</td>
                <td style="${tdStyle}">${formatHMS(r.produtivoSeg)}</td>
                <td style="${tdStyle}">${formatHMS(r.relantiSeg)}</td>
                <td style="${tdStyle}">${r.distanciaHoras.toFixed(1).replace('.', ',')}</td>
                <td style="${tdStyle}">${r.eficienciaEfetivaPct.toFixed(1).replace('.', ',')}%</td>
              </tr>`
            )
            .join('')}
        </tbody>
      </table>
    `);
  }

  if (category === 'drivers' || category === 'executive') {
    sections.push(`
      <h3 style="color:#9A3412;margin-top:16px;">Desempenho dos Condutores</h3>
      <table style="border-collapse:collapse;width:100%;font-size:12px;">
        <thead><tr>
          <th style="${thStyle}">Condutor</th>
          <th style="${thStyle}">Código</th>
          <th style="${thStyle}">Equipamentos</th>
          <th style="${thStyle}">Entradas</th>
          <th style="${thStyle}">Permanência</th>
          <th style="${thStyle}">Operação Motor</th>
          <th style="${thStyle}">Trabalho Efetivo</th>
          <th style="${thStyle}">Relanti</th>
          <th style="${thStyle}">Parado</th>
          <th style="${thStyle}">Eficiência</th>
        </tr></thead>
        <tbody>
          ${driverRows
            .map(
              (d) => `<tr>
                <td style="${tdStyle}">${escapeHtmlCell(d.condutorNome)}</td>
                <td style="${tdStyle}">${escapeHtmlCell(d.condutorCodigo)}</td>
                <td style="${tdStyle}">${escapeHtmlCell(d.equipamentos.join(', '))}</td>
                <td style="${tdStyle}">${d.entradas}</td>
                <td style="${tdStyle}">${formatHMS(d.permanenciaSeg)}</td>
                <td style="${tdStyle}">${formatHMS(d.utilizacaoSeg)}</td>
                <td style="${tdStyle}">${formatHMS(d.produtivoSeg)}</td>
                <td style="${tdStyle}">${formatHMS(d.relantiSeg)}</td>
                <td style="${tdStyle}">${formatHMS(d.paradoSeg)}</td>
                <td style="${tdStyle}">${d.eficienciaEfetivaPct.toFixed(1).replace('.', ',')}%</td>
              </tr>`
            )
            .join('')}
        </tbody>
      </table>
    `);
  }

  if (category === 'shifts' || category === 'executive') {
    sections.push(`
      <h3 style="color:#9A3412;margin-top:16px;">Eficiência por Turno de Trabalho</h3>
      <table style="border-collapse:collapse;width:100%;font-size:12px;">
        <thead><tr>
          <th style="${thStyle}">Turno</th>
          <th style="${thStyle}">Janela</th>
          <th style="${thStyle}">Entradas</th>
          <th style="${thStyle}">Equipamentos</th>
          <th style="${thStyle}">Permanência</th>
          <th style="${thStyle}">Operação Motor</th>
          <th style="${thStyle}">Trabalho Efetivo</th>
          <th style="${thStyle}">Relanti</th>
          <th style="${thStyle}">Parado</th>
          <th style="${thStyle}">Eficiência</th>
        </tr></thead>
        <tbody>
          ${shiftRows
            .map(
              (s) => `<tr>
                <td style="${tdStyle}">${escapeHtmlCell(s.label)}</td>
                <td style="${tdStyle}">${escapeHtmlCell(s.windowLabel)}</td>
                <td style="${tdStyle}">${s.entradas}</td>
                <td style="${tdStyle}">${s.equipamentosCount}</td>
                <td style="${tdStyle}">${formatHMS(s.permanenciaSeg)}</td>
                <td style="${tdStyle}">${formatHMS(s.utilizacaoSeg)}</td>
                <td style="${tdStyle}">${formatHMS(s.produtivoSeg)}</td>
                <td style="${tdStyle}">${formatHMS(s.relantiSeg)}</td>
                <td style="${tdStyle}">${formatHMS(s.paradoSeg)}</td>
                <td style="${tdStyle}">${s.eficienciaEfetivaPct.toFixed(1).replace('.', ',')}%</td>
              </tr>`
            )
            .join('')}
        </tbody>
      </table>
    `);
  }

  if (category === 'summary') {
    sections.push(`
      <h3 style="color:#9A3412;margin-top:16px;">Registos do Relatório Principal (Página Resumo)</h3>
      <table style="border-collapse:collapse;width:100%;font-size:12px;">
        <thead><tr>
          <th style="${thStyle}">Nº</th>
          <th style="${thStyle}">Data</th>
          <th style="${thStyle}">Turno</th>
          <th style="${thStyle}">Equipamento</th>
          <th style="${thStyle}">Condutor</th>
          <th style="${thStyle}">Entrada</th>
          <th style="${thStyle}">Saída</th>
          <th style="${thStyle}">Entradas</th>
          <th style="${thStyle}">Duração</th>
          <th style="${thStyle}">Utilização</th>
          <th style="${thStyle}">Relanti</th>
          <th style="${thStyle}">Parado</th>
          <th style="${thStyle}">Área</th>
        </tr></thead>
        <tbody>
          ${records
            .map((r) => {
              const shift = getShiftMeta(r.horaEntrada, scheme);
              return `<tr>
                <td style="${tdStyle}">${r.numero}</td>
                <td style="${tdStyle}">${escapeHtmlCell(r.data)}</td>
                <td style="${tdStyle}">${escapeHtmlCell(shift.label)}</td>
                <td style="${tdStyle}">${escapeHtmlCell(r.equipamento)}</td>
                <td style="${tdStyle}">${escapeHtmlCell(r.condutorCompleto)}</td>
                <td style="${tdStyle}">${escapeHtmlCell(r.entrada)}</td>
                <td style="${tdStyle}">${escapeHtmlCell(r.saida)}</td>
                <td style="${tdStyle}">${getEntryCount(r)}</td>
                <td style="${tdStyle}">${formatHMS(r.duracaoSeg)}</td>
                <td style="${tdStyle}">${formatHMS(r.utilizacaoSeg)}</td>
                <td style="${tdStyle}">${formatHMS(r.relantiSeg)}</td>
                <td style="${tdStyle}">${formatHMS(r.paradoSeg)}</td>
                <td style="${tdStyle}">${escapeHtmlCell(r.area)}</td>
              </tr>`;
            })
            .join('')}
        </tbody>
      </table>
    `);
  }

  return `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8" />
<title>${escapeHtmlCell(title)}</title>
</head>
<body style="font-family:Arial,sans-serif;color:#0F172A;background:#FFFFFF;padding:24px;">
  <h2 style="color:#EA580C;margin:0;">${escapeHtmlCell(title)}</h2>
  <p style="font-size:12px;color:#475569;margin:4px 0 12px 0;">
    ${escapeHtmlCell(organizacao)} · <strong>${escapeHtmlCell(moduleBadgeLabel)}</strong> · Área: ${escapeHtmlCell(areaLabel)} · Período: ${escapeHtmlCell(periodo)} · Gerado em: ${escapeHtmlCell(generatedAt)}
  </p>
  <table style="border-collapse:collapse;margin-bottom:16px;font-size:12px;">
    <tr>
      <td style="padding:6px 12px;border:1px solid #FED7AA;background:#FFF7ED;"><strong>Entradas:</strong> ${kpis.totalEntradas}</td>
      <td style="padding:6px 12px;border:1px solid #FED7AA;background:#FFF7ED;"><strong>Permanência:</strong> ${formatHMS(kpis.permanenciaSeg)}</td>
      <td style="padding:6px 12px;border:1px solid #FED7AA;background:#FFF7ED;"><strong>Operação Motor:</strong> ${formatHMS(kpis.utilizacaoSeg)}</td>
      <td style="padding:6px 12px;border:1px solid #FED7AA;background:#FFF7ED;"><strong>Eficiência Efetiva:</strong> ${kpis.eficienciaEfetivaPct.toFixed(1).replace('.', ',')}%</td>
      ${
        moduleId === 'exploracao' && fuelKpis
          ? `<td style="padding:6px 12px;border:1px solid #FED7AA;background:#FFF7ED;"><strong>Combustível Operação:</strong> ${fuelKpis.combustivelOperacaoLitros.toFixed(1).replace('.', ',')} L (${fuelKpis.taxaMediaOperacaoLh.toFixed(1).replace('.', ',')} L/h)</td>
             <td style="padding:6px 12px;border:1px solid #FED7AA;background:#FFF7ED;"><strong>Combustível Relanti:</strong> ${fuelKpis.combustivelRelantiLitros.toFixed(1).replace('.', ',')} L (${fuelKpis.taxaMediaRelantiLh.toFixed(1).replace('.', ',')} L/h)</td>
             <td style="padding:6px 12px;border:1px solid #FED7AA;background:#FFF7ED;"><strong>Total Combustível:</strong> ${fuelKpis.combustivelTotalLitros.toFixed(1).replace('.', ',')} L</td>`
          : ''
      }
    </tr>
  </table>
  ${sections.join('\n')}
  <p style="margin-top:24px;padding-top:12px;border-top:1px solid #FED7AA;font-size:11px;color:#475569;">
    ${escapeHtmlCell(OFFICIAL_REPORT_FOOTER)}
  </p>
</body>
</html>`;
}

export function generatePowerQueryM(feedUrl: string): string {
  return `let
    Fonte = Json.Document(Web.Contents("${feedUrl}")),
    Registros = Fonte[records],
    Tabela = Table.FromList(Registros, Splitter.SplitByNothing(), null, null, ExtraValues.Error),
    Expandido = Table.ExpandRecordColumn(Tabela, "Column1", {
        "numero", "data", "horaEntrada", "turno", "equipamento", "area",
        "condutorNome", "condutorCodigo", "entrada", "saida", "inicio", "fim",
        "entradasCount", "duracaoSeg", "utilizacaoSeg", "produtivoSeg",
        "relantiSeg", "paradoSeg", "distanciaHoras"
    }),
    TiposDefinidos = Table.TransformColumnTypes(Expandido, {
        {"numero", Int64.Type},
        {"data", type text},
        {"horaEntrada", Int64.Type},
        {"turno", type text},
        {"equipamento", type text},
        {"area", type text},
        {"condutorNome", type text},
        {"condutorCodigo", type text},
        {"entrada", type text},
        {"saida", type text},
        {"inicio", type text},
        {"fim", type text},
        {"entradasCount", Int64.Type},
        {"duracaoSeg", Int64.Type},
        {"utilizacaoSeg", Int64.Type},
        {"produtivoSeg", Int64.Type},
        {"relantiSeg", Int64.Type},
        {"paradoSeg", Int64.Type},
        {"distanciaHoras", type number}
    }),
    AdicionarHorasOperacao = Table.AddColumn(TiposDefinidos, "Horas_Operacao", each [utilizacaoSeg] / 3600, type number),
    AdicionarHorasEfetivas = Table.AddColumn(AdicionarHorasOperacao, "Horas_Produtivas", each [produtivoSeg] / 3600, type number)
in
    AdicionarHorasEfetivas`;
}

export function generateDAXMeasures(): string {
  return `// ==========================================================
// Medidas DAX — Cuango Fleet BI (Tabela: Frota_Resumo)
// ==========================================================

1. Entradas na Área Selecionada =
SUM(Frota_Resumo[entradasCount])

2. Tempo Total na Área (Segundos) =
SUM(Frota_Resumo[duracaoSeg])

3. Tempo Total na Área (HH:MM:SS) =
VAR TotalSeg = [Tempo Total na Área (Segundos)]
VAR H = INT(TotalSeg / 3600)
VAR M = INT(MOD(TotalSeg, 3600) / 60)
VAR S = MOD(TotalSeg, 60)
RETURN
FORMAT(H, "00") & ":" & FORMAT(M, "00") & ":" & FORMAT(S, "00")

4. Tempo Total de Operação / Motor Ligado (HH:MM:SS) =
VAR TotalSeg = SUM(Frota_Resumo[utilizacaoSeg])
VAR H = INT(TotalSeg / 3600)
VAR M = INT(MOD(TotalSeg, 3600) / 60)
VAR S = MOD(TotalSeg, 60)
RETURN
FORMAT(H, "00") & ":" & FORMAT(M, "00") & ":" & FORMAT(S, "00")

5. Tempo Produtivo Líquido (Sem Relanti) =
SUM(Frota_Resumo[produtivoSeg])

6. Eficiência Operacional Efetiva % =
DIVIDE(
    SUM(Frota_Resumo[produtivoSeg]),
    SUM(Frota_Resumo[duracaoSeg]),
    0
)

7. Taxa de Relanti (Marcha Lenta) % =
DIVIDE(
    SUM(Frota_Resumo[relantiSeg]),
    SUM(Frota_Resumo[utilizacaoSeg]),
    0
)

8. Média de Permanência por Entrada (Min) =
DIVIDE(
    DIVIDE([Tempo Total na Área (Segundos)], [Entradas na Área Selecionada], 0),
    60,
    0
)`;
}

export function normalizeFileName(name: string): string {
  const base = (name || '').trim().split(/[\\/]/).pop() ?? '';
  return base.toLowerCase();
}

export function canonicalFileName(name: string): string {
  const norm = normalizeFileName(name);
  return norm
    .replace(/_[0-9a-f]{8}(?=\.pdf$)/i, '')
    .replace(/\s*\(\d+\)(?=\.pdf$)/i, '');
}

export function getKnownFileNames(dataset: FleetDataset): Set<string> {
  const names = new Set<string>();
  const add = (raw?: string) => {
    if (!raw) return;
    const norm = normalizeFileName(raw);
    const canon = canonicalFileName(raw);
    if (norm) names.add(norm);
    if (canon) names.add(canon);
  };

  for (const part of (dataset.metadata.arquivoOrigem || '').split(' + ')) {
    add(part);
  }
  for (const r of dataset.records) {
    add(r.origemArquivo);
  }
  for (const c of dataset.detailCycles ?? []) {
    add(c.origemArquivo);
  }
  return names;
}

export function isDuplicateFileName(
  dataset: FleetDataset,
  fileName: string
): boolean {
  const norm = normalizeFileName(fileName);
  const canon = canonicalFileName(fileName);
  if (!norm && !canon) return false;
  const known = getKnownFileNames(dataset);
  return known.has(norm) || known.has(canon);
}

export function getRecordFingerprint(r: FleetCycleRecord): string {
  const section = r.sourceSection ?? 'resumo';
  const normCondutor = r.condutorCompleto
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\s*\(/g, ' (')
    .toUpperCase();

  const parts: Array<string | number> = [
    section,
    r.data.trim(),
    r.equipamento.trim().toUpperCase(),
    normCondutor,
    r.entrada.trim(),
    r.saida.trim(),
    r.duracaoSeg,
    r.utilizacaoSeg,
    r.relantiSeg,
    r.paradoSeg,
    r.area.trim().toUpperCase(),
  ];

  if (section === 'resumo') {
    parts.push((r.inicio ?? '').trim(), (r.fim ?? '').trim(), getEntryCount(r));
  }

  return parts.join('|');
}

export function deduplicateCycleRecords(records: FleetCycleRecord[]): {
  unique: FleetCycleRecord[];
  removedCount: number;
} {
  const seen = new Set<string>();
  const unique: FleetCycleRecord[] = [];
  let removedCount = 0;

  for (const r of records) {
    const fp = getRecordFingerprint(r);
    if (seen.has(fp)) {
      removedCount++;
      continue;
    }
    seen.add(fp);
    unique.push(r);
  }

  return { unique, removedCount };
}

export function deduplicateDataset(dataset: FleetDataset): {
  dataset: FleetDataset;
  removedRecords: number;
  removedDetails: number;
} {
  const resDedupe = deduplicateCycleRecords(dataset.records);
  const detDedupe = dataset.detailCycles
    ? deduplicateCycleRecords(dataset.detailCycles)
    : { unique: undefined, removedCount: 0 };

  const uniqueOrigins = Array.from(
    new Set(
      (dataset.metadata.arquivoOrigem || '')
        .split(' + ')
        .map((s) => s.trim())
        .filter(Boolean)
    )
  ).join(' + ');

  const uniqueEquipFilter = Array.from(
    new Set(dataset.metadata.equipamentosNoFiltro)
  );

  return {
    dataset: {
      metadata: {
        ...dataset.metadata,
        equipamentosNoFiltro: uniqueEquipFilter,
        arquivoOrigem: uniqueOrigins || dataset.metadata.arquivoOrigem,
      },
      records: resDedupe.unique,
      detailCycles: detDedupe.unique,
    },
    removedRecords: resDedupe.removedCount,
    removedDetails: detDedupe.removedCount,
  };
}

export interface MergeDatasetsResult {
  merged: FleetDataset;
  duplicateFile: boolean;
  duplicateAllData: boolean;
  addedResumoCount: number;
  addedDetailCount: number;
  skippedDuplicateCount: number;
}

export function mergeDatasetsWithoutDuplicates(
  existing: FleetDataset,
  incoming: FleetDataset
): MergeDatasetsResult {
  const cleanExisting = deduplicateDataset(existing).dataset;
  const cleanIncoming = deduplicateDataset(incoming).dataset;

  if (isDuplicateFileName(cleanExisting, cleanIncoming.metadata.arquivoOrigem)) {
    return {
      merged: cleanExisting,
      duplicateFile: true,
      duplicateAllData: true,
      addedResumoCount: 0,
      addedDetailCount: 0,
      skippedDuplicateCount: cleanIncoming.records.length,
    };
  }

  const existingResumoFps = new Set(
    cleanExisting.records.map((r) => getRecordFingerprint(r))
  );
  const newResumo: FleetCycleRecord[] = [];
  let skippedResumo = 0;

  for (const r of cleanIncoming.records) {
    const fp = getRecordFingerprint(r);
    if (existingResumoFps.has(fp)) {
      skippedResumo++;
      continue;
    }
    existingResumoFps.add(fp);
    newResumo.push(r);
  }

  const existingDetailFps = new Set(
    (cleanExisting.detailCycles ?? []).map((c) => getRecordFingerprint(c))
  );
  const newDetails: FleetCycleRecord[] = [];
  let skippedDetails = 0;

  for (const c of cleanIncoming.detailCycles ?? []) {
    const fp = getRecordFingerprint(c);
    if (existingDetailFps.has(fp)) {
      skippedDetails++;
      continue;
    }
    existingDetailFps.add(fp);
    newDetails.push(c);
  }

  if (newResumo.length === 0 && newDetails.length === 0) {
    return {
      merged: cleanExisting,
      duplicateFile: false,
      duplicateAllData: true,
      addedResumoCount: 0,
      addedDetailCount: 0,
      skippedDuplicateCount: skippedResumo || cleanIncoming.records.length,
    };
  }

  const mergedRecords = [...cleanExisting.records, ...newResumo];
  const mergedDetailCycles =
    cleanExisting.detailCycles || newDetails.length > 0
      ? [...(cleanExisting.detailCycles ?? []), ...newDetails]
      : undefined;

  const mergedEquipFilter = Array.from(
    new Set([
      ...cleanExisting.metadata.equipamentosNoFiltro,
      ...cleanIncoming.metadata.equipamentosNoFiltro,
    ])
  );

  const mergedOrigins = Array.from(
    new Set([
      ...cleanExisting.metadata.arquivoOrigem
        .split(' + ')
        .map((s) => s.trim())
        .filter(Boolean),
      cleanIncoming.metadata.arquivoOrigem.trim(),
    ])
  ).join(' + ');

  return {
    merged: {
      metadata: {
        ...cleanExisting.metadata,
        dataFim: cleanIncoming.metadata.dataFim || cleanExisting.metadata.dataFim,
        areaSelecionada: Array.from(
          new Set(mergedRecords.map((r) => r.area))
        ).join(', '),
        equipamentosNoFiltro: mergedEquipFilter,
        arquivoOrigem: mergedOrigins,
      },
      records: mergedRecords,
      detailCycles: mergedDetailCycles,
    },
    duplicateFile: false,
    duplicateAllData: false,
    addedResumoCount: newResumo.length,
    addedDetailCount: newDetails.length,
    skippedDuplicateCount: skippedResumo + skippedDetails,
  };
}

// ============================================================================
// Módulo Exploração — Optimização das Operações & Consumo de Combustível (L/h)
// ============================================================================

export function inferDefaultFuelProfile(equipamento: string): EquipmentFuelProfile {
  const eq = (equipamento || '').trim().toUpperCase();

  if (eq.startsWith('745-')) {
    return { equipamento, categoria: 'Dumper Articulado 745', operacaoLh: 28.5, relantiLh: 6.2 };
  }
  if (eq.startsWith('740-')) {
    return { equipamento, categoria: 'Dumper Articulado 740', operacaoLh: 24.5, relantiLh: 5.5 };
  }
  if (eq.startsWith('375-')) {
    return { equipamento, categoria: 'Escavadora Pesada 375', operacaoLh: 36.0, relantiLh: 7.5 };
  }
  if (eq.startsWith('D10-')) {
    return { equipamento, categoria: 'Trator de Rastos D10', operacaoLh: 42.0, relantiLh: 8.5 };
  }
  if (eq.startsWith('155-')) {
    return { equipamento, categoria: 'Trator de Rastos 155', operacaoLh: 34.0, relantiLh: 7.0 };
  }
  if (eq.startsWith('PC80') || eq.startsWith('PCX9') || eq.startsWith('PCX8') || eq.startsWith('PC66')) {
    return { equipamento, categoria: 'Escavadora / Pá Carregadora', operacaoLh: 26.0, relantiLh: 5.8 };
  }
  if (eq.startsWith('SLB') || eq.startsWith('SST') || eq.startsWith('SX') || eq.startsWith('S90') || eq.startsWith('S60')) {
    return { equipamento, categoria: 'Camião Basculante Pesado', operacaoLh: 22.0, relantiLh: 4.8 };
  }
  if (eq.startsWith('B11')) {
    return { equipamento, categoria: 'Carregadora / Apoio', operacaoLh: 19.5, relantiLh: 4.4 };
  }
  if (eq.startsWith('LZ')) {
    return { equipamento, categoria: 'Equipamento de Mina LZ', operacaoLh: 23.0, relantiLh: 5.0 };
  }
  if (eq.startsWith('CH-') || eq.startsWith('MN-') || eq.startsWith('T-') || eq.startsWith('LD') || eq.startsWith('NX')) {
    return { equipamento, categoria: 'Transporte / Apoio Operacional', operacaoLh: 16.5, relantiLh: 3.8 };
  }

  return {
    equipamento,
    categoria: 'Pesado Exploração',
    operacaoLh: 22.0,
    relantiLh: 5.0,
  };
}

export function resolveFuelProfile(
  equipamento: string,
  overrides?: Record<string, FuelRatePair>
): EquipmentFuelProfile {
  const base = inferDefaultFuelProfile(equipamento);
  const custom = overrides?.[equipamento];
  if (!custom) return base;
  return {
    ...base,
    operacaoLh:
      typeof custom.operacaoLh === 'number' && Number.isFinite(custom.operacaoLh) && custom.operacaoLh >= 0
        ? custom.operacaoLh
        : base.operacaoLh,
    relantiLh:
      typeof custom.relantiLh === 'number' && Number.isFinite(custom.relantiLh) && custom.relantiLh >= 0
        ? custom.relantiLh
        : base.relantiLh,
  };
}

export function computeFuelKPIs(
  records: FleetCycleRecord[],
  overrides?: Record<string, FuelRatePair>
): FuelGlobalKPIs {
  let produtivoSeg = 0;
  let relantiSeg = 0;
  let utilizacaoSeg = 0;
  let combustivelOperacaoLitros = 0;
  let combustivelRelantiLitros = 0;

  for (const r of records) {
    const profile = resolveFuelProfile(r.equipamento, overrides);
    const pHoras = Math.max(0, r.produtivoSeg) / 3600;
    const relHoras = Math.max(0, r.relantiSeg) / 3600;
    produtivoSeg += Math.max(0, r.produtivoSeg);
    relantiSeg += Math.max(0, r.relantiSeg);
    utilizacaoSeg += Math.max(0, r.utilizacaoSeg);
    combustivelOperacaoLitros += pHoras * profile.operacaoLh;
    combustivelRelantiLitros += relHoras * profile.relantiLh;
  }

  const horasOperacaoEfetiva = produtivoSeg / 3600;
  const horasRelanti = relantiSeg / 3600;
  const horasUtilizacaoTotal = utilizacaoSeg / 3600;
  const combustivelTotalLitros = combustivelOperacaoLitros + combustivelRelantiLitros;

  const taxaMediaOperacaoLh =
    horasOperacaoEfetiva > 0 ? combustivelOperacaoLitros / horasOperacaoEfetiva : 0;
  const taxaMediaRelantiLh =
    horasRelanti > 0 ? combustivelRelantiLitros / horasRelanti : 0;
  const consumoMedioUtilizacaoLh =
    horasUtilizacaoTotal > 0 ? combustivelTotalLitros / horasUtilizacaoTotal : 0;
  const pctDesperdicioRelanti =
    combustivelTotalLitros > 0
      ? (combustivelRelantiLitros / combustivelTotalLitros) * 100
      : 0;

  // Meta de otimização: limitar relanti a no máximo 10% do tempo de motor ligado
  const targetMaxIdleHours = horasUtilizacaoTotal * 0.1;
  const excessIdleHours = Math.max(0, horasRelanti - targetMaxIdleHours);
  const economiaPotencialLitros = excessIdleHours * taxaMediaRelantiLh;

  return {
    horasOperacaoEfetiva,
    horasRelanti,
    horasUtilizacaoTotal,
    combustivelOperacaoLitros,
    combustivelRelantiLitros,
    combustivelTotalLitros,
    taxaMediaOperacaoLh,
    taxaMediaRelantiLh,
    consumoMedioUtilizacaoLh,
    pctDesperdicioRelanti,
    economiaPotencialLitros,
  };
}

export function computeExplorationEquipmentMetrics(
  records: FleetCycleRecord[],
  overrides?: Record<string, FuelRatePair>
): ExplorationEquipmentMetric[] {
  const byEquip = new Map<string, FleetCycleRecord[]>();
  for (const r of records) {
    const list = byEquip.get(r.equipamento) ?? [];
    list.push(r);
    byEquip.set(r.equipamento, list);
  }

  const result: ExplorationEquipmentMetric[] = [];

  for (const [equipamento, list] of byEquip.entries()) {
    const profile = resolveFuelProfile(equipamento, overrides);
    const entradas = list.reduce((s, r) => s + getEntryCount(r), 0);
    const permanenciaSeg = list.reduce((s, r) => s + r.duracaoSeg, 0);
    const utilizacaoSeg = list.reduce((s, r) => s + r.utilizacaoSeg, 0);
    const produtivoSeg = list.reduce((s, r) => s + r.produtivoSeg, 0);
    const relantiSeg = list.reduce((s, r) => s + r.relantiSeg, 0);
    const paradoSeg = list.reduce((s, r) => s + r.paradoSeg, 0);
    const distanciaHoras =
      Math.round(list.reduce((s, r) => s + r.distanciaHoras, 0) * 10) / 10;

    const pHoras = produtivoSeg / 3600;
    const rHoras = relantiSeg / 3600;
    const uHoras = utilizacaoSeg / 3600;

    const combustivelOperacaoLitros = pHoras * profile.operacaoLh;
    const combustivelRelantiLitros = rHoras * profile.relantiLh;
    const combustivelTotalLitros = combustivelOperacaoLitros + combustivelRelantiLitros;
    const consumoMedioUtilizacaoLh =
      uHoras > 0 ? combustivelTotalLitros / uHoras : 0;
    const pctDesperdicioCombustivel =
      combustivelTotalLitros > 0
        ? (combustivelRelantiLitros / combustivelTotalLitros) * 100
        : 0;

    const taxaRelantiSobreUtilizacaoPct =
      utilizacaoSeg > 0 ? (relantiSeg / utilizacaoSeg) * 100 : 0;

    let nivelOtimizacao: 'Otimizado' | 'Atenção' | 'Crítico' = 'Otimizado';
    if (taxaRelantiSobreUtilizacaoPct >= 35 || combustivelRelantiLitros >= 25) {
      nivelOtimizacao = 'Crítico';
    } else if (taxaRelantiSobreUtilizacaoPct >= 20 || combustivelRelantiLitros >= 10) {
      nivelOtimizacao = 'Atenção';
    }

    result.push({
      equipamento,
      categoria: profile.categoria,
      entradas,
      areas: Array.from(new Set(list.map((r) => r.area))),
      condutores: Array.from(new Set(list.map((r) => r.condutorCompleto))),
      permanenciaSeg,
      utilizacaoSeg,
      produtivoSeg,
      relantiSeg,
      paradoSeg,
      distanciaHoras,
      eficienciaEfetivaPct:
        permanenciaSeg > 0 ? (produtivoSeg / permanenciaSeg) * 100 : 0,
      taxaRelantiSobreUtilizacaoPct,
      taxaParadoPct:
        permanenciaSeg > 0 ? (paradoSeg / permanenciaSeg) * 100 : 0,
      operacaoLh: profile.operacaoLh,
      relantiLh: profile.relantiLh,
      combustivelOperacaoLitros,
      combustivelRelantiLitros,
      combustivelTotalLitros,
      consumoMedioUtilizacaoLh,
      pctDesperdicioCombustivel,
      nivelOtimizacao,
    });
  }

  return result.sort((a, b) => b.combustivelTotalLitros - a.combustivelTotalLitros);
}

export function computeExplorationAreaMetrics(
  records: FleetCycleRecord[],
  overrides?: Record<string, FuelRatePair>
): ExplorationAreaMetric[] {
  const byArea = new Map<string, FleetCycleRecord[]>();
  for (const r of records) {
    const list = byArea.get(r.area) ?? [];
    list.push(r);
    byArea.set(r.area, list);
  }

  const result: ExplorationAreaMetric[] = [];

  for (const [area, list] of byArea.entries()) {
    const entradas = list.reduce((s, r) => s + getEntryCount(r), 0);
    const permanenciaSeg = list.reduce((s, r) => s + r.duracaoSeg, 0);
    const utilizacaoSeg = list.reduce((s, r) => s + r.utilizacaoSeg, 0);
    const produtivoSeg = list.reduce((s, r) => s + r.produtivoSeg, 0);
    const relantiSeg = list.reduce((s, r) => s + r.relantiSeg, 0);
    const paradoSeg = list.reduce((s, r) => s + r.paradoSeg, 0);

    let combustivelOperacaoLitros = 0;
    let combustivelRelantiLitros = 0;

    for (const r of list) {
      const profile = resolveFuelProfile(r.equipamento, overrides);
      combustivelOperacaoLitros += (r.produtivoSeg / 3600) * profile.operacaoLh;
      combustivelRelantiLitros += (r.relantiSeg / 3600) * profile.relantiLh;
    }

    const equipamentos = Array.from(new Set(list.map((r) => r.equipamento)));
    const condutores = Array.from(new Set(list.map((r) => r.condutorCompleto)));

    result.push({
      area,
      entradas,
      equipamentosCount: equipamentos.length,
      equipamentos,
      condutoresCount: condutores.length,
      permanenciaSeg,
      utilizacaoSeg,
      produtivoSeg,
      relantiSeg,
      paradoSeg,
      mediaCicloSeg: entradas > 0 ? Math.round(permanenciaSeg / entradas) : 0,
      eficienciaEfetivaPct:
        permanenciaSeg > 0 ? (produtivoSeg / permanenciaSeg) * 100 : 0,
      taxaRelantiSobreUtilizacaoPct:
        utilizacaoSeg > 0 ? (relantiSeg / utilizacaoSeg) * 100 : 0,
      combustivelOperacaoLitros,
      combustivelRelantiLitros,
      combustivelTotalLitros: combustivelOperacaoLitros + combustivelRelantiLitros,
    });
  }

  return result.sort((a, b) => b.permanenciaSeg - a.permanenciaSeg);
}

