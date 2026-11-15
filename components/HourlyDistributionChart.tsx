'use client';

import { useState } from 'react';
import { formatHMS } from '@/lib/fleet-analytics';
import { HourlyBucket } from '@/lib/fleet-types';

interface HourlyDistributionChartProps {
  buckets: HourlyBucket[];
  selectedHour: number | null;
  onSelectHour: (hour: number | null) => void;
}

export function HourlyDistributionChart({
  buckets,
  selectedHour,
  onSelectHour,
}: HourlyDistributionChartProps) {
  const [hoveredHour, setHoveredHour] = useState<number | null>(null);

  const maxSeconds = Math.max(...buckets.map((b) => b.permanenciaSeg), 60);
  const activeBucket =
    hoveredHour !== null
      ? buckets[hoveredHour]
      : selectedHour !== null
      ? buckets[selectedHour]
      : null;

  return (
    <div className="rounded-lg border border-orange-100 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Distribuição Horária de Permanência e Entradas
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Clique numa barra horária (00h–23h) para filtrar os ciclos e condutores dessa hora.
          </p>
        </div>

        {/* Clean inline legend without pill boxes */}
        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-xs bg-emerald-600" aria-hidden="true" />
            Trabalho Efetivo
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-xs bg-amber-500" aria-hidden="true" />
            Relanti (Ocioso)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-xs bg-slate-400" aria-hidden="true" />
            Parado
          </span>
        </div>
      </div>

      {/* Live readout bar for hovered or selected hour */}
      <div className="mt-4 flex min-h-[36px] flex-wrap items-center justify-between gap-3 rounded-md border border-orange-100 bg-orange-50/30 px-3.5 py-2 text-xs">
        {activeBucket && activeBucket.entradas > 0 ? (
          <div className="flex flex-wrap items-center gap-3 text-slate-700 tabular-nums">
            <span className="font-semibold text-slate-900">
              {activeBucket.hourLabel}–{String(activeBucket.hour + 1).padStart(2, '0')}h
            </span>
            <span aria-hidden="true">·</span>
            <span>
              <strong>{activeBucket.entradas}</strong> entradas
            </span>
            <span aria-hidden="true">·</span>
            <span>Permanência {formatHMS(activeBucket.permanenciaSeg)}</span>
            <span aria-hidden="true">·</span>
            <span className="text-emerald-700">
              Efetivo {formatHMS(activeBucket.produtivoSeg)} ({activeBucket.eficienciaPct.toFixed(0)}%)
            </span>
            <span aria-hidden="true">·</span>
            <span className="text-amber-700">Relanti {formatHMS(activeBucket.relantiSeg)}</span>
            <span aria-hidden="true">·</span>
            <span className="text-slate-600">Parado {formatHMS(activeBucket.paradoSeg)}</span>
          </div>
        ) : activeBucket ? (
          <span className="text-slate-500 tabular-nums">
            {activeBucket.hourLabel}–{String(activeBucket.hour + 1).padStart(2, '0')}h · Sem entradas registadas na área selecionada
          </span>
        ) : (
          <span className="text-slate-500">
            Passe o cursor sobre qualquer coluna para inspecionar os segundos exatos de operação e marcha lenta.
          </span>
        )}

        {selectedHour !== null && (
          <button
            type="button"
            onClick={() => onSelectHour(null)}
            className="text-xs font-medium text-orange-600 hover:text-orange-700 whitespace-nowrap"
          >
            Remover filtro das {String(selectedHour).padStart(2, '0')}h
          </button>
        )}
      </div>

      {/* Stacked Column Chart */}
      <div className="mt-5 overflow-x-auto pb-2">
        <div className="min-w-[680px]">
          <div className="grid grid-cols-24 gap-1.5 items-end h-52 border-b border-slate-200 pb-1">
            {buckets.map((b) => {
              const isSelected = selectedHour === b.hour;
              const isDimmed = selectedHour !== null && !isSelected;
              const totalPct = (b.permanenciaSeg / maxSeconds) * 100;
              const prodPct =
                b.permanenciaSeg > 0 ? (b.produtivoSeg / b.permanenciaSeg) * 100 : 0;
              const relPct =
                b.permanenciaSeg > 0 ? (b.relantiSeg / b.permanenciaSeg) * 100 : 0;
              const parPct =
                b.permanenciaSeg > 0 ? (b.paradoSeg / b.permanenciaSeg) * 100 : 0;

              return (
                <button
                  key={b.hour}
                  type="button"
                  onClick={() =>
                    onSelectHour(selectedHour === b.hour ? null : b.hour)
                  }
                  onMouseEnter={() => setHoveredHour(b.hour)}
                  onMouseLeave={() => setHoveredHour(null)}
                  aria-label={`${b.hourLabel}: ${b.entradas} entradas, permanência ${formatHMS(b.permanenciaSeg)}`}
                  className={`group flex h-full flex-col items-center justify-end focus-visible:outline-2 focus-visible:outline-orange-600 transition-opacity ${
                    isDimmed ? 'opacity-35 hover:opacity-80' : 'opacity-100'
                  }`}
                >
                  {b.entradas > 0 && (
                    <span className="mb-1 font-mono text-[10px] font-medium text-slate-500 tabular-nums group-hover:text-slate-900">
                      {b.entradas}
                    </span>
                  )}
                  <div
                    style={{ height: b.permanenciaSeg > 0 ? `${Math.max(4, totalPct)}%` : '2px' }}
                    className={`w-full max-w-[22px] rounded-t-xs overflow-hidden flex flex-col-reverse transition-transform ${
                      b.permanenciaSeg === 0
                        ? 'bg-slate-100'
                        : isSelected
                        ? 'ring-2 ring-orange-600 ring-offset-1'
                        : 'group-hover:brightness-95'
                    }`}
                  >
                    {b.permanenciaSeg > 0 && (
                      <>
                        <div
                          style={{ height: `${prodPct}%` }}
                          className="w-full bg-emerald-600"
                        />
                        <div
                          style={{ height: `${relPct}%` }}
                          className="w-full bg-amber-500"
                        />
                        <div
                          style={{ height: `${parPct}%` }}
                          className="w-full bg-slate-400"
                        />
                      </>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-1.5 grid grid-cols-24 gap-1.5 text-center">
            {buckets.map((b) => {
              const isSelected = selectedHour === b.hour;
              return (
                <span
                  key={b.hour}
                  className={`font-mono text-[10px] tabular-nums ${
                    isSelected
                      ? 'font-bold text-orange-600'
                      : b.entradas > 0
                      ? 'text-slate-700 font-medium'
                      : 'text-slate-400'
                  }`}
                >
                  {String(b.hour).padStart(2, '0')}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
