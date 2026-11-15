'use client';

import { useMemo, useState } from 'react';
import { ArrowUpDown, Search } from 'lucide-react';
import { formatHMS, getEntryCount, getShiftMeta } from '@/lib/fleet-analytics';
import { FleetCycleRecord, ShiftScheme } from '@/lib/fleet-types';

interface CyclesDetailTableProps {
  records: FleetCycleRecord[];
  detailCycles?: FleetCycleRecord[];
  shiftScheme: ShiftScheme;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

type SortField = 'numero' | 'entradasCount' | 'duracaoSeg' | 'relantiSeg' | 'utilizacaoSeg';
type ViewSection = 'resumo' | 'lista';

export function CyclesDetailTable({
  records,
  detailCycles,
  shiftScheme,
  searchQuery,
  onSearchChange,
}: CyclesDetailTableProps) {
  const hasDetailList = Boolean(detailCycles && detailCycles.length > 0);
  const [activeSection, setActiveSection] = useState<ViewSection>('resumo');
  const [sortField, setSortField] = useState<SortField>('numero');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [onlyHighIdle, setOnlyHighIdle] = useState(false);

  const effectiveSection: ViewSection =
    activeSection === 'lista' && hasDetailList ? 'lista' : 'resumo';

  const sourceRows =
    effectiveSection === 'lista' && detailCycles ? detailCycles : records;

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir(field === 'numero' ? 'asc' : 'desc');
    }
  };

  const displayed = useMemo(() => {
    const base = onlyHighIdle
      ? sourceRows.filter((r) => r.duracaoSeg > 0 && r.relantiSeg / r.duracaoSeg >= 0.5)
      : sourceRows;

    return [...base].sort((a, b) => {
      const valA =
        sortField === 'entradasCount' ? getEntryCount(a) : a[sortField];
      const valB =
        sortField === 'entradasCount' ? getEntryCount(b) : b[sortField];
      const diff = valA - valB;
      return sortDir === 'asc' ? diff : -diff;
    });
  }, [sourceRows, onlyHighIdle, sortField, sortDir]);

  const totalEntradasShown = useMemo(
    () => displayed.reduce((acc, r) => acc + getEntryCount(r), 0),
    [displayed]
  );

  return (
    <div className="rounded-lg border border-orange-100 bg-white">
      <div className="border-b border-orange-100 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            {effectiveSection === 'resumo'
              ? 'Relatório Principal (Página Resumo)'
              : 'Ciclos Detalhados (Página Lista)'}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
            {displayed.length} registos listados · {totalEntradasShown} entradas na área · Registos com Relanti ≥ 50% destacados.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 no-print">
          {hasDetailList && (
            <div className="flex h-9 items-center rounded-md border border-orange-100 bg-orange-50/40 p-0.5">
              <button
                type="button"
                onClick={() => setActiveSection('resumo')}
                className={`h-full rounded px-2.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  effectiveSection === 'resumo'
                    ? 'bg-orange-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Resumo Principal ({records.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveSection('lista')}
                className={`h-full rounded px-2.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  effectiveSection === 'lista'
                    ? 'bg-orange-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Lista Detalhada ({detailCycles?.length ?? 0})
              </button>
            </div>
          )}

          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Pesquisar nº, condutor, hora..."
              className="h-9 w-56 rounded-md border border-slate-200 bg-white pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-orange-600 focus:outline-none"
            />
          </div>

          <div className="flex h-9 items-center rounded-md border border-orange-100 bg-orange-50/40 p-0.5">
            <button
              type="button"
              onClick={() => setOnlyHighIdle(false)}
              className={`h-full rounded px-2.5 text-xs font-medium transition-colors whitespace-nowrap ${
                !onlyHighIdle
                  ? 'bg-orange-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Todos ({sourceRows.length})
            </button>
            <button
              type="button"
              onClick={() => setOnlyHighIdle(true)}
              className={`h-full rounded px-2.5 text-xs font-medium transition-colors whitespace-nowrap ${
                onlyHighIdle
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Relanti ≥ 50%
            </button>
          </div>
        </div>
      </div>

      {displayed.length === 0 ? (
        <div className="p-10 text-center text-sm text-slate-500">
          Nenhum registo corresponde aos critérios selecionados.
        </div>
      ) : (
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-orange-50/70 backdrop-blur-xs border-b border-orange-100 text-[11px] font-semibold text-slate-700">
              <tr>
                <th className="py-2.5 pl-6 pr-2">
                  <button
                    type="button"
                    onClick={() => toggleSort('numero')}
                    className="inline-flex items-center gap-1 hover:text-slate-900"
                  >
                    <span>Nº</span>
                    <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
                  </button>
                </th>
                {effectiveSection === 'resumo' && (
                  <th className="py-2.5 px-3">Dia</th>
                )}
                <th className="py-2.5 px-3">Equipamento</th>
                <th className="py-2.5 px-3">Condutor</th>
                {effectiveSection === 'lista' && (
                  <th className="py-2.5 px-3">Turno</th>
                )}
                <th className="py-2.5 px-3">Entrada</th>
                <th className="py-2.5 px-3">Saída</th>
                {effectiveSection === 'resumo' && (
                  <>
                    <th className="py-2.5 px-3">Início</th>
                    <th className="py-2.5 px-3">Fim</th>
                    <th className="py-2.5 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => toggleSort('entradasCount')}
                        className="inline-flex items-center gap-1 hover:text-slate-900"
                      >
                        <span>Entradas</span>
                        <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
                      </button>
                    </th>
                  </>
                )}
                <th className="py-2.5 px-3 text-right">
                  <button
                    type="button"
                    onClick={() => toggleSort('duracaoSeg')}
                    className="inline-flex items-center gap-1 hover:text-slate-900"
                  >
                    <span>Duração</span>
                    <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
                  </button>
                </th>
                <th className="py-2.5 px-3 text-right">
                  <button
                    type="button"
                    onClick={() => toggleSort('utilizacaoSeg')}
                    className="inline-flex items-center gap-1 hover:text-slate-900"
                  >
                    <span>Utilização</span>
                    <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
                  </button>
                </th>
                <th className="py-2.5 px-3 text-right">
                  <button
                    type="button"
                    onClick={() => toggleSort('relantiSeg')}
                    className="inline-flex items-center gap-1 hover:text-slate-900"
                  >
                    <span>Relanti</span>
                    <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
                  </button>
                </th>
                <th className="py-2.5 px-3 text-right">Parado</th>
                <th className="py-2.5 pl-3 pr-6">Área</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {displayed.map((r) => {
                const shift = getShiftMeta(r.horaEntrada, shiftScheme);
                const highIdle = r.duracaoSeg > 0 && r.relantiSeg / r.duracaoSeg >= 0.5;
                return (
                  <tr
                    key={`${effectiveSection}-${r.id}`}
                    className={`transition-colors hover:bg-slate-50 ${
                      highIdle ? 'bg-amber-50/40' : ''
                    }`}
                  >
                    <td className="py-2.5 pl-6 pr-2 font-mono text-slate-500 tabular-nums">
                      {r.numero}
                    </td>
                    {effectiveSection === 'resumo' && (
                      <td className="py-2.5 px-3 font-mono text-slate-700 tabular-nums whitespace-nowrap">
                        {r.data}
                      </td>
                    )}
                    <td className="py-2.5 px-3 font-mono font-medium text-slate-900 whitespace-nowrap">
                      {r.equipamento}
                    </td>
                    <td className="py-2.5 px-3 text-slate-800 whitespace-nowrap">
                      {r.condutorNome}{' '}
                      <span className="font-mono text-[11px] text-slate-400">
                        ({r.condutorCodigo})
                      </span>
                    </td>
                    {effectiveSection === 'lista' && (
                      <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                        {shift.label}
                      </td>
                    )}
                    <td className="py-2.5 px-3 font-mono text-slate-700 tabular-nums whitespace-nowrap">
                      {r.entrada}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-700 tabular-nums whitespace-nowrap">
                      {r.saida}
                    </td>
                    {effectiveSection === 'resumo' && (
                      <>
                        <td className="py-2.5 px-3 font-mono text-slate-600 tabular-nums whitespace-nowrap">
                          {r.inicio ?? r.entrada}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-600 tabular-nums whitespace-nowrap">
                          {r.fim ?? r.saida}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 tabular-nums">
                          {getEntryCount(r)}
                        </td>
                      </>
                    )}
                    <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-900 tabular-nums">
                      {formatHMS(r.duracaoSeg)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-800 tabular-nums">
                      {formatHMS(r.utilizacaoSeg)}
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right font-mono tabular-nums ${
                        highIdle ? 'font-bold text-amber-700' : 'text-slate-600'
                      }`}
                    >
                      {formatHMS(r.relantiSeg)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-500 tabular-nums">
                      {formatHMS(r.paradoSeg)}
                    </td>
                    <td className="py-2.5 pl-3 pr-6 text-slate-700 whitespace-nowrap">
                      {r.area}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
