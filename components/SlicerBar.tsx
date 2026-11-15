'use client';

import { RotateCcw, Download, Printer } from 'lucide-react';
import { getAllShiftOptions } from '@/lib/fleet-analytics';
import { FilterState, ReportMetadata, ShiftScheme } from '@/lib/fleet-types';

interface SlicerBarProps {
  metadata: ReportMetadata;
  filters: FilterState;
  availableAreas: string[];
  availableEquipment: string[];
  availableDrivers: string[];
  filteredCount: number;
  totalCount: number;
  totalEntradas: number;
  onFilterChange: (patch: Partial<FilterState>) => void;
  onResetFilters: () => void;
  onExportCsv: () => void;
}

export function SlicerBar({
  metadata,
  filters,
  availableAreas,
  availableEquipment,
  availableDrivers,
  filteredCount,
  totalCount,
  totalEntradas,
  onFilterChange,
  onResetFilters,
  onExportCsv,
}: SlicerBarProps) {
  const shiftOptions = getAllShiftOptions(filters.shiftScheme);
  const hasActiveFilters =
    filters.area !== 'ALL' ||
    filters.equipamento !== 'ALL' ||
    filters.condutor !== 'ALL' ||
    filters.shiftId !== 'ALL' ||
    filters.hour !== null ||
    filters.searchQuery.trim() !== '';

  return (
    <section
      aria-label="Filtros Power BI"
      className="border-b border-orange-100 bg-white"
    >
      <div className="mx-auto max-w-[1440px] px-6 py-4 space-y-3">
        {/* Top Metadata Context Strip (Zero-Pill unboxed text) */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="font-semibold text-orange-700">{metadata.organizacao}</span>
            <span aria-hidden="true">·</span>
            <span>Grupo {metadata.grupoEquipamentos}</span>
            <span aria-hidden="true">·</span>
            <span>
              Período <strong className="font-medium text-slate-700 tabular-nums">{metadata.dataInicio}</strong> até{' '}
              <strong className="font-medium text-slate-700 tabular-nums">{metadata.dataFim}</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>Margem GPS {metadata.margem}</span>
            <span aria-hidden="true">·</span>
            <span>{metadata.fusoHorario}</span>
          </div>

          <div className="flex items-center gap-2 no-print">
            <span className="text-xs text-slate-500 tabular-nums mr-2">
              Resumo: <strong className="text-slate-900">{filteredCount}</strong>/{totalCount} ·{' '}
              <strong className="text-orange-700">{totalEntradas}</strong> entradas
            </span>
            <button
              type="button"
              onClick={onExportCsv}
              className="inline-flex items-center gap-1.5 rounded-md border border-orange-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-orange-50 hover:text-orange-800 whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5 text-orange-600" aria-hidden="true" />
              <span>Exportar CSV</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-md border border-orange-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-orange-50 hover:text-orange-800 whitespace-nowrap shrink-0"
            >
              <Printer className="h-3.5 w-3.5 text-orange-600" aria-hidden="true" />
              <span>Imprimir</span>
            </button>
          </div>
        </div>

        {/* Interactive Cross-Filter Slicers */}
        <div className="flex flex-wrap items-end gap-3 no-print">
          <div className="flex flex-col gap-1 min-w-[160px]">
            <label htmlFor="slicer-area" className="text-[11px] font-medium text-slate-500">
              Área Operacional
            </label>
            <select
              id="slicer-area"
              value={filters.area}
              onChange={(e) => onFilterChange({ area: e.target.value })}
              className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-900 focus:border-orange-600 focus:outline-none"
            >
              <option value="ALL">Todas as Áreas ({availableAreas.length})</option>
              {availableAreas.map((area) => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1 min-w-[155px]">
            <label htmlFor="slicer-equip" className="text-[11px] font-medium text-slate-500">
              Equipamento
            </label>
            <select
              id="slicer-equip"
              value={filters.equipamento}
              onChange={(e) => onFilterChange({ equipamento: e.target.value })}
              className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-900 focus:border-orange-600 focus:outline-none"
            >
              <option value="ALL">Todos ({availableEquipment.length} ativos)</option>
              {availableEquipment.map((eq) => (
                <option key={eq} value={eq}>
                  {eq}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1 min-w-[210px]">
            <label htmlFor="slicer-driver" className="text-[11px] font-medium text-slate-500">
              Condutor
            </label>
            <select
              id="slicer-driver"
              value={filters.condutor}
              onChange={(e) => onFilterChange({ condutor: e.target.value })}
              className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-900 focus:border-orange-600 focus:outline-none"
            >
              <option value="ALL">Todos os Condutores ({availableDrivers.length})</option>
              {availableDrivers.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          {/* Shift Scheme Segmented Control */}
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-slate-500">
              Regime de Turnos
            </span>
            <div className="flex h-9 items-center rounded-md border border-orange-100 bg-orange-50/40 p-0.5">
              {(['3x8h', '2x12h'] as ShiftScheme[]).map((scheme) => {
                const active = filters.shiftScheme === scheme;
                return (
                  <button
                    key={scheme}
                    type="button"
                    onClick={() => onFilterChange({ shiftScheme: scheme, shiftId: 'ALL' })}
                    className={`h-full rounded px-2.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      active
                        ? 'bg-orange-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {scheme === '3x8h' ? '3 Turnos (8h)' : '2 Turnos (12h)'}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Shift Filter Segmented Control */}
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-slate-500">
              Turno de Trabalho
            </span>
            <div className="flex h-9 items-center rounded-md border border-orange-100 bg-orange-50/40 p-0.5 overflow-x-auto">
              <button
                type="button"
                onClick={() => onFilterChange({ shiftId: 'ALL' })}
                className={`h-full rounded px-2.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  filters.shiftId === 'ALL'
                    ? 'bg-orange-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Todos
              </button>
              {shiftOptions.map((opt) => {
                const active = filters.shiftId === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onFilterChange({ shiftId: opt.id })}
                    className={`h-full rounded px-2.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      active
                        ? 'bg-orange-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {filters.hour !== null && (
            <button
              type="button"
              onClick={() => onFilterChange({ hour: null })}
              className="h-9 rounded-md border border-orange-200 bg-orange-50 px-3 text-xs font-medium text-orange-800 hover:bg-orange-100 whitespace-nowrap shrink-0"
            >
              Hora: {String(filters.hour).padStart(2, '0')}h ×
            </button>
          )}

          {hasActiveFilters && (
            <button
              type="button"
              onClick={onResetFilters}
              className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-orange-700 hover:bg-orange-50 whitespace-nowrap shrink-0"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Limpar Filtros</span>
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
