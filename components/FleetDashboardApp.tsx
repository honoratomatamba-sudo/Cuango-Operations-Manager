'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import Image from 'next/image';
import { User } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import { AuthSessionResponse, PublicUser } from '@/lib/auth-types';
import {
  applyFilters,
  canonicalFileName,
  computeDriverMetrics,
  computeEquipmentAreaMetrics,
  computeGlobalKPIs,
  computeHourlyDistribution,
  computeShiftMetrics,
  deduplicateDataset,
  formatHMS,
  generatePowerBICSV,
  getEntryCount,
  isDuplicateFileName,
  mergeDatasetsWithoutDuplicates,
  OFFICIAL_REPORT_FOOTER,
} from '@/lib/fleet-analytics';
import { CUANGO_SEED_DATASET } from '@/lib/cuango-seed-data';
import { FilterState, FleetDataset } from '@/lib/fleet-types';
import {
  clearAccessToken,
  getAccessToken,
  googleSignIn,
  initAuth,
  logout,
} from '@/lib/firebase-auth';
import {
  ActiveTab,
  DashboardSidebar,
  WorkspaceTopBar,
} from './DashboardHeader';
import { AuthLoginScreen } from './AuthLoginScreen';
import { ChangePasswordModal } from './ChangePasswordModal';
import { UsersManagementView } from './UsersManagementView';
import { SlicerBar } from './SlicerBar';
import { KpiStrip } from './KpiStrip';
import { HourlyDistributionChart } from './HourlyDistributionChart';
import { ShiftEfficiencyPanel } from './ShiftEfficiencyPanel';
import { DriverPerformanceTable } from './DriverPerformanceTable';
import { EquipmentAreaMatrix } from './EquipmentAreaMatrix';
import { CyclesDetailTable } from './CyclesDetailTable';
import { ReportsView } from './ReportsView';
import { PowerBiAutomationView } from './PowerBiAutomationView';
import { PdfUploadModal } from './PdfUploadModal';
import {
  GmailAttachmentRow,
  GmailSyncController,
} from './GmailInboxSyncPanel';

const INITIAL_FILTERS: FilterState = {
  area: 'ALL',
  equipamento: 'ALL',
  condutor: 'ALL',
  shiftScheme: '3x8h',
  shiftId: 'ALL',
  hour: null,
  searchQuery: '',
};

const AUTOSYNC_STORAGE_KEY = 'cuango_gmail_autosync';
const IMPORTED_IDS_STORAGE_KEY = 'cuango_gmail_imported_ids_v3';
const DATASET_STORAGE_KEY = 'cuango_fleet_dataset_v3';
const AUTH_TOKEN_STORAGE_KEY = 'cuango_auth_token_v1';
const STORAGE_CHANGE_EVENT = 'cuango-storage-change';

let inMemoryDatasetFallback: FleetDataset | null = null;

function subscribeLocalStorage(callback: () => void) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('storage', callback);
  window.addEventListener(STORAGE_CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(STORAGE_CHANGE_EVENT, callback);
  };
}

function getAutoSyncSnapshot(): boolean {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(AUTOSYNC_STORAGE_KEY) !== 'false';
}

function getAutoSyncServerSnapshot(): boolean {
  return true;
}

function getImportedIdsSnapshotRaw(): string {
  if (typeof window === 'undefined') return '[]';
  return window.localStorage.getItem(IMPORTED_IDS_STORAGE_KEY) ?? '[]';
}

function getImportedIdsServerSnapshotRaw(): string {
  return '[]';
}

function getDatasetSnapshotRaw(): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(DATASET_STORAGE_KEY) ?? '';
}

function getDatasetServerSnapshotRaw(): string {
  return '';
}

function writeDatasetToStorage(nextDataset: FleetDataset): FleetDataset {
  const clean = deduplicateDataset(nextDataset).dataset;
  inMemoryDatasetFallback = clean;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(DATASET_STORAGE_KEY, JSON.stringify(clean));
    } catch {
      // Ignore quota errors; inMemoryDatasetFallback holds latest state
    }
    window.dispatchEvent(new Event(STORAGE_CHANGE_EVENT));
  }
  return clean;
}

function writeAutoSyncPreference(enabled: boolean) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(AUTOSYNC_STORAGE_KEY, enabled ? 'true' : 'false');
  window.dispatchEvent(new Event(STORAGE_CHANGE_EVENT));
}

function persistImportedAttachmentId(attachmentKey: string) {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(IMPORTED_IDS_STORAGE_KEY) ?? '[]';
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? (parsed as string[]) : [];
    if (!list.includes(attachmentKey)) {
      list.push(attachmentKey);
      window.localStorage.setItem(
        IMPORTED_IDS_STORAGE_KEY,
        JSON.stringify(list.slice(-300))
      );
      window.dispatchEvent(new Event(STORAGE_CHANGE_EVENT));
    }
  } catch {
    window.localStorage.setItem(
      IMPORTED_IDS_STORAGE_KEY,
      JSON.stringify([attachmentKey])
    );
    window.dispatchEvent(new Event(STORAGE_CHANGE_EVENT));
  }
}

export function FleetDashboardApp() {
  const datasetRaw = useSyncExternalStore(
    subscribeLocalStorage,
    getDatasetSnapshotRaw,
    getDatasetServerSnapshotRaw
  );

  const dataset = useMemo<FleetDataset>(() => {
    if (!datasetRaw) {
      return inMemoryDatasetFallback
        ? deduplicateDataset(inMemoryDatasetFallback).dataset
        : deduplicateDataset(CUANGO_SEED_DATASET).dataset;
    }
    try {
      const parsed = JSON.parse(datasetRaw) as FleetDataset;
      if (parsed && Array.isArray(parsed.records) && parsed.metadata) {
        return deduplicateDataset(parsed).dataset;
      }
    } catch {
      // Fallback to seed if corrupted
    }
    return deduplicateDataset(CUANGO_SEED_DATASET).dataset;
  }, [datasetRaw]);

  const datasetRef = useRef<FleetDataset>(dataset);
  useEffect(() => {
    datasetRef.current = dataset;
  }, [dataset]);

  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS);

  // Application user/password authentication state
  const [authChecking, setAuthChecking] = useState(true);
  const [currentUser, setCurrentUser] = useState<PublicUser | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  // Lifted Gmail auth state (persists across all tab switches)
  const [gmailUser, setGmailUser] = useState<User | null>(null);
  const [needsAuth, setNeedsAuth] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [customQuery, setCustomQuery] = useState('');
  const [isFetchingList, setIsFetchingList] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [isBatchImporting, setIsBatchImporting] = useState(false);
  const [gmailItems, setGmailItems] = useState<GmailAttachmentRow[]>([]);
  const [lastSyncText, setLastSyncText] = useState<string | null>(null);
  const [gmailError, setGmailError] = useState<string | null>(null);

  // Active by default and persisted across tab changes & reloads until manually toggled off
  const autoSyncEnabled = useSyncExternalStore(
    subscribeLocalStorage,
    getAutoSyncSnapshot,
    getAutoSyncServerSnapshot
  );

  const autoSyncEnabledRef = useRef<boolean>(autoSyncEnabled);
  useEffect(() => {
    autoSyncEnabledRef.current = autoSyncEnabled;
  }, [autoSyncEnabled]);

  const importedIdsRaw = useSyncExternalStore(
    subscribeLocalStorage,
    getImportedIdsSnapshotRaw,
    getImportedIdsServerSnapshotRaw
  );

  const importedIds = useMemo(() => {
    try {
      const parsed = JSON.parse(importedIdsRaw);
      return new Set<string>(Array.isArray(parsed) ? parsed : []);
    } catch {
      return new Set<string>();
    }
  }, [importedIdsRaw]);

  const importedIdsRef = useRef<Set<string>>(importedIds);
  useEffect(() => {
    importedIdsRef.current = importedIds;
  }, [importedIds]);

  const hasAutoSyncedOnAuthRef = useRef(false);

  // Keep server Power BI feed synchronized with active deduplicated client dataset
  useEffect(() => {
    if (!datasetRaw) return;
    void fetch('/api/powerbi/feed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataset }),
    }).catch(() => {});
  }, [dataset, datasetRaw]);

  useEffect(() => {
    try {
      window.localStorage.removeItem('cuango_fleet_dataset_v1');
      window.localStorage.removeItem('cuango_gmail_imported_ids');
      window.localStorage.removeItem('cuango_fleet_dataset_v2');
      window.localStorage.removeItem('cuango_gmail_imported_ids_v2');
    } catch {
      // Ignore storage access errors
    }

    const unsub = initAuth(
      (signedUser) => {
        setGmailUser(signedUser);
        setNeedsAuth(false);
      },
      (signedUser) => {
        setGmailUser(signedUser);
        setNeedsAuth(true);
        hasAutoSyncedOnAuthRef.current = false;
      }
    );
    return () => unsub();
  }, []);

  // Verify application user/password session on mount
  useEffect(() => {
    let isCancelled = false;

    const verifySession = async () => {
      let storedToken: string | null = null;
      try {
        storedToken = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
      } catch {
        storedToken = null;
      }

      try {
        const headers: Record<string, string> = {};
        if (storedToken) {
          headers.Authorization = `Bearer ${storedToken}`;
        }

        const res = await fetch('/api/auth/session', {
          headers,
          cache: 'no-store',
        });
        if (!res.ok || isCancelled) return;
        const data = (await res.json()) as AuthSessionResponse;
        if (isCancelled) return;

        setNeedsSetup(Boolean(data.needsSetup));
        if (data.authenticated && data.user) {
          setCurrentUser(data.user);
          setAuthToken(storedToken);
        } else {
          setCurrentUser(null);
          setAuthToken(null);
          try {
            window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
          } catch {
            // Ignore storage errors
          }
        }
      } catch {
        // Ignore transient network errors
      } finally {
        if (!isCancelled) {
          setAuthChecking(false);
        }
      }
    };

    void verifySession();

    return () => {
      isCancelled = true;
    };
  }, []);

  // Load workspace & fleet records from Supabase once authenticated
  useEffect(() => {
    if (!currentUser) return;
    let isCancelled = false;

    const loadFromSupabase = async () => {
      try {
        const res = await fetch('/api/supabase/fleet', { cache: 'no-store' });
        if (!res.ok || isCancelled) return;
        const data = (await res.json()) as {
          schemaReady?: boolean;
          autoSyncEnabled?: boolean;
          dataset?: FleetDataset | null;
        };
        if (isCancelled || !data.schemaReady) return;

        if (typeof data.autoSyncEnabled === 'boolean' && data.autoSyncEnabled !== autoSyncEnabledRef.current) {
          writeAutoSyncPreference(data.autoSyncEnabled);
        }

        if (data.dataset && Array.isArray(data.dataset.records) && data.dataset.records.length > 0) {
          const persisted = writeDatasetToStorage(data.dataset);
          datasetRef.current = persisted;
        } else if (!data.dataset) {
          await fetch('/api/supabase/fleet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'sync',
              dataset: datasetRef.current,
              autoSyncEnabled: autoSyncEnabledRef.current,
            }),
          });
        }
      } catch {
        // Offline or schema not yet created; local storage remains active
      }
    };

    void loadFromSupabase();

    return () => {
      isCancelled = true;
    };
  }, [currentUser]);

  const hasDetailCycles = Boolean(
    dataset.detailCycles && dataset.detailCycles.length > 0
  );

  const availableAreas = useMemo(
    () => Array.from(new Set(dataset.records.map((r) => r.area))).sort(),
    [dataset.records]
  );

  const availableEquipment = useMemo(
    () => Array.from(new Set(dataset.records.map((r) => r.equipamento))).sort(),
    [dataset.records]
  );

  const availableDrivers = useMemo(
    () =>
      Array.from(new Set(dataset.records.map((r) => r.condutorCompleto))).sort(),
    [dataset.records]
  );

  // Primary report records come from "Resumo" page
  const filteredResumoRecords = useMemo(
    () =>
      applyFilters(
        dataset.records,
        hasDetailCycles ? { ...filters, shiftId: 'ALL', hour: null } : filters
      ),
    [dataset.records, filters, hasDetailCycles]
  );

  // Granular cycles from "Lista" (when available) allow accurate hourly/shift slicing
  const filteredDetailCycles = useMemo(() => {
    if (!hasDetailCycles || !dataset.detailCycles) return filteredResumoRecords;
    return applyFilters(dataset.detailCycles, filters);
  }, [dataset.detailCycles, filters, hasDetailCycles, filteredResumoRecords]);

  // Base for hourly/shift charts keeps all hours/shifts visible for interactive cross-filtering
  const detailBaseWithoutHour = useMemo(() => {
    const src =
      hasDetailCycles && dataset.detailCycles
        ? dataset.detailCycles
        : dataset.records;
    return applyFilters(src, { ...filters, hour: null });
  }, [dataset.detailCycles, dataset.records, filters, hasDetailCycles]);

  const detailBaseWithoutShift = useMemo(() => {
    const src =
      hasDetailCycles && dataset.detailCycles
        ? dataset.detailCycles
        : dataset.records;
    return applyFilters(src, { ...filters, shiftId: 'ALL' });
  }, [dataset.detailCycles, dataset.records, filters, hasDetailCycles]);

  // Use Resumo primary report by default; switch to filtered detail cycles only when shift/hour slicer narrows within the day
  const isIntraDaySliced =
    hasDetailCycles && (filters.shiftId !== 'ALL' || filters.hour !== null);
  const analyticsRecords = isIntraDaySliced
    ? filteredDetailCycles
    : filteredResumoRecords;

  const kpis = useMemo(
    () => computeGlobalKPIs(analyticsRecords),
    [analyticsRecords]
  );

  const shiftMetrics = useMemo(
    () => computeShiftMetrics(detailBaseWithoutShift, filters.shiftScheme),
    [detailBaseWithoutShift, filters.shiftScheme]
  );

  const driverMetrics = useMemo(
    () => computeDriverMetrics(analyticsRecords, filters.shiftScheme),
    [analyticsRecords, filters.shiftScheme]
  );

  const equipmentAreaMetrics = useMemo(
    () => computeEquipmentAreaMetrics(analyticsRecords),
    [analyticsRecords]
  );

  const hourlyBuckets = useMemo(
    () => computeHourlyDistribution(detailBaseWithoutHour),
    [detailBaseWithoutHour]
  );

  const selectedAreaLabel =
    filters.area !== 'ALL'
      ? filters.area
      : availableAreas.length === 1
      ? availableAreas[0]
      : 'Áreas Selecionadas';

  const handleFilterChange = (patch: Partial<FilterState>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  };

  const handleResetFilters = () => {
    setFilters((prev) => ({
      ...INITIAL_FILTERS,
      shiftScheme: prev.shiftScheme,
    }));
  };

  const handleExportCsv = () => {
    const csv = generatePowerBICSV(analyticsRecords, filters.shiftScheme);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Cuango_Fleet_PowerBI_${dataset.metadata.dataInicio.replace(/\//g, '-')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const applyIncomingDataset = useCallback(
    async (
      incoming: FleetDataset,
      mode: 'replace' | 'append',
      label: string
    ): Promise<{ accepted: boolean; reason?: string }> => {
      const prev = deduplicateDataset(datasetRef.current).dataset;
      const cleanIncoming = deduplicateDataset(incoming).dataset;
      const merge = mergeDatasetsWithoutDuplicates(prev, cleanIncoming);

      if (merge.duplicateFile) {
        return {
          accepted: false,
          reason: `Importação bloqueada: o ficheiro "${cleanIncoming.metadata.arquivoOrigem}" já existe no sistema.`,
        };
      }

      if (merge.duplicateAllData) {
        return {
          accepted: false,
          reason: `Importação bloqueada: todos os dados de "${cleanIncoming.metadata.arquivoOrigem}" já existem no sistema (0 registos novos).`,
        };
      }

      const finalDataset =
        mode === 'append' ? merge.merged : cleanIncoming;

      const persisted = writeDatasetToStorage(finalDataset);
      datasetRef.current = persisted;

      void fetch('/api/supabase/fleet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: mode === 'replace' ? 'replace' : 'sync',
          dataset: persisted,
          autoSyncEnabled: autoSyncEnabledRef.current,
        }),
      }).catch(() => {});

      await fetch('/api/powerbi/feed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataset: persisted }),
      });

      setFilters((prevFilters) => ({
        ...INITIAL_FILTERS,
        shiftScheme: prevFilters.shiftScheme,
      }));

      const addedEntradas = (
        mode === 'append'
          ? persisted.records.slice(prev.records.length)
          : persisted.records
      ).reduce((acc, r) => acc + getEntryCount(r), 0);

      const dupNote =
        mode === 'append' && merge.skippedDuplicateCount > 0
          ? ` (${merge.skippedDuplicateCount} duplicados ignorados)`
          : '';

      setUploadSuccess(
        `Relatório "${label}" processado: ${
          mode === 'append' ? merge.addedResumoCount : persisted.records.length
        } linhas no Resumo · ${addedEntradas} entradas adicionadas${dupNote}.`
      );

      return { accepted: true };
    },
    []
  );

  const handleUploadPdf = async (file: File, mode: 'replace' | 'append') => {
    setIsUploading(true);
    setUploadError(null);
    setUploadSuccess(null);

    try {
      // Block duplicate filename BEFORE uploading or parsing
      if (isDuplicateFileName(datasetRef.current, file.name)) {
        throw new Error(
          `Importação bloqueada: o ficheiro "${file.name}" já existe no sistema.`
        );
      }

      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/parse-pdf', {
        method: 'POST',
        body: formData,
      });

      const rawText = await res.text();
      let payload: { dataset?: FleetDataset; error?: string };
      try {
        payload = JSON.parse(rawText) as {
          dataset?: FleetDataset;
          error?: string;
        };
      } catch {
        throw new Error(
          `Resposta inválida do servidor (HTTP ${res.status}). Verifique o tamanho ou formato do PDF.`
        );
      }

      if (!res.ok || !payload.dataset) {
        throw new Error(payload.error || 'Falha ao processar relatório PDF.');
      }

      const result = await applyIncomingDataset(payload.dataset, mode, file.name);
      if (!result.accepted) {
        throw new Error(
          result.reason || 'Dados duplicados bloqueados na importação.'
        );
      }
      setUploadModalOpen(false);
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : 'Erro ao processar arquivo PDF.'
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleCleanDuplicates = async () => {
    setUploadError(null);
    const current = datasetRef.current;
    const { dataset: cleaned, removedRecords, removedDetails } =
      deduplicateDataset(current);

    const persisted = writeDatasetToStorage(cleaned);
    datasetRef.current = persisted;

    void fetch('/api/supabase/fleet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'replace',
        dataset: persisted,
        autoSyncEnabled: autoSyncEnabledRef.current,
      }),
    }).catch(() => {});

    await fetch('/api/powerbi/feed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataset: persisted }),
    });

    const totalRemoved = removedRecords + removedDetails;
    if (totalRemoved > 0) {
      setUploadSuccess(
        `Limpeza concluída: ${removedRecords} linhas duplicadas do Resumo e ${removedDetails} ciclos duplicados eliminados.`
      );
    } else {
      setUploadSuccess(
        `Auditoria concluída: 0 duplicados encontrados — base 100% íntegra (${persisted.records.length} linhas Resumo · ${persisted.detailCycles?.length ?? 0} ciclos).`
      );
    }
  };

  const handleResetToSeed = async () => {
    const cleanSeed = writeDatasetToStorage(CUANGO_SEED_DATASET);
    datasetRef.current = cleanSeed;
    setFilters(INITIAL_FILTERS);
    setUploadError(null);
    setUploadSuccess(
      'Relatório Resumo original de 14/11/2026 (3 linhas · 113 entradas) restaurado.'
    );
    void fetch('/api/supabase/fleet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'replace',
        dataset: cleanSeed,
        autoSyncEnabled: autoSyncEnabledRef.current,
      }),
    }).catch(() => {});
    await fetch('/api/powerbi/feed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataset: cleanSeed }),
    });
  };

  const isFileAlreadyInSystem = useCallback(
    (filename: string) => isDuplicateFileName(dataset, filename),
    [dataset]
  );

  // Lifted Gmail actions with strict filename & content duplicate prevention
  const importGmailAttachment = useCallback(
    async (
      item: GmailAttachmentRow,
      mode: 'replace' | 'append'
    ): Promise<boolean> => {
      // Check filename BEFORE calling backend or downloading attachment
      if (isDuplicateFileName(datasetRef.current, item.filename)) {
        setGmailError(
          `Importação bloqueada: o ficheiro "${item.filename}" já existe no sistema.`
        );
        return false;
      }

      const token = await getAccessToken();
      if (!token) {
        setNeedsAuth(true);
        setGmailError('Sessão Gmail expirada. Clique em Sign in with Google.');
        return false;
      }

      setImportingId(item.id);
      setGmailError(null);
      try {
        const res = await fetch('/api/gmail/reports', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            messageId: item.messageId,
            attachmentId: item.attachmentId,
            filename: item.filename,
          }),
        });

        const rawText = await res.text();
        let data: { dataset?: FleetDataset; error?: string };
        try {
          data = JSON.parse(rawText) as {
            dataset?: FleetDataset;
            error?: string;
          };
        } catch {
          throw new Error(
            `Resposta inesperada (HTTP ${res.status}) ao ler anexo.`
          );
        }

        if (res.status === 401) {
          clearAccessToken();
          setNeedsAuth(true);
          throw new Error(data.error || 'Sessão expirada.');
        }

        if (!res.ok || !data.dataset) {
          throw new Error(
            data.error || 'Falha ao extrair anexo PDF do e-mail.'
          );
        }

        const applyResult = await applyIncomingDataset(
          data.dataset,
          mode,
          `Gmail: ${item.filename}`
        );
        if (!applyResult.accepted) {
          setGmailError(
            applyResult.reason || 'Anexo ignorado por conter dados já existentes.'
          );
          return false;
        }

        persistImportedAttachmentId(item.id);
        return true;
      } catch (err) {
        setGmailError(
          err instanceof Error
            ? err.message
            : 'Erro ao importar anexo do Gmail.'
        );
        return false;
      } finally {
        setImportingId(null);
      }
    },
    [applyIncomingDataset]
  );

  const fetchInboxPdfs = useCallback(
    async (autoImportNew: boolean) => {
      const token = await getAccessToken();
      if (!token) {
        setNeedsAuth(true);
        return;
      }

      setIsFetchingList(true);
      setGmailError(null);
      try {
        const params = new URLSearchParams();
        if (customQuery.trim()) {
          params.set('q', customQuery.trim());
        }

        const qs = params.toString();
        const url = `/api/gmail/reports${qs ? `?${qs}` : ''}`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const rawText = await res.text();
        let data: { items?: GmailAttachmentRow[]; error?: string };
        try {
          data = JSON.parse(rawText) as {
            items?: GmailAttachmentRow[];
            error?: string;
          };
        } catch {
          throw new Error(
            `Resposta inválida do servidor (HTTP ${res.status}).`
          );
        }

        if (res.status === 401) {
          clearAccessToken();
          setNeedsAuth(true);
          throw new Error(data.error || 'Sessão Gmail expirada.');
        }

        if (!res.ok) {
          throw new Error(
            data.error || 'Erro ao pesquisar e-mails no Gmail.'
          );
        }

        const found = data.items ?? [];
        setGmailItems(found);

        const existingFilesCount = found.filter((it) =>
          isDuplicateFileName(datasetRef.current, it.filename)
        ).length;

        setLastSyncText(
          `Última verificação: ${new Date().toLocaleTimeString('pt-PT')} (${found.length} PDFs de alertasdigital@novatronica.com · ${existingFilesCount} já no sistema)`
        );

        if (autoImportNew && found.length > 0) {
          const batchSeenCanonNames = new Set<string>();
          for (const it of found) {
            if (importedIdsRef.current.has(it.id)) continue;
            const canon = canonicalFileName(it.filename);
            if (
              isDuplicateFileName(datasetRef.current, it.filename) ||
              batchSeenCanonNames.has(canon)
            ) {
              continue;
            }
            batchSeenCanonNames.add(canon);
            await importGmailAttachment(it, 'append');
          }
        }
      } catch (err) {
        setGmailError(
          err instanceof Error ? err.message : 'Erro ao sincronizar Gmail.'
        );
      } finally {
        setIsFetchingList(false);
      }
    },
    [customQuery, importGmailAttachment]
  );

  // Persistent 5-minute automatic sync across all tabs while authenticated and enabled
  useEffect(() => {
    if (!currentUser || !autoSyncEnabled || needsAuth) return;

    let initialTimer: ReturnType<typeof setTimeout> | null = null;
    if (!hasAutoSyncedOnAuthRef.current) {
      hasAutoSyncedOnAuthRef.current = true;
      initialTimer = setTimeout(() => {
        void fetchInboxPdfs(true);
      }, 100);
    }

    const interval = setInterval(() => {
      void fetchInboxPdfs(true);
    }, 5 * 60 * 1000);

    return () => {
      if (initialTimer) clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [currentUser, autoSyncEnabled, needsAuth, fetchInboxPdfs]);

  const handleGmailLogin = async () => {
    setIsLoggingIn(true);
    setGmailError(null);
    try {
      const result = await googleSignIn();
      setGmailUser(result.user);
      setNeedsAuth(false);
    } catch (err) {
      setGmailError(
        err instanceof Error ? err.message : 'Não foi possível ligar ao Gmail.'
      );
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleGmailLogout = async () => {
    await logout();
    setGmailUser(null);
    setNeedsAuth(true);
    setGmailItems([]);
    hasAutoSyncedOnAuthRef.current = false;
  };

  const handleGmailBatchImport = async () => {
    const batchSeenCanonNames = new Set<string>();
    const pending = gmailItems.filter((it) => {
      if (importedIds.has(it.id)) return false;
      if (isDuplicateFileName(datasetRef.current, it.filename)) return false;
      const canon = canonicalFileName(it.filename);
      if (batchSeenCanonNames.has(canon)) return false;
      batchSeenCanonNames.add(canon);
      return true;
    });

    if (pending.length === 0) return;

    setIsBatchImporting(true);
    setGmailError(null);
    try {
      for (const it of pending) {
        if (isDuplicateFileName(datasetRef.current, it.filename)) continue;
        await importGmailAttachment(it, 'append');
      }
    } catch (err) {
      setGmailError(
        err instanceof Error
          ? err.message
          : 'Erro na importação em lote do Gmail.'
      );
    } finally {
      setIsBatchImporting(false);
    }
  };

  const gmailController: GmailSyncController = {
    user: gmailUser,
    needsAuth,
    isLoggingIn,
    customQuery,
    onCustomQueryChange: setCustomQuery,
    isFetchingList,
    importingId,
    isBatchImporting,
    items: gmailItems,
    importedIds,
    isFileAlreadyInSystem,
    autoSyncEnabled,
    onToggleAutoSync: (enabled: boolean) => {
      writeAutoSyncPreference(enabled);
      void fetch('/api/supabase/fleet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'preference',
          autoSyncEnabled: enabled,
        }),
      }).catch(() => {});
    },
    lastSyncText,
    error: gmailError,
    onLogin: handleGmailLogin,
    onLogout: handleGmailLogout,
    onFetchInboxPdfs: fetchInboxPdfs,
    onImportAttachment: importGmailAttachment,
    onBatchImport: handleGmailBatchImport,
  };

  const handleAuthSuccess = (user: PublicUser, token: string) => {
    try {
      window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
    } catch {
      // Ignore storage access errors
    }
    setAuthToken(token);
    setCurrentUser(user);
    setNeedsSetup(false);
    setActiveTab('overview');
  };

  const handleAppLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore network errors on logout
    }
    try {
      window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    } catch {
      // Ignore storage access errors
    }
    setCurrentUser(null);
    setAuthToken(null);
    setActiveTab('overview');
  };

  if (authChecking) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4 px-6">
        <Image
          src="/assets/aistudio/image_33e20192.png"
          alt="CUANGO — Sociedade Mineira do Cuango Lda"
          width={259}
          height={68}
          priority
          referrerPolicy="no-referrer"
          className="h-12 w-auto object-contain"
        />
        <p className="text-xs font-medium text-slate-500">
          A verificar sessão...
        </p>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <AuthLoginScreen
        needsSetup={needsSetup}
        onAuthenticated={handleAuthSuccess}
      />
    );
  }

  const canUpload = currentUser.role !== 'visualizador';

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col lg:flex-row print-reset-layout">
      <DashboardSidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onOpenUpload={() => {
          setUploadError(null);
          setUploadModalOpen(true);
        }}
        totalRecords={filteredResumoRecords.length}
        currentUser={currentUser}
        onOpenChangePassword={() => setChangePasswordOpen(true)}
        onLogout={handleAppLogout}
      />

      <div className="flex-1 min-w-0 flex flex-col bg-white print-reset-layout">
        <WorkspaceTopBar
          activeTab={activeTab}
          canUpload={canUpload}
          onOpenUpload={() => {
            setUploadError(null);
            setUploadModalOpen(true);
          }}
        />

        {activeTab !== 'users' && (
          <SlicerBar
            metadata={dataset.metadata}
            filters={filters}
            availableAreas={availableAreas}
            availableEquipment={availableEquipment}
            availableDrivers={availableDrivers}
            filteredCount={filteredResumoRecords.length}
            totalCount={dataset.records.length}
            totalEntradas={kpis.totalEntradas}
            onFilterChange={handleFilterChange}
            onResetFilters={handleResetFilters}
            onExportCsv={handleExportCsv}
          />
        )}

        <main className="flex-1 mx-auto w-full max-w-[1440px] px-6 py-6 space-y-6 bg-white print-reset-layout">
          {activeTab !== 'reports' && activeTab !== 'users' && (
            <KpiStrip kpis={kpis} selectedAreaLabel={selectedAreaLabel} />
          )}

          <AnimatePresence mode="wait">
            {activeTab === 'overview' && (
              <motion.div
                key="overview"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                className="space-y-6"
              >
                {/* Operational Summary Banner (Clean factual insight, zero-pill) */}
                {analyticsRecords.length > 0 && (
                  <div className="rounded-lg border border-orange-100 bg-orange-50/35 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
                    <div className="space-y-0.5">
                      <h1 className="text-sm font-semibold text-slate-900">
                        Diagnóstico Automatizado (Relatório Resumo) · {selectedAreaLabel}
                      </h1>
                      <p className="text-xs text-slate-600 tabular-nums">
                        Total de <strong>{kpis.totalEntradas}</strong> entradas registadas, totalizando{' '}
                        <strong className="font-mono text-slate-900">{formatHMS(kpis.utilizacaoSeg)}</strong> de operação de motor em{' '}
                        <strong className="font-mono text-slate-900">{formatHMS(kpis.permanenciaSeg)}</strong> na área.{' '}
                        <strong className="font-mono text-amber-700">{formatHMS(kpis.relantiSeg)}</strong> ({kpis.taxaRelantiSobreUtilizacaoPct.toFixed(1).replace('.', ',')}%) ocorreram em marcha lenta (Relanti).
                      </p>
                    </div>
                    <div className="flex items-center gap-4 shrink-0 no-print">
                      <button
                        type="button"
                        onClick={() => setActiveTab('reports')}
                        className="text-xs font-semibold text-orange-700 hover:text-orange-800 whitespace-nowrap"
                      >
                        Abrir Relatórios →
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('powerbi')}
                        className="text-xs font-semibold text-slate-600 hover:text-orange-700 whitespace-nowrap"
                      >
                        Automação Power BI →
                      </button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
                  <div className="xl:col-span-7">
                    <HourlyDistributionChart
                      buckets={hourlyBuckets}
                      selectedHour={filters.hour}
                      onSelectHour={(hour) => handleFilterChange({ hour })}
                    />
                  </div>
                  <div className="xl:col-span-5">
                    <ShiftEfficiencyPanel
                      shifts={shiftMetrics}
                      scheme={filters.shiftScheme}
                      selectedShiftId={filters.shiftId}
                      onSelectShift={(shiftId) => handleFilterChange({ shiftId })}
                    />
                  </div>
                </div>

                <EquipmentAreaMatrix
                  rows={equipmentAreaMetrics}
                  metadata={dataset.metadata}
                  selectedEquipment={filters.equipamento}
                  onSelectEquipment={(equipamento) =>
                    handleFilterChange({ equipamento })
                  }
                />

                <DriverPerformanceTable
                  drivers={driverMetrics}
                  selectedDriver={filters.condutor}
                  onSelectDriver={(condutor) => handleFilterChange({ condutor })}
                />
              </motion.div>
            )}

            {activeTab === 'reports' && (
              <motion.div
                key="reports"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              >
                <ReportsView
                  dataset={dataset}
                  selectedAreaLabel={selectedAreaLabel}
                  shiftScheme={filters.shiftScheme}
                  kpis={kpis}
                  equipmentRows={equipmentAreaMetrics}
                  driverRows={driverMetrics}
                  shiftRows={shiftMetrics}
                  records={filteredResumoRecords}
                />
              </motion.div>
            )}

            {activeTab === 'shifts_drivers' && (
              <motion.div
                key="shifts_drivers"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                className="space-y-6"
              >
                <ShiftEfficiencyPanel
                  shifts={shiftMetrics}
                  scheme={filters.shiftScheme}
                  selectedShiftId={filters.shiftId}
                  onSelectShift={(shiftId) => handleFilterChange({ shiftId })}
                />
                <DriverPerformanceTable
                  drivers={driverMetrics}
                  selectedDriver={filters.condutor}
                  onSelectDriver={(condutor) => handleFilterChange({ condutor })}
                />
                <EquipmentAreaMatrix
                  rows={equipmentAreaMetrics}
                  metadata={dataset.metadata}
                  selectedEquipment={filters.equipamento}
                  onSelectEquipment={(equipamento) =>
                    handleFilterChange({ equipamento })
                  }
                />
              </motion.div>
            )}

            {activeTab === 'cycles' && (
              <motion.div
                key="cycles"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              >
                <CyclesDetailTable
                  records={filteredResumoRecords}
                  detailCycles={hasDetailCycles ? filteredDetailCycles : undefined}
                  shiftScheme={filters.shiftScheme}
                  searchQuery={filters.searchQuery}
                  onSearchChange={(searchQuery) =>
                    handleFilterChange({ searchQuery })
                  }
                />
              </motion.div>
            )}

            {activeTab === 'powerbi' && (
              <motion.div
                key="powerbi"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              >
                <PowerBiAutomationView
                  dataset={dataset}
                  filteredCount={filteredResumoRecords.length}
                  totalEntradas={kpis.totalEntradas}
                  shiftScheme={filters.shiftScheme}
                  isUploading={isUploading}
                  uploadError={uploadError}
                  uploadSuccess={uploadSuccess}
                  gmail={gmailController}
                  onUploadPdf={handleUploadPdf}
                  onCleanDuplicates={handleCleanDuplicates}
                  onResetToSeed={handleResetToSeed}
                  onExportCsv={handleExportCsv}
                />
              </motion.div>
            )}

            {activeTab === 'users' && currentUser.role === 'admin' && (
              <motion.div
                key="users"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              >
                <UsersManagementView
                  currentUser={currentUser}
                  authToken={authToken}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {activeTab !== 'reports' && (
          <footer className="mx-auto w-full max-w-[1440px] border-t border-orange-100 bg-white px-6 py-4 text-xs text-slate-600 flex flex-wrap items-center justify-between gap-2">
            <span>{OFFICIAL_REPORT_FOOTER}</span>
            <span className="truncate max-w-md text-slate-500">
              Ficheiro ativo: {dataset.metadata.arquivoOrigem}
              {!needsAuth && autoSyncEnabled && ' · Gmail auto-sync ativo (5 min)'}
            </span>
          </footer>
        )}
      </div>

      <PdfUploadModal
        open={uploadModalOpen}
        isUploading={isUploading}
        error={uploadError}
        onClose={() => setUploadModalOpen(false)}
        onUpload={handleUploadPdf}
      />

      <ChangePasswordModal
        open={changePasswordOpen}
        username={currentUser.username}
        authToken={authToken}
        onClose={() => setChangePasswordOpen(false)}
      />
    </div>
  );
}
