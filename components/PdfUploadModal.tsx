'use client';

import { useState } from 'react';
import { FileUp, Loader2, X } from 'lucide-react';

import { FleetModuleId } from '@/lib/fleet-types';

interface PdfUploadModalProps {
  activeModule?: FleetModuleId;
  open: boolean;
  isUploading: boolean;
  error: string | null;
  onClose: () => void;
  onUpload: (file: File, mode: 'replace' | 'append') => Promise<void>;
}

export function PdfUploadModal({
  activeModule = 'metalurgia',
  open,
  isUploading,
  error,
  onClose,
  onUpload,
}: PdfUploadModalProps) {
  const [mode, setMode] = useState<'replace' | 'append'>('append');

  if (!open) return null;

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await onUpload(file, mode);
    e.target.value = '';
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
    >
      <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="upload-modal-title" className="text-base font-semibold text-slate-900">
              Importar Relatório PDF · Módulo{' '}
              <span className="text-orange-700">
                {activeModule === 'exploracao' ? 'EXPLORAÇÃO' : 'METALURGIA'}
              </span>
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Selecione um PDF do sistema Novatronica (Entradas/Saídas de Áreas) para extração automática. Relatórios de Exploração ou Metalurgia são encaminhados automaticamente.
            </p>
          </div>
          <button
            type="button"
            disabled={isUploading}
            onClick={onClose}
            aria-label="Fechar janela"
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-md border border-orange-100 bg-orange-50/40 p-1">
          <button
            type="button"
            onClick={() => setMode('append')}
            className={`flex-1 rounded py-1.5 text-xs font-medium transition-colors ${
              mode === 'append'
                ? 'bg-orange-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Acumular ao Histórico
          </button>
          <button
            type="button"
            onClick={() => setMode('replace')}
            className={`flex-1 rounded py-1.5 text-xs font-medium transition-colors ${
              mode === 'replace'
                ? 'bg-orange-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Substituir Dataset Atual
          </button>
        </div>

        <label
          htmlFor="modal-pdf-input"
          className={`mt-4 flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-10 text-center transition-colors ${
            isUploading
              ? 'border-orange-400 bg-orange-50/50 cursor-wait'
              : 'border-orange-200 bg-white hover:border-orange-500 hover:bg-orange-50/30 cursor-pointer'
          }`}
        >
          {isUploading ? (
            <>
              <Loader2 className="h-7 w-7 animate-spin text-orange-600" aria-hidden="true" />
              <span className="mt-3 text-sm font-semibold text-slate-900">
                A extrair ciclos e tempos do PDF...
              </span>
              <span className="mt-1 text-xs text-slate-500">
                Isto pode demorar alguns segundos conforme o número de páginas.
              </span>
            </>
          ) : (
            <>
              <FileUp className="h-7 w-7 text-orange-600" aria-hidden="true" />
              <span className="mt-3 text-sm font-semibold text-slate-900">
                Selecionar ficheiro PDF
              </span>
              <span className="mt-1 text-xs text-slate-500">
                Suporta relatórios multi-página com centenas de entradas/saídas.
              </span>
            </>
          )}
          <input
            id="modal-pdf-input"
            type="file"
            accept="application/pdf,.pdf"
            disabled={isUploading}
            onChange={handleFile}
            className="sr-only"
          />
        </label>

        {error && (
          <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
