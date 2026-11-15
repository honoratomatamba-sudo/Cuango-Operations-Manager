'use client';

import { formatHMS } from '@/lib/fleet-analytics';
import { DriverMetrics } from '@/lib/fleet-types';

interface DriverPerformanceTableProps {
  drivers: DriverMetrics[];
  selectedDriver: string;
  onSelectDriver: (condutorCompleto: string) => void;
}

export function DriverPerformanceTable({
  drivers,
  selectedDriver,
  onSelectDriver,
}: DriverPerformanceTableProps) {
  return (
    <div className="rounded-lg border border-orange-100 bg-white">
      <div className="border-b border-orange-100 px-6 py-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Desempenho dos Condutores
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Clique num condutor para cruzar todos os gráficos e registos da página.
          </p>
        </div>
        {selectedDriver !== 'ALL' && (
          <button
            type="button"
            onClick={() => onSelectDriver('ALL')}
            className="text-xs font-medium text-orange-600 hover:text-orange-700"
          >
            Mostrar todos os condutores
          </button>
        )}
      </div>

      {drivers.length === 0 ? (
        <div className="p-8 text-center text-sm text-slate-500">
          Nenhum condutor encontrado para os filtros aplicados.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-orange-100 bg-orange-50/40 text-[11px] font-semibold text-slate-700">
                <th className="py-2.5 pl-6 pr-3">Condutor</th>
                <th className="py-2.5 px-3 text-right">Entradas</th>
                <th className="py-2.5 px-3 text-right">Permanência</th>
                <th className="py-2.5 px-3 text-right">Operação (Motor)</th>
                <th className="py-2.5 px-3 text-right">Trabalho Efetivo</th>
                <th className="py-2.5 px-3 text-right">Relanti</th>
                <th className="py-2.5 px-3 text-right">Parado</th>
                <th className="py-2.5 px-3 text-right">Média/Ciclo</th>
                <th className="py-2.5 pl-3 pr-6 text-right">Eficiência</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {drivers.map((d) => {
                const isSelected = selectedDriver === d.condutorCompleto;
                const isDimmed =
                  selectedDriver !== 'ALL' && !isSelected;

                const effColor =
                  d.eficienciaEfetivaPct >= 65
                    ? 'text-emerald-700'
                    : d.eficienciaEfetivaPct >= 45
                    ? 'text-amber-700'
                    : 'text-red-700';

                const effTag =
                  d.eficienciaEfetivaPct >= 65
                    ? 'Ótima'
                    : d.eficienciaEfetivaPct >= 45
                    ? 'Moderada'
                    : 'Alto Relanti';

                return (
                  <tr
                    key={d.condutorCompleto}
                    onClick={() =>
                      onSelectDriver(isSelected ? 'ALL' : d.condutorCompleto)
                    }
                    className={`cursor-pointer transition-colors hover:bg-slate-50 ${
                      isSelected ? 'bg-orange-50/60' : ''
                    } ${isDimmed ? 'opacity-45' : 'opacity-100'}`}
                  >
                    <td className="py-3 pl-6 pr-3">
                      <div className="font-semibold text-slate-900">
                        {d.condutorNome}
                      </div>
                      <div className="text-[11px] text-slate-500 tabular-nums">
                        ID {d.condutorCodigo} · {d.turnos.join(', ')}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-900 font-semibold">
                      {d.entradas}{' '}
                      <span className="font-normal text-slate-400">
                        ({d.participacaoEntradasPct.toFixed(0)}%)
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-900">
                      {formatHMS(d.permanenciaSeg)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-900">
                      {formatHMS(d.utilizacaoSeg)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums font-medium text-emerald-700">
                      {formatHMS(d.produtivoSeg)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-amber-700">
                      {formatHMS(d.relantiSeg)}{' '}
                      <span className="text-[11px] text-slate-500">
                        ({d.taxaRelantiPct.toFixed(1).replace('.', ',')}%)
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-600">
                      {formatHMS(d.paradoSeg)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700">
                      {formatHMS(d.mediaCicloSeg)}
                    </td>
                    <td className="py-3 pl-3 pr-6 text-right tabular-nums">
                      <div className={`font-mono font-bold ${effColor}`}>
                        {d.eficienciaEfetivaPct.toFixed(1).replace('.', ',')}%
                      </div>
                      <div className={`text-[11px] font-medium ${effColor}`}>
                        {effTag}
                      </div>
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
