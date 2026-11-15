'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { Download, FileSpreadsheet, Printer } from 'lucide-react';
import {
  formatHMS,
  generateInstitutionalReportCSV,
  generateInstitutionalReportExcelHtml,
  getEntryCount,
  getShiftMeta,
  OFFICIAL_REPORT_FOOTER,
  ReportCategory,
} from '@/lib/fleet-analytics';
import {
  DriverMetrics,
  EquipmentAreaMetrics,
  ExplorationAreaMetric,
  ExplorationEquipmentMetric,
  FleetCycleRecord,
  FleetDataset,
  FleetModuleId,
  FuelGlobalKPIs,
  GlobalKPIs,
  ShiftMetrics,
  ShiftScheme,
} from '@/lib/fleet-types';

interface ReportsViewProps {
  activeModule: FleetModuleId;
  dataset: FleetDataset;
  selectedAreaLabel: string;
  shiftScheme: ShiftScheme;
  kpis: GlobalKPIs;
  equipmentRows: EquipmentAreaMetrics[];
  driverRows: DriverMetrics[];
  shiftRows: ShiftMetrics[];
  records: FleetCycleRecord[];
  fuelKpis?: FuelGlobalKPIs;
  explorationEquipRows?: ExplorationEquipmentMetric[];
  explorationAreaRows?: ExplorationAreaMetric[];
}

function formatLiters(val: number): string {
  return val.toLocaleString('pt-PT', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

export function ReportsView({
  activeModule,
  dataset,
  selectedAreaLabel,
  shiftScheme,
  kpis,
  equipmentRows,
  driverRows,
  shiftRows,
  records,
  fuelKpis,
  explorationEquipRows = [],
  explorationAreaRows = [],
}: ReportsViewProps) {
  const isExploracao = activeModule === 'exploracao';
  const moduleDisplay = isExploracao
    ? 'EXPLORAÇÃO — Optimização das Operações'
    : 'METALURGIA';

  const reportTypes = useMemo(() => {
    const base: Array<{
      id: ReportCategory;
      label: string;
      title: string;
      subtitle: string;
    }> = [
      {
        id: 'executive',
        label: 'Relatório Executivo',
        title: isExploracao
          ? 'Relatório Executivo de Exploração — Optimização & Combustível'
          : 'Relatório Executivo Consolidado de Metalurgia',
        subtitle: isExploracao
          ? 'Consolidado operacional da Exploração com consumo de combustível por hora (L/h) em operação e relanti, desempenho de condutores e turnos.'
          : 'Consolidado completo da Metalurgia com métricas por equipamento na área selecionada, desempenho dos condutores e eficiência por turno.',
      },
      ...(isExploracao
        ? [
            {
              id: 'optimization' as const,
              label: 'Combustível (L/h) & Optimização',
              title: 'Relatório de Optimização e Consumo de Combustível (L/h) — Exploração',
              subtitle:
                'Detalhamento exato de horas produtivas vs. marcha lenta (relanti), taxas em L/h por máquina, litros consumidos e zonas com gargalos operacionais.',
            },
          ]
        : []),
      {
        id: 'equipment',
        label: 'Equipamentos & Área',
        title: `Relatório de Entradas e Operação por Equipamento (${
          isExploracao ? 'Exploração' : 'Metalurgia'
        })`,
        subtitle:
          'Contagem exata de entradas por área selecionada, horas totais de operação, trabalho efetivo, marcha lenta (relanti) e distância.',
      },
      {
        id: 'drivers',
        label: 'Condutores',
        title: `Relatório de Desempenho dos Condutores (${
          isExploracao ? 'Exploração' : 'Metalurgia'
        })`,
        subtitle:
          'Análise por operador com equipamentos atribuídos, entradas na área, horas produtivas, relanti e índice de eficiência.',
      },
      {
        id: 'shifts',
        label: 'Turnos',
        title: `Relatório de Eficiência Operacional por Turno (${
          isExploracao ? 'Exploração' : 'Metalurgia'
        })`,
        subtitle:
          'Comparativo de produtividade e tempo de operação distribuído pelos turnos de trabalho (1º, 2º e 3º Turno).',
      },
      {
        id: 'summary',
        label: 'Página Resumo',
        title: `Relatório Principal Detalhado — Resumo (${
          isExploracao ? 'Exploração' : 'Metalurgia'
        })`,
        subtitle:
          'Listagem fiel dos registos da secção Resumo com horários de entrada, saída, início, fim e entradas reconciliadas.',
      },
    ];
    return base;
  }, [isExploracao]);

  const [category, setCategory] = useState<ReportCategory>('executive');

  const resolvedCategory =
    !isExploracao && category === 'optimization' ? 'executive' : category;

  const activeConfig =
    reportTypes.find((r) => r.id === resolvedCategory) ?? reportTypes[0];
  const periodo = `${dataset.metadata.dataInicio} até ${dataset.metadata.dataFim}`;
  const generatedLabel = `${new Date().toLocaleDateString('pt-PT')} ${new Date().toLocaleTimeString('pt-PT')}`;
  const fileDateStamp = dataset.metadata.dataInicio.replace(/\//g, '-');
  const moduleFileSlug = isExploracao ? 'Exploracao' : 'Metalurgia';

  const triggerDownload = (content: string, mime: string, filename: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadCsv = () => {
    const csv = generateInstitutionalReportCSV({
      moduleId: activeModule,
      category: resolvedCategory,
      title: activeConfig.title,
      organizacao: dataset.metadata.organizacao,
      periodo,
      areaLabel: selectedAreaLabel,
      kpis,
      equipmentRows,
      driverRows,
      shiftRows,
      records,
      scheme: shiftScheme,
      fuelKpis,
      explorationEquipRows,
      explorationAreaRows,
    });
    triggerDownload(
      csv,
      'text/csv;charset=utf-8;',
      `Cuango_${moduleFileSlug}_${resolvedCategory}_${fileDateStamp}.csv`
    );
  };

  const handleDownloadExcel = () => {
    const html = generateInstitutionalReportExcelHtml({
      moduleId: activeModule,
      category: resolvedCategory,
      title: activeConfig.title,
      organizacao: dataset.metadata.organizacao,
      periodo,
      areaLabel: selectedAreaLabel,
      generatedAt: generatedLabel,
      kpis,
      equipmentRows,
      driverRows,
      shiftRows,
      records,
      scheme: shiftScheme,
      fuelKpis,
      explorationEquipRows,
      explorationAreaRows,
    });
    triggerDownload(
      '\uFEFF' + html,
      'application/vnd.ms-excel;charset=utf-8;',
      `Cuango_${moduleFileSlug}_${resolvedCategory}_${fileDateStamp}.xls`
    );
  };

  const handlePrintPdf = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Report Selection & Export Toolbar */}
      <div className="rounded-lg border border-orange-100 bg-white p-5 no-print">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-base font-semibold text-slate-900">
              Centro de Relatórios — Módulo {isExploracao ? 'EXPLORAÇÃO' : 'METALURGIA'}
            </h1>
            <p className="mt-0.5 text-xs text-slate-600">
              Relatório dedicado ao módulo ativo (<strong className="text-orange-700">{moduleDisplay}</strong>) em PDF, Excel (.xls) ou CSV com cabeçalho oficial da Sociedade Mineira do Cuango.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleDownloadCsv}
              className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-orange-50 hover:text-orange-800 whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5 text-orange-600" aria-hidden="true" />
              <span>Exportar CSV</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadExcel}
              className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-orange-50 hover:text-orange-800 whitespace-nowrap shrink-0"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-orange-600" aria-hidden="true" />
              <span>Exportar Excel (.xls)</span>
            </button>
            <button
              type="button"
              onClick={handlePrintPdf}
              className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-700 whitespace-nowrap shrink-0"
            >
              <Printer className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Imprimir / Exportar PDF</span>
            </button>
          </div>
        </div>

        {/* Report Type Segmented Selector */}
        <div className="mt-4 flex flex-wrap items-center gap-1.5 rounded-lg border border-orange-100 bg-orange-50/40 p-1">
          {reportTypes.map((rt) => {
            const active = resolvedCategory === rt.id;
            return (
              <button
                key={rt.id}
                type="button"
                onClick={() => setCategory(rt.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-orange-600 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-white hover:text-slate-900'
                }`}
              >
                {rt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Printable Official Cuango Report Sheet */}
      <article className="rounded-lg border border-orange-200 bg-white p-8 space-y-6">
        {/* Official Branded Letterhead */}
        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-orange-200 pb-5">
          <div className="space-y-2">
            <Image
              src="/assets/aistudio/image_33e20192.png"
              alt="CUANGO — Sociedade Mineira do Cuango Lda"
              width={259}
              height={68}
              referrerPolicy="no-referrer"
              className="h-11 w-auto object-contain"
            />
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-orange-700">
                Módulo {moduleDisplay}
              </p>
              <h2 className="mt-0.5 text-xl font-bold text-slate-900">
                {activeConfig.title}
              </h2>
              <p className="mt-0.5 text-xs text-slate-600 max-w-2xl">
                {activeConfig.subtitle}
              </p>
            </div>
          </div>

          <div className="text-xs text-slate-600 space-y-1 text-left sm:text-right tabular-nums">
            <p>
              Organização:{' '}
              <strong className="text-slate-900">{dataset.metadata.organizacao}</strong>
            </p>
            <p>
              Grupo:{' '}
              <strong className="text-slate-900">{dataset.metadata.grupoEquipamentos}</strong>
            </p>
            <p>
              Área Selecionada:{' '}
              <strong className="text-orange-700">{selectedAreaLabel}</strong>
            </p>
            <p>
              Período:{' '}
              <strong className="text-slate-900">{periodo}</strong>
            </p>
            <p>
              Regime de Turnos:{' '}
              <strong className="text-slate-900">
                {shiftScheme === '3x8h' ? '3 Turnos (8h)' : '2 Turnos (12h)'}
              </strong>
            </p>
            <p className="text-slate-500">Emitido em {generatedLabel}</p>
          </div>
        </header>

        {/* Executive KPI Snapshot inside Report */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-md border border-orange-100 bg-orange-50/35 px-4 py-3">
            <p className="text-[11px] font-medium text-slate-600">
              Entradas na Área
            </p>
            <p className="mt-1 font-mono text-lg font-bold text-slate-900 tabular-nums">
              {kpis.totalEntradas.toLocaleString('pt-PT')}
            </p>
          </div>
          <div className="rounded-md border border-orange-100 bg-orange-50/35 px-4 py-3">
            <p className="text-[11px] font-medium text-slate-600">
              Permanência Total
            </p>
            <p className="mt-1 font-mono text-lg font-bold text-slate-900 tabular-nums">
              {formatHMS(kpis.permanenciaSeg)}
            </p>
          </div>
          <div className="rounded-md border border-orange-100 bg-orange-50/35 px-4 py-3">
            <p className="text-[11px] font-medium text-slate-600">
              Operação Total (Motor)
            </p>
            <p className="mt-1 font-mono text-lg font-bold text-emerald-700 tabular-nums">
              {formatHMS(kpis.utilizacaoSeg)}
            </p>
          </div>
          <div className="rounded-md border border-orange-100 bg-orange-50/35 px-4 py-3">
            <p className="text-[11px] font-medium text-slate-600">
              Eficiência Efetiva
            </p>
            <p className="mt-1 font-mono text-lg font-bold text-orange-700 tabular-nums">
              {kpis.eficienciaEfetivaPct.toFixed(1).replace('.', ',')}%
            </p>
          </div>
        </section>

        {/* Fuel KPIs Snapshot (Only when EXPLORAÇÃO module is active) */}
        {isExploracao && fuelKpis && (
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-md border border-emerald-200 bg-emerald-50/35 px-4 py-3">
              <p className="text-[11px] font-medium text-slate-600">
                Combustível em Operação
              </p>
              <p className="mt-1 font-mono text-base font-bold text-emerald-700 tabular-nums">
                {formatLiters(fuelKpis.combustivelOperacaoLitros)} L
              </p>
              <p className="text-[11px] font-mono text-slate-500 tabular-nums">
                Taxa média: {fuelKpis.taxaMediaOperacaoLh.toFixed(1).replace('.', ',')} L/h
              </p>
            </div>
            <div className="rounded-md border border-amber-200 bg-amber-50/35 px-4 py-3">
              <p className="text-[11px] font-medium text-slate-600">
                Combustível em Relanti
              </p>
              <p className="mt-1 font-mono text-base font-bold text-amber-700 tabular-nums">
                {formatLiters(fuelKpis.combustivelRelantiLitros)} L
              </p>
              <p className="text-[11px] font-mono text-slate-500 tabular-nums">
                Taxa média: {fuelKpis.taxaMediaRelantiLh.toFixed(1).replace('.', ',')} L/h ({fuelKpis.pctDesperdicioRelanti.toFixed(1).replace('.', ',')}%)
              </p>
            </div>
            <div className="rounded-md border border-orange-200 bg-orange-50/45 px-4 py-3">
              <p className="text-[11px] font-medium text-slate-600">
                Total Combustível Estimado
              </p>
              <p className="mt-1 font-mono text-base font-bold text-slate-900 tabular-nums">
                {formatLiters(fuelKpis.combustivelTotalLitros)} L
              </p>
              <p className="text-[11px] font-mono text-slate-500 tabular-nums">
                Média motor: {fuelKpis.consumoMedioUtilizacaoLh.toFixed(1).replace('.', ',')} L/h
              </p>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50/60 px-4 py-3">
              <p className="text-[11px] font-medium text-slate-600">
                Economia Potencial (Meta ≤10% Relanti)
              </p>
              <p className="mt-1 font-mono text-base font-bold text-emerald-700 tabular-nums">
                {formatLiters(fuelKpis.economiaPotencialLitros)} L
              </p>
              <p className="text-[11px] text-slate-500">
                Oportunidade de redução direta
              </p>
            </div>
          </section>
        )}

        {/* Exploração Fuel & Optimization Tables */}
        {isExploracao &&
          (resolvedCategory === 'optimization' || resolvedCategory === 'executive') && (
            <>
              <section className="space-y-2.5">
                <h3 className="text-sm font-semibold text-slate-900">
                  Consumo de Combustível por Hora (Operação vs. Relanti) por Equipamento
                </h3>
                <div className="overflow-x-auto rounded-md border border-orange-100">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-orange-200 bg-orange-50/60 text-[11px] font-semibold text-slate-700">
                        <th className="py-2.5 px-3">Equipamento</th>
                        <th className="py-2.5 px-3 text-right">Entradas</th>
                        <th className="py-2.5 px-3 text-right">Trab. Efetivo</th>
                        <th className="py-2.5 px-3 text-right">Oper. (L/h)</th>
                        <th className="py-2.5 px-3 text-right">Gasto Oper. (L)</th>
                        <th className="py-2.5 px-3 text-right">Relanti</th>
                        <th className="py-2.5 px-3 text-right">Rel. (L/h)</th>
                        <th className="py-2.5 px-3 text-right">Gasto Relanti (L)</th>
                        <th className="py-2.5 px-3 text-right">Total Comb. (L)</th>
                        <th className="py-2.5 px-3 text-right">Média (L/h)</th>
                        <th className="py-2.5 px-3">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {explorationEquipRows.map((eq) => (
                        <tr key={eq.equipamento}>
                          <td className="py-2 px-3 font-mono font-semibold text-slate-900">
                            {eq.equipamento}
                          </td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums">
                            {eq.entradas}
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-emerald-700 tabular-nums">
                            {formatHMS(eq.produtivoSeg)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums">
                            {eq.operacaoLh.toFixed(1).replace('.', ',')}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-semibold text-emerald-700 tabular-nums">
                            {formatLiters(eq.combustivelOperacaoLitros)} L
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-amber-700 tabular-nums">
                            {formatHMS(eq.relantiSeg)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums">
                            {eq.relantiLh.toFixed(1).replace('.', ',')}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-semibold text-amber-700 tabular-nums">
                            {formatLiters(eq.combustivelRelantiLitros)} L
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-slate-900 tabular-nums">
                            {formatLiters(eq.combustivelTotalLitros)} L
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-orange-700 tabular-nums">
                            {eq.consumoMedioUtilizacaoLh.toFixed(1).replace('.', ',')}
                          </td>
                          <td className="py-2 px-3 font-semibold text-slate-800">
                            {eq.nivelOtimizacao}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {explorationAreaRows.length > 0 && (
                <section className="space-y-2.5">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Desempenho & Consumo por Área Operacional (Exploração)
                  </h3>
                  <div className="overflow-x-auto rounded-md border border-orange-100">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-orange-200 bg-orange-50/60 text-[11px] font-semibold text-slate-700">
                          <th className="py-2.5 px-3">Área</th>
                          <th className="py-2.5 px-3 text-right">Máquinas</th>
                          <th className="py-2.5 px-3 text-right">Entradas</th>
                          <th className="py-2.5 px-3 text-right">Permanência</th>
                          <th className="py-2.5 px-3 text-right">Trab. Efetivo</th>
                          <th className="py-2.5 px-3 text-right">Relanti</th>
                          <th className="py-2.5 px-3 text-right">Comb. Oper. (L)</th>
                          <th className="py-2.5 px-3 text-right">Comb. Relanti (L)</th>
                          <th className="py-2.5 px-3 text-right">Total Comb. (L)</th>
                          <th className="py-2.5 px-3 text-right">Eficiência</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {explorationAreaRows.map((ar) => (
                          <tr key={ar.area}>
                            <td className="py-2 px-3 font-semibold text-slate-900">
                              {ar.area}
                            </td>
                            <td className="py-2 px-3 text-right font-mono tabular-nums">
                              {ar.equipamentosCount}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-orange-700 tabular-nums">
                              {ar.entradas}
                            </td>
                            <td className="py-2 px-3 text-right font-mono tabular-nums">
                              {formatHMS(ar.permanenciaSeg)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-emerald-700 tabular-nums">
                              {formatHMS(ar.produtivoSeg)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-amber-700 tabular-nums">
                              {formatHMS(ar.relantiSeg)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-emerald-700 tabular-nums">
                              {formatLiters(ar.combustivelOperacaoLitros)} L
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-amber-700 tabular-nums">
                              {formatLiters(ar.combustivelRelantiLitros)} L
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-slate-900 tabular-nums">
                              {formatLiters(ar.combustivelTotalLitros)} L
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-bold tabular-nums">
                              {ar.eficienciaEfetivaPct.toFixed(1).replace('.', ',')}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </>
          )}

        {/* Equipment by Area Table */}
        {(resolvedCategory === 'equipment' || resolvedCategory === 'executive') && (
          <section className="space-y-2.5">
            <h3 className="text-sm font-semibold text-slate-900">
              Entradas e Tempo de Operação por Equipamento e Área
            </h3>
            <div className="overflow-x-auto rounded-md border border-orange-100">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-orange-200 bg-orange-50/60 text-[11px] font-semibold text-slate-700">
                    <th className="py-2.5 px-3">Equipamento</th>
                    <th className="py-2.5 px-3">Área</th>
                    <th className="py-2.5 px-3 text-right">Entradas</th>
                    <th className="py-2.5 px-3 text-right">Permanência</th>
                    <th className="py-2.5 px-3 text-right">Operação Motor</th>
                    <th className="py-2.5 px-3 text-right">Trabalho Efetivo</th>
                    <th className="py-2.5 px-3 text-right">Relanti</th>
                    <th className="py-2.5 px-3 text-right">Distância</th>
                    <th className="py-2.5 px-3 text-right">Eficiência</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {equipmentRows.map((row) => (
                    <tr key={`${row.equipamento}-${row.area}`}>
                      <td className="py-2.5 px-3 font-mono font-semibold text-slate-900">
                        {row.equipamento}
                      </td>
                      <td className="py-2.5 px-3 text-slate-800">{row.area}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-orange-700 tabular-nums">
                        {row.entradas}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                        {formatHMS(row.permanenciaSeg)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold tabular-nums">
                        {formatHMS(row.utilizacaoSeg)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-700 tabular-nums">
                        {formatHMS(row.produtivoSeg)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-amber-700 tabular-nums">
                        {formatHMS(row.relantiSeg)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                        {row.distanciaHoras.toFixed(1).replace('.', ',')} h
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold tabular-nums">
                        {row.eficienciaEfetivaPct.toFixed(1).replace('.', ',')}%
                      </td>
                    </tr>
                  ))}
                  {equipmentRows.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-6 text-center text-slate-500">
                        Sem equipamentos para os filtros selecionados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Driver Performance Table */}
        {(resolvedCategory === 'drivers' || resolvedCategory === 'executive') && (
          <section className="space-y-2.5">
            <h3 className="text-sm font-semibold text-slate-900">
              Desempenho dos Condutores
            </h3>
            <div className="overflow-x-auto rounded-md border border-orange-100">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-orange-200 bg-orange-50/60 text-[11px] font-semibold text-slate-700">
                    <th className="py-2.5 px-3">Condutor</th>
                    <th className="py-2.5 px-3">Equipamentos</th>
                    <th className="py-2.5 px-3 text-right">Entradas</th>
                    <th className="py-2.5 px-3 text-right">Permanência</th>
                    <th className="py-2.5 px-3 text-right">Operação Motor</th>
                    <th className="py-2.5 px-3 text-right">Trabalho Efetivo</th>
                    <th className="py-2.5 px-3 text-right">Relanti</th>
                    <th className="py-2.5 px-3 text-right">Parado</th>
                    <th className="py-2.5 px-3 text-right">Eficiência</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {driverRows.map((d) => (
                    <tr key={d.condutorCompleto}>
                      <td className="py-2.5 px-3">
                        <span className="font-semibold text-slate-900">
                          {d.condutorNome}
                        </span>{' '}
                        <span className="font-mono text-[11px] text-slate-500">
                          ({d.condutorCodigo})
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-700">
                        {d.equipamentos.join(', ')}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-orange-700 tabular-nums">
                        {d.entradas}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                        {formatHMS(d.permanenciaSeg)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold tabular-nums">
                        {formatHMS(d.utilizacaoSeg)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-700 tabular-nums">
                        {formatHMS(d.produtivoSeg)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-amber-700 tabular-nums">
                        {formatHMS(d.relantiSeg)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-600 tabular-nums">
                        {formatHMS(d.paradoSeg)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold tabular-nums">
                        {d.eficienciaEfetivaPct.toFixed(1).replace('.', ',')}%
                      </td>
                    </tr>
                  ))}
                  {driverRows.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-6 text-center text-slate-500">
                        Sem condutores para os filtros selecionados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Shifts Table */}
        {(resolvedCategory === 'shifts' || resolvedCategory === 'executive') && (
          <section className="space-y-2.5">
            <h3 className="text-sm font-semibold text-slate-900">
              Eficiência Operacional por Turno ({shiftScheme === '3x8h' ? '3x8h' : '2x12h'})
            </h3>
            <div className="overflow-x-auto rounded-md border border-orange-100">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-orange-200 bg-orange-50/60 text-[11px] font-semibold text-slate-700">
                    <th className="py-2.5 px-3">Turno</th>
                    <th className="py-2.5 px-3">Horário</th>
                    <th className="py-2.5 px-3 text-right">Entradas</th>
                    <th className="py-2.5 px-3 text-right">Equipamentos</th>
                    <th className="py-2.5 px-3 text-right">Permanência</th>
                    <th className="py-2.5 px-3 text-right">Operação Motor</th>
                    <th className="py-2.5 px-3 text-right">Trabalho Efetivo</th>
                    <th className="py-2.5 px-3 text-right">Relanti</th>
                    <th className="py-2.5 px-3 text-right">Eficiência</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {shiftRows.map((s) => (
                    <tr key={s.shiftId}>
                      <td className="py-2.5 px-3 font-semibold text-slate-900">
                        {s.label}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-600 tabular-nums">
                        {s.windowLabel}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-orange-700 tabular-nums">
                        {s.entradas}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                        {s.equipamentosCount}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                        {formatHMS(s.permanenciaSeg)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold tabular-nums">
                        {formatHMS(s.utilizacaoSeg)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-700 tabular-nums">
                        {formatHMS(s.produtivoSeg)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-amber-700 tabular-nums">
                        {formatHMS(s.relantiSeg)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold tabular-nums">
                        {s.eficienciaEfetivaPct.toFixed(1).replace('.', ',')}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Summary Records Table */}
        {resolvedCategory === 'summary' && (
          <section className="space-y-2.5">
            <h3 className="text-sm font-semibold text-slate-900">
              Registos do Relatório Principal (Página Resumo)
            </h3>
            <div className="overflow-x-auto rounded-md border border-orange-100">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-orange-200 bg-orange-50/60 text-[11px] font-semibold text-slate-700">
                    <th className="py-2.5 px-3">Nº</th>
                    <th className="py-2.5 px-3">Dia</th>
                    <th className="py-2.5 px-3">Turno</th>
                    <th className="py-2.5 px-3">Equipamento</th>
                    <th className="py-2.5 px-3">Condutor</th>
                    <th className="py-2.5 px-3">Entrada</th>
                    <th className="py-2.5 px-3">Saída</th>
                    <th className="py-2.5 px-3 text-right">Entradas</th>
                    <th className="py-2.5 px-3 text-right">Duração</th>
                    <th className="py-2.5 px-3 text-right">Utilização</th>
                    <th className="py-2.5 px-3 text-right">Relanti</th>
                    <th className="py-2.5 px-3">Área</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {records.map((r) => {
                    const shift = getShiftMeta(r.horaEntrada, shiftScheme);
                    return (
                      <tr key={r.id}>
                        <td className="py-2 px-3 font-mono text-slate-500 tabular-nums">
                          {r.numero}
                        </td>
                        <td className="py-2 px-3 font-mono tabular-nums whitespace-nowrap">
                          {r.data}
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          {shift.label}
                        </td>
                        <td className="py-2 px-3 font-mono font-semibold text-slate-900 whitespace-nowrap">
                          {r.equipamento}
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          {r.condutorNome}{' '}
                          <span className="font-mono text-[11px] text-slate-400">
                            ({r.condutorCodigo})
                          </span>
                        </td>
                        <td className="py-2 px-3 font-mono tabular-nums whitespace-nowrap">
                          {r.entrada}
                        </td>
                        <td className="py-2 px-3 font-mono tabular-nums whitespace-nowrap">
                          {r.saida}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-orange-700 tabular-nums">
                          {getEntryCount(r)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums">
                          {formatHMS(r.duracaoSeg)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums">
                          {formatHMS(r.utilizacaoSeg)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-amber-700 tabular-nums">
                          {formatHMS(r.relantiSeg)}
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">{r.area}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Official Report Footer (always rendered in preview & PDF print) */}
        <footer className="border-t border-orange-200 pt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
          <span className="font-medium text-slate-800">{OFFICIAL_REPORT_FOOTER}</span>
          <span className="text-slate-500 truncate max-w-sm">
            Fonte: {dataset.metadata.arquivoOrigem}
          </span>
        </footer>
      </article>
    </div>
  );
}
