'use client';

import { useState } from 'react';
import {
  Check,
  Copy,
  Download,
  FileUp,
  Loader2,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import {
  generateDAXMeasures,
  generatePowerQueryM,
} from '@/lib/fleet-analytics';
import { FleetDataset, ShiftScheme } from '@/lib/fleet-types';
import {
  GmailInboxSyncPanel,
  GmailSyncController,
} from './GmailInboxSyncPanel';

interface PowerBiAutomationViewProps {
  dataset: FleetDataset;
  filteredCount: number;
  totalEntradas: number;
  shiftScheme: ShiftScheme;
  isUploading: boolean;
  uploadError: string | null;
  uploadSuccess: string | null;
  gmail: GmailSyncController;
  onUploadPdf: (file: File, mode: 'replace' | 'append') => Promise<void>;
  onCleanDuplicates: () => Promise<void>;
  onResetToSeed: () => void;
  onExportCsv: () => void;
}

export function PowerBiAutomationView({
  dataset,
  filteredCount,
  totalEntradas,
  shiftScheme,
  isUploading,
  uploadError,
  uploadSuccess,
  gmail,
  onUploadPdf,
  onCleanDuplicates,
  onResetToSeed,
  onExportCsv,
}: PowerBiAutomationViewProps) {
  const [ingestMode, setIngestMode] = useState<'replace' | 'append'>('append');
  const [copiedBlock, setCopiedBlock] = useState<'m' | 'dax' | 'url' | null>(null);

  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'https://seu-dominio.app';
  const feedUrl = `${origin}/api/powerbi/feed?turnoModelo=${shiftScheme}`;
  const mScript = generatePowerQueryM(feedUrl);
  const daxMeasures = generateDAXMeasures();

  const handleCopy = async (text: string, block: 'm' | 'dax' | 'url') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedBlock(block);
      setTimeout(() => setCopiedBlock(null), 2000);
    } catch {
      // Fallback ignored if clipboard blocked
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await onUploadPdf(file, ingestMode);
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-6">
      <GmailInboxSyncPanel ingestMode={ingestMode} gmail={gmail} />

      {/* Section 1: Automated PDF Pipeline */}
      <div className="rounded-lg border border-orange-100 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Extração Automatizada de Relatórios PDF (Novatronica GPS)
            </h2>
            <p className="mt-1 text-xs text-slate-600 max-w-2xl">
              Carregue novos PDFs de Entradas/Saídas de Áreas para extrair automaticamente todas as linhas,
              classificar turnos e atualizar a tabela analítica e o feed do Power BI.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void onCleanDuplicates()}
              className="inline-flex items-center gap-1.5 rounded-md border border-orange-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-orange-50 whitespace-nowrap shrink-0"
            >
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
              <span>Verificar e Limpar Duplicados</span>
            </button>

            <button
              type="button"
              onClick={onResetToSeed}
              className="inline-flex items-center gap-1.5 rounded-md border border-orange-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-orange-50 whitespace-nowrap shrink-0"
            >
              <RotateCcw className="h-3.5 w-3.5 text-orange-600" aria-hidden="true" />
              <span>Repor PDF Original (14/11/2026)</span>
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <label
              htmlFor="pdf-automation-input"
              className={`flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-8 text-center transition-colors cursor-pointer ${
                isUploading
                  ? 'border-orange-400 bg-orange-50/50 cursor-wait'
                  : 'border-orange-200 bg-white hover:border-orange-500 hover:bg-orange-50/30'
              }`}
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-7 w-7 animate-spin text-orange-600" aria-hidden="true" />
                  <span className="mt-3 text-sm font-semibold text-slate-900">
                    A processar tabelas e horários do PDF...
                  </span>
                  <span className="mt-1 text-xs text-slate-500">
                    A normalizar equipamentos, condutores e durações para o modelo Power BI.
                  </span>
                </>
              ) : (
                <>
                  <FileUp className="h-7 w-7 text-orange-600" aria-hidden="true" />
                  <span className="mt-3 text-sm font-semibold text-slate-900">
                    Clique para selecionar um relatório PDF Novatronica
                  </span>
                  <span className="mt-1 text-xs text-slate-500">
                    Extrai automaticamente entradas, saídas, utilização, relanti, parado e área (máx. 20 MB).
                  </span>
                </>
              )}
              <input
                id="pdf-automation-input"
                type="file"
                accept="application/pdf,.pdf"
                disabled={isUploading}
                onChange={handleFileChange}
                className="sr-only"
              />
            </label>

            {uploadError && (
              <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3.5 py-2 text-xs text-red-700">
                {uploadError}
              </p>
            )}
            {uploadSuccess && (
              <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs text-emerald-800">
                {uploadSuccess}
              </p>
            )}
          </div>

          <div className="flex flex-col justify-between rounded-lg border border-orange-100 bg-orange-50/30 p-4">
            <div>
              <span className="text-xs font-semibold text-slate-900">
                Modo de Ingestão
              </span>
              <div className="mt-2.5 space-y-2">
                <label className="flex items-start gap-2.5 cursor-pointer text-xs">
                  <input
                    type="radio"
                    name="ingestMode"
                    checked={ingestMode === 'append'}
                    onChange={() => setIngestMode('append')}
                    className="mt-0.5 accent-orange-600"
                  />
                  <span>
                    <strong className="block text-slate-900">Acumular Histórico</strong>
                    <span className="text-slate-500">
                      Adiciona novos dias, áreas ou máquinas ao modelo atual.
                    </span>
                  </span>
                </label>

                <label className="flex items-start gap-2.5 cursor-pointer text-xs">
                  <input
                    type="radio"
                    name="ingestMode"
                    checked={ingestMode === 'replace'}
                    onChange={() => setIngestMode('replace')}
                    className="mt-0.5 accent-orange-600"
                  />
                  <span>
                    <strong className="block text-slate-900">Substituir Base</strong>
                    <span className="text-slate-500">
                      Analisa apenas o novo relatório PDF isoladamente.
                    </span>
                  </span>
                </label>
              </div>
            </div>

            <div className="mt-4 border-t border-slate-200 pt-3 text-xs text-slate-600 tabular-nums">
              Resumo ativo: <strong className="text-slate-900">{dataset.records.length}</strong> linhas ·{' '}
              <strong className="text-slate-900">{filteredCount}</strong> filtradas ·{' '}
              <strong className="text-slate-900">{totalEntradas}</strong> entradas na área
            </div>
          </div>
        </div>
      </div>

      {/* Section 2: Power BI Direct Export & Connectors */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Power Query M Connector */}
        <div className="rounded-lg border border-orange-100 bg-white p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Conector Power Query (Linguagem M)
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  No Power BI Desktop: Obter Dados → Consulta Nula → Editor Avançado.
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(mScript, 'm')}
                className="inline-flex items-center gap-1.5 rounded-md border border-orange-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-orange-50 whitespace-nowrap shrink-0"
              >
                {copiedBlock === 'm' ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                    <span>Copiado</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5 text-orange-600" aria-hidden="true" />
                    <span>Copiar Script M</span>
                  </>
                )}
              </button>
            </div>

            <div className="mt-4 flex items-center justify-between gap-2 rounded-md border border-orange-100 bg-orange-50/35 px-3 py-2">
              <code className="font-mono text-[11px] text-slate-700 truncate">
                {feedUrl}
              </code>
              <button
                type="button"
                onClick={() => handleCopy(feedUrl, 'url')}
                className="text-xs font-medium text-orange-600 hover:text-orange-700 whitespace-nowrap shrink-0"
              >
                {copiedBlock === 'url' ? 'URL Copiada' : 'Copiar URL'}
              </button>
            </div>

            <pre className="mt-3 max-h-64 overflow-auto rounded-md border border-orange-100 bg-slate-50 p-4 font-mono text-[11px] leading-relaxed text-slate-800">
              {mScript}
            </pre>
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-orange-100 pt-4">
            <span className="text-xs text-slate-500">
              Prefere importar ficheiro estático?
            </span>
            <button
              type="button"
              onClick={onExportCsv}
              className="inline-flex items-center gap-1.5 rounded-md bg-orange-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-orange-700 whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Descarregar CSV Power BI</span>
            </button>
          </div>
        </div>

        {/* DAX Measures Bundle */}
        <div className="rounded-lg border border-orange-100 bg-white p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Medidas DAX Prontas para Modelo Semântico
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Fórmulas exatas para entradas na área, horas em HH:MM:SS, trabalho efetivo e taxa de relanti.
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(daxMeasures, 'dax')}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                {copiedBlock === 'dax' ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                    <span>Copiado</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Copiar DAX</span>
                  </>
                )}
              </button>
            </div>

            <pre className="mt-4 max-h-[312px] overflow-auto rounded-md border border-orange-100 bg-slate-50 p-4 font-mono text-[11px] leading-relaxed text-slate-800">
              {daxMeasures}
            </pre>
          </div>

          <p className="mt-4 border-t border-orange-100 pt-4 text-xs text-slate-500">
            Todas as medidas reconciliam com o relatório original Novatronica: Utilização = Trabalho Efetivo + Relanti; Permanência = Utilização + Parado.
          </p>
        </div>
      </div>
    </div>
  );
}
