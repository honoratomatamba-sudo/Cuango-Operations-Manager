'use client';

import { formatHMS } from '@/lib/fleet-analytics';
import { GlobalKPIs } from '@/lib/fleet-types';

interface KpiStripProps {
  kpis: GlobalKPIs;
  selectedAreaLabel: string;
}

export function KpiStrip({ kpis, selectedAreaLabel }: KpiStripProps) {
  const cards = [
    {
      label: `Entradas em ${selectedAreaLabel}`,
      value: String(kpis.totalEntradas),
      unit: 'ocorrências',
      detail: `Média ${formatHMS(kpis.mediaPermanenciaPorEntradaSeg)} / entrada · Distância ${kpis.distanciaHoras.toFixed(1).replace('.', ',')} h`,
      emphasis: 'neutral' as const,
    },
    {
      label: 'Permanência Total na Área',
      value: formatHMS(kpis.permanenciaSeg),
      unit: 'hh:mm:ss',
      detail: `Parado (motor desligado): ${formatHMS(kpis.paradoSeg)} (${kpis.taxaParadoPct.toFixed(1).replace('.', ',')}%)`,
      emphasis: 'neutral' as const,
    },
    {
      label: 'Tempo Total de Operação (Motor)',
      value: formatHMS(kpis.utilizacaoSeg),
      unit: `${kpis.disponibilidadeMotorPct.toFixed(1).replace('.', ',')}% da permanência`,
      detail: `Trabalho produtivo líquido: ${formatHMS(kpis.produtivoSeg)}`,
      emphasis: 'positive' as const,
    },
    {
      label: 'Eficiência Operacional Efetiva',
      value: `${kpis.eficienciaEfetivaPct.toFixed(1).replace('.', ',')}%`,
      unit: 'trabalho útil / área',
      detail: `Relanti (marcha lenta): ${formatHMS(kpis.relantiSeg)} (${kpis.taxaRelantiSobreUtilizacaoPct.toFixed(1).replace('.', ',')}% do motor)`,
      emphasis:
        kpis.eficienciaEfetivaPct >= 65
          ? ('positive' as const)
          : kpis.eficienciaEfetivaPct >= 45
          ? ('warning' as const)
          : ('danger' as const),
    },
  ];

  const accentText = {
    neutral: 'text-slate-900',
    positive: 'text-emerald-700',
    warning: 'text-amber-700',
    danger: 'text-red-700',
  };

  return (
    <section aria-label="Indicadores Principais" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="flex flex-col justify-between rounded-lg border border-orange-100 bg-white p-5"
        >
          <p className="text-xs font-medium text-slate-600">{card.label}</p>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span
              className={`font-mono text-2xl font-bold tracking-tight tabular-nums ${accentText[card.emphasis]}`}
            >
              {card.value}
            </span>
            <span className="text-xs text-slate-500">{card.unit}</span>
          </div>
          <p className="mt-3 border-t border-orange-100/80 pt-2.5 text-xs text-slate-600 tabular-nums">
            {card.detail}
          </p>
        </div>
      ))}
    </section>
  );
}
