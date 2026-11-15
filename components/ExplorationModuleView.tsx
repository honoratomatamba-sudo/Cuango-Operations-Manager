'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Download,
  FileBarChart2,
  Flame,
  Fuel,
  Gauge,
  MapPin,
  RotateCcw,
  Search,
  TrendingDown,
} from 'lucide-react';
import { formatHMS, getEntryCount, getShiftMeta, resolveFuelProfile } from '@/lib/fleet-analytics';
import {
  DriverMetrics,
  ExplorationAreaMetric,
  ExplorationEquipmentMetric,
  FleetCycleRecord,
  FuelGlobalKPIs,
  FuelRatePair,
  GlobalKPIs,
  HourlyBucket,
  ShiftMetrics,
  ShiftScheme,
} from '@/lib/fleet-types';
import { DriverPerformanceTable } from './DriverPerformanceTable';
import { HourlyDistributionChart } from './HourlyDistributionChart';
import { ShiftEfficiencyPanel } from './ShiftEfficiencyPanel';

interface ExplorationModuleViewProps {
  selectedAreaLabel: string;
  selectedArea: string;
  selectedEquipment: string;
  selectedDriver: string;
  selectedShiftId: string;
  selectedHour: number | null;
  shiftScheme: ShiftScheme;
  kpis: GlobalKPIs;
  fuelKpis: FuelGlobalKPIs;
  equipmentRows: ExplorationEquipmentMetric[];
  areaRows: ExplorationAreaMetric[];
  driverRows: DriverMetrics[];
  shiftRows: ShiftMetrics[];
  hourlyBuckets: HourlyBucket[];
  records: FleetCycleRecord[];
  fuelOverrides: Record<string, FuelRatePair>;
  onUpdateFuelRate: (
    equipamento: string,
    field: 'operacaoLh' | 'relantiLh',
    value: number
  ) => void;
  onResetFuelRates: () => void;
  onSelectEquipment: (equipamento: string) => void;
  onSelectArea: (area: string) => void;
  onSelectDriver: (condutor: string) => void;
  onSelectShift: (shiftId: string) => void;
  onSelectHour: (hour: number | null) => void;
  onOpenReports: () => void;
  onExportCsv: () => void;
}

type ExplorationSubTab = 'fuel_equipment' | 'areas' | 'shifts_drivers';
type SortKey = 'combustivel' | 'relanti' | 'eficiencia' | 'entradas' | 'equipamento';

function formatLiters(val: number): string {
  return val.toLocaleString('pt-PT', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

export function ExplorationModuleView({
  selectedAreaLabel,
  selectedArea,
  selectedEquipment,
  selectedDriver,
  selectedShiftId,
  selectedHour,
  shiftScheme,
  kpis,
  fuelKpis,
  equipmentRows,
  areaRows,
  driverRows,
  shiftRows,
  hourlyBuckets,
  records,
  fuelOverrides,
  onUpdateFuelRate,
  onResetFuelRates,
  onSelectEquipment,
  onSelectArea,
  onSelectDriver,
  onSelectShift,
  onSelectHour,
  onOpenReports,
  onExportCsv,
}: ExplorationModuleViewProps) {
  const [subTab, setSubTab] = useState<ExplorationSubTab>('fuel_equipment');
  const [equipQuery, setEquipQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('combustivel');

  const hasCustomRates = Object.keys(fuelOverrides).length > 0;

  const topIdleMachines = useMemo(
    () =>
      [...equipmentRows]
        .sort((a, b) => b.combustivelRelantiLitros - a.combustivelRelantiLitros)
        .slice(0, 3),
    [equipmentRows]
  );

  const topBottleneckAreas = useMemo(
    () =>
      [...areaRows]
        .sort((a, b) => b.paradoSeg - a.paradoSeg)
        .slice(0, 3),
    [areaRows]
  );

  const filteredSortedEquipments = useMemo(() => {
    const q = equipQuery.trim().toLowerCase();
    const list = q
      ? equipmentRows.filter(
          (r) =>
            r.equipamento.toLowerCase().includes(q) ||
            r.categoria.toLowerCase().includes(q) ||
            r.areas.some((a) => a.toLowerCase().includes(q))
        )
      : equipmentRows;

    return [...list].sort((a, b) => {
      if (sortKey === 'relanti') {
        return b.combustivelRelantiLitros - a.combustivelRelantiLitros;
      }
      if (sortKey === 'eficiencia') {
        return a.eficienciaEfetivaPct - b.eficienciaEfetivaPct;
      }
      if (sortKey === 'entradas') {
        return b.entradas - a.entradas;
      }
      if (sortKey === 'equipamento') {
        return a.equipamento.localeCompare(b.equipamento);
      }
      return b.combustivelTotalLitros - a.combustivelTotalLitros;
    });
  }, [equipmentRows, equipQuery, sortKey]);

  const shiftFuelBreakdown = useMemo(() => {
    const map = new Map<
      string,
      { label: string; windowLabel: string; operL: number; relL: number; entradas: number }
    >();
    for (const s of shiftRows) {
      map.set(s.shiftId, {
        label: s.label,
        windowLabel: s.windowLabel,
        operL: 0,
        relL: 0,
        entradas: 0,
      });
    }
    for (const r of records) {
      const shift = getShiftMeta(r.horaEntrada, shiftScheme);
      const bucket = map.get(shift.id);
      if (!bucket) continue;
      const profile = resolveFuelProfile(r.equipamento, fuelOverrides);
      bucket.operL += (r.produtivoSeg / 3600) * profile.operacaoLh;
      bucket.relL += (r.relantiSeg / 3600) * profile.relantiLh;
      bucket.entradas += getEntryCount(r);
    }
    return Array.from(map.entries()).map(([id, v]) => ({
      id,
      ...v,
      totalL: v.operL + v.relL,
    }));
  }, [records, shiftRows, shiftScheme, fuelOverrides]);

  const statusTextColor = (nivel: ExplorationEquipmentMetric['nivelOtimizacao']) => {
    if (nivel === 'Crítico') return 'text-red-700 font-semibold';
    if (nivel === 'Atenção') return 'text-amber-700 font-semibold';
    return 'text-emerald-700 font-semibold';
  };

  return (
    <div className="space-y-6">
      {/* 1. Fuel & Optimization KPI Strip */}
      <section aria-label="Indicadores de Combustível e Optimização">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {/* Card 1: Combustível em Operação Efetiva */}
          <div className="rounded-lg border border-orange-100 bg-white p-5 flex flex-col justify-between">
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs font-semibold text-slate-600">
                Gasto em Operação Efetiva
              </span>
              <Fuel className="h-4 w-4 text-emerald-600 shrink-0" aria-hidden="true" />
            </div>
            <div className="mt-3">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-2xl font-bold text-slate-900 tabular-nums">
                  {formatLiters(fuelKpis.combustivelOperacaoLitros)} L
                </span>
                <span className="font-mono text-xs font-semibold text-emerald-700 tabular-nums">
                  ({fuelKpis.taxaMediaOperacaoLh.toFixed(1).replace('.', ',')} L/h)
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500 tabular-nums">
                {formatHMS(kpis.produtivoSeg)} ({fuelKpis.horasOperacaoEfetiva.toFixed(1).replace('.', ',')} h) de trabalho líquido
              </p>
            </div>
          </div>

          {/* Card 2: Combustível em Relanti */}
          <div className="rounded-lg border border-orange-100 bg-white p-5 flex flex-col justify-between">
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs font-semibold text-slate-600">
                Gasto em Relanti (Marcha Lenta)
              </span>
              <Flame className="h-4 w-4 text-amber-600 shrink-0" aria-hidden="true" />
            </div>
            <div className="mt-3">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-2xl font-bold text-amber-700 tabular-nums">
                  {formatLiters(fuelKpis.combustivelRelantiLitros)} L
                </span>
                <span className="font-mono text-xs font-semibold text-amber-700 tabular-nums">
                  ({fuelKpis.taxaMediaRelantiLh.toFixed(1).replace('.', ',')} L/h)
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500 tabular-nums">
                {formatHMS(kpis.relantiSeg)} em relanti ·{' '}
                <strong className="text-amber-700">
                  {fuelKpis.pctDesperdicioRelanti.toFixed(1).replace('.', ',')}%
                </strong>{' '}
                do combustível total
              </p>
            </div>
          </div>

          {/* Card 3: Consumo Total & Média Motor */}
          <div className="rounded-lg border border-orange-100 bg-white p-5 flex flex-col justify-between">
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs font-semibold text-slate-600">
                Consumo Total & Média/Hora
              </span>
              <Gauge className="h-4 w-4 text-orange-600 shrink-0" aria-hidden="true" />
            </div>
            <div className="mt-3">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-2xl font-bold text-slate-900 tabular-nums">
                  {formatLiters(fuelKpis.combustivelTotalLitros)} L
                </span>
                <span className="font-mono text-xs font-semibold text-orange-700 tabular-nums">
                  ({fuelKpis.consumoMedioUtilizacaoLh.toFixed(1).replace('.', ',')} L/h)
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500 tabular-nums">
                Em {formatHMS(kpis.utilizacaoSeg)} de motor ligado · Meta economia:{' '}
                <strong className="text-emerald-700">
                  {formatLiters(fuelKpis.economiaPotencialLitros)} L
                </strong>
              </p>
            </div>
          </div>

          {/* Card 4: Eficiência Operacional & Frota */}
          <div className="rounded-lg border border-orange-100 bg-white p-5 flex flex-col justify-between">
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs font-semibold text-slate-600">
                Operação Exploração · {selectedAreaLabel}
              </span>
              <TrendingDown className="h-4 w-4 text-orange-600 shrink-0" aria-hidden="true" />
            </div>
            <div className="mt-3">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-2xl font-bold text-slate-900 tabular-nums">
                  {kpis.totalEntradas.toLocaleString('pt-PT')}
                </span>
                <span className="text-xs font-medium text-slate-500">
                  entradas · {kpis.totalEquipamentosAtivos} máquinas
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500 tabular-nums">
                Eficiência:{' '}
                <strong className="text-slate-900">
                  {kpis.eficienciaEfetivaPct.toFixed(1).replace('.', ',')}%
                </strong>{' '}
                · Parado: {formatHMS(kpis.paradoSeg)}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Immediate Optimization Priorities Strip */}
      {records.length > 0 && (
        <section className="rounded-lg border border-orange-100 bg-orange-50/35 px-6 py-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-orange-600 shrink-0" aria-hidden="true" />
                <h1 className="text-sm font-semibold text-slate-900">
                  EXPLORAÇÃO — Optimização das Operações & Controlo de Combustível (L/h)
                </h1>
              </div>
              <p className="text-xs text-slate-600">
                Ajuste as taxas reais em <strong className="text-slate-900">L/h (Operação e Relanti)</strong> por equipamento abaixo para calcular com exatidão o combustível produtivo versus desperdício em marcha lenta.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0 no-print">
              {hasCustomRates && (
                <button
                  type="button"
                  onClick={onResetFuelRates}
                  className="inline-flex items-center gap-1.5 rounded-md border border-orange-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-orange-50 whitespace-nowrap"
                >
                  <RotateCcw className="h-3.5 w-3.5 text-orange-600" aria-hidden="true" />
                  <span>Repor Taxas Padrão</span>
                </button>
              )}
              <button
                type="button"
                onClick={onExportCsv}
                className="inline-flex items-center gap-1.5 rounded-md border border-orange-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-orange-50 whitespace-nowrap"
              >
                <Download className="h-3.5 w-3.5 text-orange-600" aria-hidden="true" />
                <span>CSV Combustível</span>
              </button>
              <button
                type="button"
                onClick={onOpenReports}
                className="inline-flex items-center gap-1.5 rounded-md bg-orange-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-orange-700 whitespace-nowrap"
              >
                <FileBarChart2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Emitir Relatório Exploração</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 border-t border-orange-200/70 pt-3 md:grid-cols-2 text-xs">
            <div>
              <p className="font-semibold text-slate-800 mb-1.5">
                Maior Desperdício em Relanti (Clique para filtrar máquina)
              </p>
              <div className="flex flex-wrap gap-x-5 gap-y-1">
                {topIdleMachines.map((m) => (
                  <button
                    key={m.equipamento}
                    type="button"
                    onClick={() =>
                      onSelectEquipment(
                        selectedEquipment === m.equipamento ? 'ALL' : m.equipamento
                      )
                    }
                    className={`text-left hover:text-orange-700 tabular-nums ${
                      selectedEquipment === m.equipamento
                        ? 'font-bold text-orange-700 underline'
                        : 'text-slate-700'
                    }`}
                  >
                    <span className="font-mono font-semibold">{m.equipamento}</span>:{' '}
                    <span className="text-amber-700 font-mono">
                      {formatLiters(m.combustivelRelantiLitros)} L
                    </span>{' '}
                    ({formatHMS(m.relantiSeg)})
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="font-semibold text-slate-800 mb-1.5">
                Áreas com Maior Tempo Parado (Clique para filtrar área)
              </p>
              <div className="flex flex-wrap gap-x-5 gap-y-1">
                {topBottleneckAreas.map((a) => (
                  <button
                    key={a.area}
                    type="button"
                    onClick={() =>
                      onSelectArea(selectedArea === a.area ? 'ALL' : a.area)
                    }
                    className={`inline-flex items-center gap-1 text-left hover:text-orange-700 tabular-nums ${
                      selectedArea === a.area
                        ? 'font-bold text-orange-700 underline'
                        : 'text-slate-700'
                    }`}
                  >
                    <MapPin className="h-3 w-3 text-orange-600 shrink-0" aria-hidden="true" />
                    <span className="font-medium">{a.area}</span>:{' '}
                    <span className="font-mono text-slate-900">
                      {formatHMS(a.paradoSeg)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 3. Sub-navigation Tabs inside Exploração */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-orange-100 pb-3">
        <div
          role="tablist"
          aria-label="Vistas de Otimização da Exploração"
          className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-orange-100 bg-orange-50/40 p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'fuel_equipment'}
            onClick={() => setSubTab('fuel_equipment')}
            className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              subTab === 'fuel_equipment'
                ? 'bg-orange-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-white hover:text-slate-900'
            }`}
          >
            Combustível (L/h) & Equipamentos ({equipmentRows.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'areas'}
            onClick={() => setSubTab('areas')}
            className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              subTab === 'areas'
                ? 'bg-orange-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-white hover:text-slate-900'
            }`}
          >
            Áreas & Gargalos ({areaRows.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'shifts_drivers'}
            onClick={() => setSubTab('shifts_drivers')}
            className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              subTab === 'shifts_drivers'
                ? 'bg-orange-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-white hover:text-slate-900'
            }`}
          >
            Turnos (1º, 2º, 3º), Horas & Condutores
          </button>
        </div>
      </div>

      {/* 4A. Equipment & Fuel Consumption Table */}
      {subTab === 'fuel_equipment' && (
        <section className="rounded-lg border border-orange-100 bg-white overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-orange-100 px-6 py-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Consumo de Combustível por Hora (Operação vs. Relanti) & Otimização da Frota
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Edite diretamente as colunas <strong className="text-slate-700">Taxa Oper. (L/h)</strong> e{' '}
                <strong className="text-slate-700">Taxa Relanti (L/h)</strong> consoante a ficha técnica real de cada máquina.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  type="text"
                  value={equipQuery}
                  onChange={(e) => setEquipQuery(e.target.value)}
                  placeholder="Filtrar máquina ou área..."
                  className="h-8 w-52 rounded-md border border-slate-200 bg-white pl-8 pr-3 text-xs text-slate-800 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none"
                />
              </div>

              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                aria-label="Ordenar equipamentos por"
                className="h-8 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 focus:border-orange-500 focus:outline-none"
              >
                <option value="combustivel">Ordenar: Maior Consumo Total (L)</option>
                <option value="relanti">Ordenar: Maior Gasto em Relanti (L)</option>
                <option value="eficiencia">Ordenar: Menor Eficiência (%)</option>
                <option value="entradas">Ordenar: Mais Entradas</option>
                <option value="equipamento">Ordenar: Código Equipamento</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-orange-100 bg-orange-50/50 text-[11px] font-semibold text-slate-700">
                  <th className="py-3 px-4 whitespace-nowrap">Equipamento</th>
                  <th className="py-3 px-3 text-right whitespace-nowrap">Entradas</th>
                  <th className="py-3 px-3 text-right whitespace-nowrap">Trab. Efetivo</th>
                  <th className="py-3 px-3 text-right whitespace-nowrap">Taxa Oper. (L/h)</th>
                  <th className="py-3 px-3 text-right whitespace-nowrap">Gasto Oper. (L)</th>
                  <th className="py-3 px-3 text-right whitespace-nowrap">Relanti</th>
                  <th className="py-3 px-3 text-right whitespace-nowrap">Taxa Relanti (L/h)</th>
                  <th className="py-3 px-3 text-right whitespace-nowrap">Gasto Relanti (L)</th>
                  <th className="py-3 px-3 text-right whitespace-nowrap">Total Comb. (L)</th>
                  <th className="py-3 px-3 text-right whitespace-nowrap">Média (L/h)</th>
                  <th className="py-3 px-3 text-right whitespace-nowrap">Eficiência</th>
                  <th className="py-3 px-4 whitespace-nowrap">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSortedEquipments.map((row) => {
                  const isSelected = selectedEquipment === row.equipamento;
                  return (
                    <tr
                      key={row.equipamento}
                      className={`transition-colors ${
                        isSelected
                          ? 'bg-orange-50/70'
                          : 'hover:bg-orange-50/25'
                      }`}
                    >
                      <td className="py-2.5 px-4">
                        <button
                          type="button"
                          onClick={() =>
                            onSelectEquipment(isSelected ? 'ALL' : row.equipamento)
                          }
                          className="text-left group"
                        >
                          <span className="block font-mono font-bold text-slate-900 group-hover:text-orange-700">
                            {row.equipamento}
                          </span>
                          <span className="block text-[11px] text-slate-500 truncate max-w-[170px]">
                            {row.categoria} · {row.areas.length} área{row.areas.length > 1 ? 's' : ''}
                          </span>
                        </button>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-900 tabular-nums">
                        {row.entradas}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-700 tabular-nums">
                        {formatHMS(row.produtivoSeg)}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <input
                          type="number"
                          min={0}
                          max={200}
                          step={0.5}
                          aria-label={`Taxa de operação em L/h para ${row.equipamento}`}
                          value={row.operacaoLh}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            onUpdateFuelRate(
                              row.equipamento,
                              'operacaoLh',
                              Number.isFinite(v) && v >= 0 ? v : 0
                            );
                          }}
                          className="h-7 w-16 rounded border border-slate-200 bg-white px-1.5 text-right font-mono text-xs text-slate-900 tabular-nums focus:border-orange-500 focus:outline-none"
                        />
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-emerald-700 tabular-nums">
                        {formatLiters(row.combustivelOperacaoLitros)} L
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-amber-700 tabular-nums">
                        {formatHMS(row.relantiSeg)}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.5}
                          aria-label={`Taxa de relanti em L/h para ${row.equipamento}`}
                          value={row.relantiLh}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            onUpdateFuelRate(
                              row.equipamento,
                              'relantiLh',
                              Number.isFinite(v) && v >= 0 ? v : 0
                            );
                          }}
                          className="h-7 w-16 rounded border border-slate-200 bg-white px-1.5 text-right font-mono text-xs text-slate-900 tabular-nums focus:border-orange-500 focus:outline-none"
                        />
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-amber-700 tabular-nums">
                        {formatLiters(row.combustivelRelantiLitros)} L
                        <span className="block text-[10px] font-normal text-slate-500">
                          {row.pctDesperdicioCombustivel.toFixed(1).replace('.', ',')}% do total
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 tabular-nums">
                        {formatLiters(row.combustivelTotalLitros)} L
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-orange-700 font-semibold tabular-nums">
                        {row.consumoMedioUtilizacaoLh.toFixed(1).replace('.', ',')}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-800 tabular-nums">
                        {row.eficienciaEfetivaPct.toFixed(1).replace('.', ',')}%
                      </td>
                      <td className={`py-2.5 px-4 whitespace-nowrap ${statusTextColor(row.nivelOtimizacao)}`}>
                        {row.nivelOtimizacao}
                      </td>
                    </tr>
                  );
                })}
                {filteredSortedEquipments.length === 0 && (
                  <tr>
                    <td colSpan={12} className="py-8 text-center text-slate-500">
                      Nenhum equipamento encontrado para os critérios selecionados.
                    </td>
                  </tr>
                )}
              </tbody>
              {filteredSortedEquipments.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-orange-200 bg-orange-50/40 font-semibold text-slate-900">
                    <td className="py-3 px-4">
                      Total Filtrado ({filteredSortedEquipments.length} máquinas)
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums">
                      {kpis.totalEntradas.toLocaleString('pt-PT')}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-emerald-700 tabular-nums">
                      {formatHMS(kpis.produtivoSeg)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-slate-600 tabular-nums">
                      {fuelKpis.taxaMediaOperacaoLh.toFixed(1).replace('.', ',')}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-emerald-700 tabular-nums">
                      {formatLiters(fuelKpis.combustivelOperacaoLitros)} L
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-amber-700 tabular-nums">
                      {formatHMS(kpis.relantiSeg)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-slate-600 tabular-nums">
                      {fuelKpis.taxaMediaRelantiLh.toFixed(1).replace('.', ',')}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-amber-700 tabular-nums">
                      {formatLiters(fuelKpis.combustivelRelantiLitros)} L
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-slate-900 tabular-nums">
                      {formatLiters(fuelKpis.combustivelTotalLitros)} L
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-orange-700 tabular-nums">
                      {fuelKpis.consumoMedioUtilizacaoLh.toFixed(1).replace('.', ',')}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums">
                      {kpis.eficienciaEfetivaPct.toFixed(1).replace('.', ',')}%
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600">
                      {fuelKpis.pctDesperdicioRelanti.toFixed(1).replace('.', ',')}% em relanti
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>
      )}

      {/* 4B. Areas & Bottlenecks Breakdown */}
      {subTab === 'areas' && (
        <section className="rounded-lg border border-orange-100 bg-white overflow-hidden">
          <div className="border-b border-orange-100 px-6 py-4">
            <h2 className="text-sm font-semibold text-slate-900">
              Análise de Áreas Operacionais, Tempos de Ciclo & Combustível por Zona
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Clique em qualquer área para filtrar todo o painel e identificar gargalos de espera ou excesso de marcha lenta.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-orange-100 bg-orange-50/50 text-[11px] font-semibold text-slate-700">
                  <th className="py-3 px-4">Área Operacional</th>
                  <th className="py-3 px-3 text-right">Máquinas</th>
                  <th className="py-3 px-3 text-right">Entradas</th>
                  <th className="py-3 px-3 text-right">Permanência</th>
                  <th className="py-3 px-3 text-right">Média/Entrada</th>
                  <th className="py-3 px-3 text-right">Trab. Efetivo</th>
                  <th className="py-3 px-3 text-right">Relanti</th>
                  <th className="py-3 px-3 text-right">Parado</th>
                  <th className="py-3 px-3 text-right">Comb. Oper. (L)</th>
                  <th className="py-3 px-3 text-right">Comb. Relanti (L)</th>
                  <th className="py-3 px-3 text-right">Total Comb. (L)</th>
                  <th className="py-3 px-4 text-right">Eficiência</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {areaRows.map((ar) => {
                  const active = selectedArea === ar.area;
                  return (
                    <tr
                      key={ar.area}
                      onClick={() => onSelectArea(active ? 'ALL' : ar.area)}
                      className={`cursor-pointer transition-colors ${
                        active ? 'bg-orange-50/70' : 'hover:bg-orange-50/25'
                      }`}
                    >
                      <td className="py-2.5 px-4 font-semibold text-slate-900">
                        {ar.area}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                        {ar.equipamentosCount}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-orange-700 tabular-nums">
                        {ar.entradas}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-800">
                        {formatHMS(ar.permanenciaSeg)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600">
                        {formatHMS(ar.mediaCicloSeg)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-emerald-700">
                        {formatHMS(ar.produtivoSeg)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-amber-700">
                        {formatHMS(ar.relantiSeg)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600">
                        {formatHMS(ar.paradoSeg)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-emerald-700 font-semibold">
                        {formatLiters(ar.combustivelOperacaoLitros)} L
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-amber-700 font-semibold">
                        {formatLiters(ar.combustivelRelantiLitros)} L
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-900 font-bold">
                        {formatLiters(ar.combustivelTotalLitros)} L
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-semibold tabular-nums text-slate-900">
                        {ar.eficienciaEfetivaPct.toFixed(1).replace('.', ',')}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 4C. Shifts Fuel Summary + Hourly Chart + Drivers */}
      {subTab === 'shifts_drivers' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {shiftFuelBreakdown.map((sf) => (
              <div
                key={sf.id}
                className="rounded-lg border border-orange-100 bg-white p-4 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900">
                    {sf.label}
                  </span>
                  <span className="font-mono text-[11px] text-slate-500">
                    {sf.windowLabel}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-lg font-bold text-slate-900 tabular-nums">
                    {formatLiters(sf.totalL)} L
                  </span>
                  <span className="text-xs text-slate-500 tabular-nums">
                    {sf.entradas} entradas
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] tabular-nums">
                  <span className="text-emerald-700 font-mono">
                    Operação: {formatLiters(sf.operL)} L
                  </span>
                  <span className="text-amber-700 font-mono">
                    Relanti: {formatLiters(sf.relL)} L
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
            <div className="xl:col-span-7">
              <HourlyDistributionChart
                buckets={hourlyBuckets}
                selectedHour={selectedHour}
                onSelectHour={onSelectHour}
              />
            </div>
            <div className="xl:col-span-5">
              <ShiftEfficiencyPanel
                shifts={shiftRows}
                scheme={shiftScheme}
                selectedShiftId={selectedShiftId}
                onSelectShift={onSelectShift}
              />
            </div>
          </div>

          <DriverPerformanceTable
            drivers={driverRows}
            selectedDriver={selectedDriver}
            onSelectDriver={onSelectDriver}
          />
        </div>
      )}
    </div>
  );
}
