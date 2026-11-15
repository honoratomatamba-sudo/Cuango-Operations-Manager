'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { formatHMS } from '@/lib/fleet-analytics';
import { EquipmentAreaMetrics, ReportMetadata } from '@/lib/fleet-types';

interface EquipmentAreaMatrixProps {
  rows: EquipmentAreaMetrics[];
  metadata: ReportMetadata;
  selectedEquipment: string;
  onSelectEquipment: (equipamento: string) => void;
}

export function EquipmentAreaMatrix({
  rows,
  metadata,
  selectedEquipment,
  onSelectEquipment,
}: EquipmentAreaMatrixProps) {
  const [showFleetAudit, setShowFleetAudit] = useState(false);

  const activeSet = new Set(rows.map((r) => r.equipamento));
  const inactiveEquipment = metadata.equipamentosNoFiltro.filter(
    (eq) => !activeSet.has(eq)
  );

  return (
    <div className="rounded-lg border border-orange-100 bg-white">
      <div className="border-b border-orange-100 px-6 py-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Equipamentos por Área Selecionada (Entradas e Operação)
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Contagem exata de quantas vezes cada máquina esteve na área e o tempo total de operação.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowFleetAudit((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-md border border-orange-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-orange-50 whitespace-nowrap shrink-0"
        >
          <span>
            Cobertura do Grupo ({activeSet.size}/{metadata.equipamentosNoFiltro.length})
          </span>
          {showFleetAudit ? (
            <ChevronUp className="h-3.5 w-3.5 text-orange-600" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-orange-600" aria-hidden="true" />
          )}
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="p-8 text-center text-sm text-slate-500">
          Nenhum equipamento com registos para os filtros atuais.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-orange-100 bg-orange-50/40 text-[11px] font-semibold text-slate-700">
                <th className="py-2.5 pl-6 pr-3">Equipamento</th>
                <th className="py-2.5 px-3">Área</th>
                <th className="py-2.5 px-3 text-right">Entradas na Área</th>
                <th className="py-2.5 px-3 text-right">Permanência Total</th>
                <th className="py-2.5 px-3 text-right">Operação Total</th>
                <th className="py-2.5 px-3 text-right">Trabalho Efetivo</th>
                <th className="py-2.5 px-3 text-right">Relanti</th>
                <th className="py-2.5 px-3 text-right">Distância</th>
                <th className="py-2.5 pl-3 pr-6 text-right">Eficiência</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {rows.map((row) => {
                const isSelected = selectedEquipment === row.equipamento;
                return (
                  <tr
                    key={`${row.equipamento}-${row.area}`}
                    onClick={() =>
                      onSelectEquipment(isSelected ? 'ALL' : row.equipamento)
                    }
                    className={`cursor-pointer transition-colors hover:bg-slate-50 ${
                      isSelected ? 'bg-orange-50/60' : ''
                    }`}
                  >
                    <td className="py-3 pl-6 pr-3">
                      <div className="font-mono font-semibold text-slate-900">
                        {row.equipamento}
                      </div>
                      <div className="text-[11px] text-slate-500 tabular-nums">
                        {row.condutoresCount} condutores · {row.primeiraEntrada.split(' ')[1]}–{row.ultimaSaida.split(' ')[1]}
                      </div>
                    </td>
                    <td className="py-3 px-3 font-medium text-slate-800">
                      {row.area}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-sm font-bold text-slate-900 tabular-nums">
                      {row.entradas}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-slate-900 tabular-nums">
                      {formatHMS(row.permanenciaSeg)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-semibold text-slate-900 tabular-nums">
                      {formatHMS(row.utilizacaoSeg)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-medium text-emerald-700 tabular-nums">
                      {formatHMS(row.produtivoSeg)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-amber-700 tabular-nums">
                      {formatHMS(row.relantiSeg)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-slate-700 tabular-nums">
                      {row.distanciaHoras.toFixed(1).replace('.', ',')} h
                    </td>
                    <td className="py-3 pl-3 pr-6 text-right font-mono font-bold text-slate-900 tabular-nums">
                      {row.eficienciaEfetivaPct.toFixed(1).replace('.', ',')}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showFleetAudit && (
        <div className="border-t border-orange-100 bg-orange-50/30 px-6 py-4">
          <p className="text-xs font-semibold text-slate-800">
            Auditoria do Grupo {metadata.grupoEquipamentos} ({metadata.equipamentosNoFiltro.length} equipamentos configurados no relatório)
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Ativos com entradas em {metadata.areaSelecionada}:{' '}
            <span className="font-mono font-semibold text-emerald-700">
              {Array.from(activeSet).join(', ') || 'Nenhum'}
            </span>
          </p>
          {inactiveEquipment.length > 0 && (
            <p className="mt-2 text-xs text-slate-500 leading-relaxed">
              Sem entradas registadas no período ({inactiveEquipment.length}):{' '}
              <span className="font-mono text-slate-600">
                {inactiveEquipment.join(', ')}
              </span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
