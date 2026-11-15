'use client';

import { User } from 'firebase/auth';
import { Check, Loader2, LogOut, Mail, RefreshCw, Search, ShieldCheck } from 'lucide-react';

export const AUTHORIZED_NOVATRONICA_SENDER = 'alertasdigital@novatronica.com';

export interface GmailAttachmentRow {
  id: string;
  messageId: string;
  attachmentId: string;
  filename: string;
  sizeBytes: number;
  subject: string;
  from: string;
  date: string;
  internalDateMs: number;
}

export interface GmailSyncController {
  user: User | null;
  needsAuth: boolean;
  isLoggingIn: boolean;
  customQuery: string;
  onCustomQueryChange: (q: string) => void;
  isFetchingList: boolean;
  importingId: string | null;
  isBatchImporting: boolean;
  items: GmailAttachmentRow[];
  importedIds: Set<string>;
  isFileAlreadyInSystem: (filename: string) => boolean;
  autoSyncEnabled: boolean;
  onToggleAutoSync: (enabled: boolean) => void;
  lastSyncText: string | null;
  error: string | null;
  onLogin: () => Promise<void>;
  onLogout: () => Promise<void>;
  onFetchInboxPdfs: (autoImportNew: boolean) => Promise<void>;
  onImportAttachment: (
    item: GmailAttachmentRow,
    mode: 'replace' | 'append'
  ) => Promise<boolean>;
  onBatchImport: () => Promise<void>;
}

interface GmailInboxSyncPanelProps {
  ingestMode: 'replace' | 'append';
  gmail: GmailSyncController;
}

export function GmailInboxSyncPanel({
  ingestMode,
  gmail,
}: GmailInboxSyncPanelProps) {
  const formatBytes = (bytes: number) => {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const pendingCount = gmail.items.filter(
    (it) =>
      !gmail.importedIds.has(it.id) &&
      !gmail.isFileAlreadyInSystem(it.filename)
  ).length;

  return (
    <div className="rounded-lg border border-orange-100 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-orange-600" aria-hidden="true" />
            <h2 className="text-base font-semibold text-slate-900">
              Receção Automática por E-mail (Gmail)
            </h2>
          </div>
          <p className="mt-1 text-xs text-slate-600 max-w-2xl">
            Ligue a sua caixa de entrada Gmail para importar automaticamente relatórios PDF novos recebidos apenas de{' '}
            <strong className="font-mono text-slate-800">{AUTHORIZED_NOVATRONICA_SENDER}</strong>. Ficheiros com nome ou dados já existentes no sistema são bloqueados automaticamente.
          </p>
        </div>

        {!gmail.needsAuth && gmail.user && (
          <div className="flex items-center gap-3 text-xs">
            <span className="text-slate-600">
              Ligado como <strong className="text-slate-900">{gmail.user.email}</strong>
            </span>
            <button
              type="button"
              onClick={() => void gmail.onLogout()}
              className="inline-flex items-center gap-1 rounded-md border border-orange-200 bg-white px-2.5 py-1.5 font-medium text-slate-700 hover:bg-orange-50 whitespace-nowrap"
            >
              <LogOut className="h-3.5 w-3.5 text-orange-600" aria-hidden="true" />
              <span>Desligar</span>
            </button>
          </div>
        )}
      </div>

      {gmail.needsAuth ? (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-orange-100 bg-orange-50/35 p-5">
          <div className="space-y-1 max-w-xl">
            <p className="text-xs font-semibold text-slate-900">
              {gmail.user?.email
                ? `Renovar ligação Gmail (${gmail.user.email})`
                : `Autorizar leitura de relatórios enviados por ${AUTHORIZED_NOVATRONICA_SENDER}`}
            </p>
            <p className="text-xs text-slate-600">
              A aplicação consulta exclusivamente e-mails com anexo PDF desse remetente e verifica o nome do ficheiro para impedir qualquer importação duplicada.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void gmail.onLogin()}
            disabled={gmail.isLoggingIn}
            className="inline-flex items-center gap-3 rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-800 shadow-xs transition-colors hover:bg-slate-50 disabled:opacity-60 whitespace-nowrap shrink-0"
          >
            <span className="h-4 w-4 shrink-0" aria-hidden="true">
              <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                <path fill="none" d="M0 0h48v48H0z" />
              </svg>
            </span>
            <span>{gmail.isLoggingIn ? 'A ligar...' : 'Sign in with Google'}</span>
          </button>
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="h-9 inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-xs text-slate-700">
                Remetente: <strong className="ml-1 font-mono text-slate-900">{AUTHORIZED_NOVATRONICA_SENDER}</strong>
              </div>

              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={gmail.customQuery}
                  onChange={(e) => gmail.onCustomQueryChange(e.target.value)}
                  placeholder="Filtro extra opcional (ex: Lavaria)"
                  className="h-9 w-56 rounded-md border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-orange-600 focus:bg-white focus:outline-none"
                />
              </div>

              <button
                type="button"
                disabled={gmail.isFetchingList}
                onClick={() => void gmail.onFetchInboxPdfs(false)}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-orange-600 px-3.5 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                {gmail.isFetchingList ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span>Procurar E-mails</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={gmail.autoSyncEnabled}
                  onChange={(e) => gmail.onToggleAutoSync(e.target.checked)}
                  className="h-4 w-4 accent-orange-600"
                />
                <span>Auto-importar novos a cada 5 min</span>
              </label>

              {pendingCount > 0 && (
                <button
                  type="button"
                  disabled={gmail.isBatchImporting}
                  onClick={() => void gmail.onBatchImport()}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-orange-200 bg-orange-50 px-3 text-xs font-semibold text-orange-800 hover:bg-orange-100 disabled:opacity-50 whitespace-nowrap"
                >
                  {gmail.isBatchImporting
                    ? 'A importar lote...'
                    : `Importar ${pendingCount} novo(s)`}
                </button>
              )}
            </div>
          </div>

          {gmail.lastSyncText && (
            <p className="text-[11px] text-slate-500 tabular-nums">
              {gmail.lastSyncText}
            </p>
          )}

          {gmail.error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3.5 py-2 text-xs text-red-700">
              {gmail.error}
            </p>
          )}

          {gmail.items.length > 0 ? (
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                    <th className="py-2.5 pl-4 pr-3">Ficheiro PDF</th>
                    <th className="py-2.5 px-3">Assunto</th>
                    <th className="py-2.5 px-3">Remetente</th>
                    <th className="py-2.5 px-3 text-right">Tamanho</th>
                    <th className="py-2.5 pl-3 pr-4 text-right">Estado / Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {gmail.items.map((item) => {
                    const alreadyInSystem = gmail.isFileAlreadyInSystem(item.filename);
                    const isImported = gmail.importedIds.has(item.id);
                    const isBusy = gmail.importingId === item.id;
                    return (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="py-2.5 pl-4 pr-3 font-mono font-medium text-slate-900">
                          {item.filename}
                        </td>
                        <td className="py-2.5 px-3 text-slate-700 max-w-[260px] truncate">
                          {item.subject}
                        </td>
                        <td className="py-2.5 px-3 text-slate-500 max-w-[220px] truncate">
                          {item.from}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-500 tabular-nums">
                          {formatBytes(item.sizeBytes)}
                        </td>
                        <td className="py-2.5 pl-3 pr-4 text-right whitespace-nowrap">
                          {alreadyInSystem ? (
                            <span
                              title="Ficheiro com este nome já existe no sistema"
                              className="inline-flex items-center gap-1 text-xs font-medium text-slate-500"
                            >
                              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                              Já no sistema
                            </span>
                          ) : isImported ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                              <Check className="h-3.5 w-3.5" aria-hidden="true" />
                              Importado
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={isBusy || gmail.isBatchImporting}
                              onClick={() =>
                                void gmail.onImportAttachment(item, ingestMode)
                              }
                              className="inline-flex items-center gap-1.5 rounded border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                            >
                              {isBusy && (
                                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                              )}
                              <span>Importar</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            !gmail.isFetchingList && (
              <p className="rounded-md border border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-500">
                Clique em &ldquo;Procurar E-mails&rdquo; para listar anexos PDF recebidos de {AUTHORIZED_NOVATRONICA_SENDER}.
              </p>
            )
          )}
        </div>
      )}
    </div>
  );
}
