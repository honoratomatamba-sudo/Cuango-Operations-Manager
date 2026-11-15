'use client';

import { formatHMS } from '@/lib/fleet-analytics';
import { ShiftMetrics, ShiftScheme } from '@/lib/fleet-types';

interface ShiftEfficiencyPanelProps {
  shifts: ShiftMetrics[];
  scheme: ShiftScheme;
  selectedShiftId: string;
  onSelectShift: (shiftId: string) => void;
}

export function ShiftEfficiencyPanel({
  shifts,
  scheme,
  selectedShiftId,
  onSelectShift,
}: ShiftEfficiencyPanelProps) {
  return (
    <div className="rounded-lg border border-orange-100 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Eficiência Operacional por Turno de Trabalho
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Modelo {scheme === '3x8h' ? '3 Turnos de 8 horas' : '2 Turnos de 12 horas'} · Clique num turno para filtrar o painel.
          </p>
        </div>
      </div>

      <div className="mt-5 divide-y divide-slate-100">
        {shifts.map((shift) => {
          const isSelected = selectedShiftId === shift.shiftId;
          const isDimmed = selectedShiftId !== 'ALL' && !isSelected;
          const hasData = shift.entradas > 0;

          const prodPct =
            shift.permanenciaSeg > 0
              ? (shift.produtivoSeg / shift.permanenciaSeg) * 100
              : 0;
          const relPct =
            shift.permanenciaSeg > 0
              ? (shift.relantiSeg / shift.permanenciaSeg) * 100
              : 0;
          const parPct =
            shift.permanenciaSeg > 0
              ? (shift.paradoSeg / shift.permanenciaSeg) * 100
              : 0;

          const efficiencyStatus =
            !hasData
              ? { label: 'Sem operação', cls: 'text-slate-400' }
              : shift.eficienciaEfetivaPct >= 65
              ? { label: 'Alta eficiência', cls: 'text-emerald-700' }
              : shift.eficienciaEfetivaPct >= 45
              ? { label: 'Eficiência moderada', cls: 'text-amber-700' }
              : { label: 'Relanti crítico', cls: 'text-red-700' };

          return (
            <button
              key={shift.shiftId}
              type="button"
              disabled={!hasData}
              onClick={() =>
                onSelectShift(isSelected ? 'ALL' : shift.shiftId)
              }
              className={`w-full py-4 text-left transition-opacity first:pt-1 last:pb-1 focus-visible:outline-2 focus-visible:outline-orange-600 ${
                !hasData
                  ? 'cursor-default opacity-50'
                  : isDimmed
                  ? 'opacity-45 hover:opacity-85'
                  : 'opacity-100'
              }`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex items-baseline gap-2.5">
                  <span
                    className={`text-sm font-semibold ${
                      isSelected ? 'text-orange-600' : 'text-slate-900'
                    }`}
                  >
                    {shift.label}
                  </span>
                  <span className="font-mono text-xs text-slate-500 tabular-nums">
                    {shift.windowLabel}
                  </span>
                </div>

                <div className="flex items-baseline gap-3">
                  <span className={`text-xs font-medium ${efficiencyStatus.cls}`}>
                    {efficiencyStatus.label}
                  </span>
                  <span className="font-mono text-sm font-bold text-slate-900 tabular-nums">
                    {hasData ? `${shift.eficienciaEfetivaPct.toFixed(1).replace('.', ',')}%` : '—'}
                  </span>
                </div>
              </div>

              {/* Composition bar */}
              <div className="mt-2.5 h-2.5 w-full overflow-hidden rounded-xs bg-slate-100 flex">
                {hasData && (
                  <>
                    <div
                      style={{ width: `${prodPct}%` }}
                      className="h-full bg-emerald-600"
                      title={`Trabalho efetivo: ${formatHMS(shift.produtivoSeg)}`}
                    />
                    <div
                      style={{ width: `${relPct}%` }}
                      className="h-full bg-amber-500"
                      title={`Relanti: ${formatHMS(shift.relantiSeg)}`}
                    />
                    <div
                      style={{ width: `${parPct}%` }}
                      className="h-full bg-slate-400"
                      title={`Parado: ${formatHMS(shift.paradoSeg)}`}
                    />
                  </>
                )}
              </div>

              {/* Exact numerical metrics row */}
              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-slate-600 tabular-nums">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span>
                    <strong className="text-slate-900">{shift.entradas}</strong> entradas
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Operação <strong className="font-mono text-slate-900">{formatHMS(shift.utilizacaoSeg)}</strong>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Efetivo <strong className="font-mono text-emerald-700">{formatHMS(shift.produtivoSeg)}</strong>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Relanti <strong className="font-mono text-amber-700">{formatHMS(shift.relantiSeg)}</strong> ({relPct.toFixed(1).replace('.', ',')}%)
                  </span>
                </div>
                <div className="text-slate-500 truncate max-w-[260px]">
                  {shift.condutores.length > 0
                    ? shift.condutores.join(', ')
                    : 'Sem condutores registados'}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
