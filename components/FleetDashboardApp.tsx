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
import { CUANGO_EXPLORACAO_SEED_DATASET } from '@/lib/cuango-exploracao-seed';
import { CUANGO_SEED_DATASET } from '@/lib/cuango-seed-data';
import {
  applyFilters,
  canonicalFileName,
  computeDriverMetrics,
  computeEquipmentAreaMetrics,
  computeExplorationAreaMetrics,
  computeExplorationEquipmentMetrics,
  computeFuelKPIs,
  computeGlobalKPIs,
  computeHourlyDistribution,
  computeShiftMetrics,
  deduplicateDataset,
  formatHMS,
  generateInstitutionalReportCSV,
  generatePowerBICSV,
  getEntryCount,
  isDuplicateFileName,
  mergeDatasetsWithoutDuplicates,
  OFFICIAL_REPORT_FOOTER,
  resolveFuelProfile,
} from '@/lib/fleet-analytics';
import {
  FilterState,
  FleetDataset,
  FleetModuleId,
  FuelRatePair,
} from '@/lib/fleet-types';
import { parseNovatronicaPdfBytes } from '@/lib/novatronica-pdf-parser';
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
import { ExplorationModuleView } from './ExplorationModuleView';
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
const EXPLORACAO_DATASET_STORAGE_KEY = 'cuango_fleet_dataset_exploracao_v1';
const EXPLORACAO_FUEL_RATES_STORAGE_KEY = 'cuango_exploracao_fuel_rates_v1';
const AUTH_TOKEN_STORAGE_KEY = 'cuango_auth_token_v1';
const STORAGE_CHANGE_EVENT = 'cuango-storage-change';

const inMemoryDatasetFallback: Record<FleetModuleId, FleetDataset | null> = {
  metalurgia: null,
  exploracao: null,
};

function getDatasetStorageKey(moduleId: FleetModuleId): string {
  return moduleId === 'exploracao'
    ? EXPLORACAO_DATASET_STORAGE_KEY
    : DATASET_STORAGE_KEY;
}

function getSeedForModule(moduleId: FleetModuleId): FleetDataset {
  return moduleId === 'exploracao'
    ? CUANGO_EXPLORACAO_SEED_DATASET
    : CUANGO_SEED_DATASET;
}

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

function getMetalurgiaDatasetSnapshotRaw(): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(DATASET_STORAGE_KEY) ?? '';
}

function getExploracaoDatasetSnapshotRaw(): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(EXPLORACAO_DATASET_STORAGE_KEY) ?? '';
}

function getFuelRatesSnapshotRaw(): string {
  if (typeof window === 'undefined') return '{}';
  return window.localStorage.getItem(EXPLORACAO_FUEL_RATES_STORAGE_KEY) ?? '{}';
}

function getEmptyServerSnapshot(): string {
  return '';
}

function getEmptyObjectServerSnapshot(): string {
  return '{}';
}

function parseDatasetSnapshot(
  raw: string,
  moduleId: FleetModuleId
): FleetDataset {
  const fallback = inMemoryDatasetFallback[moduleId];
  const seed = getSeedForModule(moduleId);

  if (!raw) {
    return fallback
      ? deduplicateDataset(fallback).dataset
      : deduplicateDataset(seed).dataset;
  }
  try {
    const parsed = JSON.parse(raw) as FleetDataset;
    if (parsed && Array.isArray(parsed.records) && parsed.metadata) {
      return deduplicateDataset(parsed).dataset;
    }
  } catch {
    // Fallback to seed if corrupted
  }
  return deduplicateDataset(seed).dataset;
}

function writeDatasetToStorage(
  nextDataset: FleetDataset,
  moduleId: FleetModuleId
): FleetDataset {
  const clean = deduplicateDataset(nextDataset).dataset;
  inMemoryDatasetFallback[moduleId] = clean;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(
        getDatasetStorageKey(moduleId),
        JSON.stringify(clean)
      );
    } catch {
      // Ignore quota errors; inMemoryDatasetFallback holds latest state
    }
    window.dispatchEvent(new Event(STORAGE_CHANGE_EVENT));
  }
  return clean;
}

function writeFuelRatesToStorage(rates: Record<string, FuelRatePair>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      EXPLORACAO_FUEL_RATES_STORAGE_KEY,
      JSON.stringify(rates)
    );
  } catch {
    // Ignore quota errors
  }
  window.dispatchEvent(new Event(STORAGE_CHANGE_EVENT));
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

function detectModuleFromDataset(
  incoming: FleetDataset,
  fallback: FleetModuleId
): FleetModuleId {
  const grupo = (incoming.metadata.grupoEquipamentos || '').toLowerCase();
  const arq = (incoming.metadata.arquivoOrigem || '').toLowerCase();
  if (grupo.includes('explora') || arq.includes('explora')) {
    return 'exploracao';
  }
  if (grupo.includes('metalurg') || arq.includes('metalurg')) {
    return 'metalurgia';
  }
  return fallback;
}

export function FleetDashboardApp() {
  const metalurgiaRaw = useSyncExternalStore(
    subscribeLocalStorage,
    getMetalurgiaDatasetSnapshotRaw,
    getEmptyServerSnapshot
  );

  const exploracaoRaw = useSyncExternalStore(
    subscribeLocalStorage,
    getExploracaoDatasetSnapshotRaw,
    getEmptyServerSnapshot
  );

  const fuelRatesRaw = useSyncExternalStore(
    subscribeLocalStorage,
    getFuelRatesSnapshotRaw,
    getEmptyObjectServerSnapshot
  );

  const metalurgiaDataset = useMemo(
    () => parseDatasetSnapshot(metalurgiaRaw, 'metalurgia'),
    [metalurgiaRaw]
  );

  const exploracaoDataset = useMemo(
    () => parseDatasetSnapshot(exploracaoRaw, 'exploracao'),
    [exploracaoRaw]
  );

  const fuelOverrides = useMemo<Record<string, FuelRatePair>>(() => {
    try {
      const parsed = JSON.parse(fuelRatesRaw) as Record<string, FuelRatePair>;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }, [fuelRatesRaw]);

  const [activeModule, setActiveModule] = useState<FleetModuleId>('metalurgia');
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS);

  const dataset =
    activeModule === 'exploracao' ? exploracaoDataset : metalurgiaDataset;

  const datasetsRef = useRef<Record<FleetModuleId, FleetDataset>>({
    metalurgia: metalurgiaDataset,
    exploracao: exploracaoDataset,
  });
  const activeModuleRef = useRef<FleetModuleId>(activeModule);

  useEffect(() => {
    datasetsRef.current = {
      metalurgia: metalurgiaDataset,
      exploracao: exploracaoDataset,
    };
  }, [metalurgiaDataset, exploracaoDataset]);

  useEffect(() => {
    activeModuleRef.current = activeModule;
  }, [activeModule]);

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

  // Keep server Power BI feed synchronized for each module when locally persisted
  useEffect(() => {
    if (!metalurgiaRaw) return;
    void fetch('/api/powerbi/feed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ moduleId: 'metalurgia', dataset: metalurgiaDataset }),
    }).catch(() => {});
  }, [metalurgiaDataset, metalurgiaRaw]);

  useEffect(() => {
    if (!exploracaoRaw) return;
    void fetch('/api/powerbi/feed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ moduleId: 'exploracao', dataset: exploracaoDataset }),
    }).catch(() => {});
  }, [exploracaoDataset, exploracaoRaw]);

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

  // Load workspace & fleet records for both Metalurgia and Exploração from Supabase once authenticated
  useEffect(() => {
    if (!currentUser) return;
    let isCancelled = false;

    const syncModuleFromSupabase = async (mod: FleetModuleId) => {
      try {
        const res = await fetch(`/api/supabase/fleet?modulo=${mod}`, {
          cache: 'no-store',
        });
        if (!res.ok || isCancelled) return;
        const data = (await res.json()) as {
          schemaReady?: boolean;
          autoSyncEnabled?: boolean;
          dataset?: FleetDataset | null;
        };
        if (isCancelled || !data.schemaReady) return;

        if (
          mod === 'metalurgia' &&
          typeof data.autoSyncEnabled === 'boolean' &&
          data.autoSyncEnabled !== autoSyncEnabledRef.current
        ) {
          writeAutoSyncPreference(data.autoSyncEnabled);
        }

        if (
          data.dataset &&
          Array.isArray(data.dataset.records) &&
          data.dataset.records.length > 0
        ) {
          const persisted = writeDatasetToStorage(data.dataset, mod);
          datasetsRef.current[mod] = persisted;
        } else if (!data.dataset) {
          await fetch('/api/supabase/fleet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'sync',
              moduleId: mod,
              dataset: datasetsRef.current[mod],
              autoSyncEnabled: autoSyncEnabledRef.current,
            }),
          });
        }
      } catch {
        // Offline or schema not yet created; local storage remains active
      }
    };

    void Promise.all([
      syncModuleFromSupabase('metalurgia'),
      syncModuleFromSupabase('exploracao'),
    ]);

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

  const filteredResumoRecords = useMemo(
    () =>
      applyFilters(
        dataset.records,
        hasDetailCycles ? { ...filters, shiftId: 'ALL', hour: null } : filters
      ),
    [dataset.records, filters, hasDetailCycles]
  );

  const filteredDetailCycles = useMemo(() => {
    if (!hasDetailCycles || !dataset.detailCycles) return filteredResumoRecords;
    return applyFilters(dataset.detailCycles, filters);
  }, [dataset.detailCycles, filters, hasDetailCycles, filteredResumoRecords]);

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

  // Exploração Fuel & Operations Optimization Metrics
  const fuelKpis = useMemo(
    () =>
      activeModule === 'exploracao'
        ? computeFuelKPIs(analyticsRecords, fuelOverrides)
        : undefined,
    [activeModule, analyticsRecords, fuelOverrides]
  );

  const explorationEquipRows = useMemo(
    () =>
      activeModule === 'exploracao'
        ? computeExplorationEquipmentMetrics(analyticsRecords, fuelOverrides)
        : [],
    [activeModule, analyticsRecords, fuelOverrides]
  );

  const explorationAreaRows = useMemo(
    () =>
      activeModule === 'exploracao'
        ? computeExplorationAreaMetrics(analyticsRecords, fuelOverrides)
        : [],
    [activeModule, analyticsRecords, fuelOverrides]
  );

  const selectedAreaLabel =
    filters.area !== 'ALL'
      ? filters.area
      : availableAreas.length === 1
      ? availableAreas[0]
      : 'Áreas Selecionadas';

  const handleModuleChange = (mod: FleetModuleId) => {
    if (mod === activeModule) return;
    setActiveModule(mod);
    setFilters((prev) => ({
      ...INITIAL_FILTERS,
      shiftScheme: prev.shiftScheme,
    }));
    setUploadError(null);
    setUploadSuccess(null);
    if (activeTab === 'users') {
      setActiveTab('overview');
    }
  };

  const handleUpdateFuelRate = (
    equipamento: string,
    field: 'operacaoLh' | 'relantiLh',
    value: number
  ) => {
    const current = resolveFuelProfile(equipamento, fuelOverrides);
    const next: Record<string, FuelRatePair> = {
      ...fuelOverrides,
      [equipamento]: {
        operacaoLh: field === 'operacaoLh' ? value : current.operacaoLh,
        relantiLh: field === 'relantiLh' ? value : current.relantiLh,
      },
    };
    writeFuelRatesToStorage(next);
  };

  const handleResetFuelRates = () => {
    writeFuelRatesToStorage({});
  };

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
    const csv =
      activeModule === 'exploracao'
        ? generateInstitutionalReportCSV({
            moduleId: 'exploracao',
            category: 'optimization',
            title: 'Relatório Exploração — Combustível (L/h) & Optimização das Operações',
            organizacao: dataset.metadata.organizacao,
            periodo: `${dataset.metadata.dataInicio} até ${dataset.metadata.dataFim}`,
            areaLabel: selectedAreaLabel,
            kpis,
            equipmentRows: equipmentAreaMetrics,
            driverRows: driverMetrics,
            shiftRows: shiftMetrics,
            records: analyticsRecords,
            scheme: filters.shiftScheme,
            fuelKpis,
            explorationEquipRows,
            explorationAreaRows,
          })
        : generatePowerBICSV(analyticsRecords, filters.shiftScheme);

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const prefix =
      activeModule === 'exploracao'
        ? 'Cuango_Exploracao_Combustivel'
        : 'Cuango_Metalurgia_PowerBI';
    link.download = `${prefix}_${dataset.metadata.dataInicio.replace(/\//g, '-')}.csv`;
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
      const targetModule = detectModuleFromDataset(
        incoming,
        activeModuleRef.current
      );
      const prev = deduplicateDataset(datasetsRef.current[targetModule]).dataset;
      const cleanIncoming = deduplicateDataset(incoming).dataset;
      const merge = mergeDatasetsWithoutDuplicates(prev, cleanIncoming);

      if (merge.duplicateFile) {
        return {
          accepted: false,
          reason: `Importação bloqueada: o ficheiro "${cleanIncoming.metadata.arquivoOrigem}" já existe no módulo ${
            targetModule === 'exploracao' ? 'Exploração' : 'Metalurgia'
          }.`,
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

      const persisted = writeDatasetToStorage(finalDataset, targetModule);
      datasetsRef.current[targetModule] = persisted;

      if (targetModule !== activeModuleRef.current) {
        setActiveModule(targetModule);
      }

      void fetch('/api/supabase/fleet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: mode === 'replace' ? 'replace' : 'sync',
          moduleId: targetModule,
          dataset: persisted,
          autoSyncEnabled: autoSyncEnabledRef.current,
        }),
      }).catch(() => {});

      void fetch('/api/powerbi/feed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moduleId: targetModule, dataset: persisted }),
      }).catch(() => {});

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

      const modName = targetModule === 'exploracao' ? 'EXPLORAÇÃO' : 'METALURGIA';
      setUploadSuccess(
        `Relatório "${label}" processado no módulo ${modName}: ${
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
      const targetGuess: FleetModuleId = file.name.toLowerCase().includes('explora')
        ? 'exploracao'
        : activeModuleRef.current;

      if (isDuplicateFileName(datasetsRef.current[targetGuess], file.name)) {
        throw new Error(
          `Importação bloqueada: o ficheiro "${file.name}" já existe no sistema.`
        );
      }

      const arrayBuffer = await file.arrayBuffer();
      const pdfUint8 = new Uint8Array(arrayBuffer);

      // Verify %PDF- header cleanly before attempting extraction
      const headerSlice = pdfUint8.slice(0, 16);
      const headerStr = Array.from(headerSlice)
        .map((b) => String.fromCharCode(b))
        .join('');
      if (!headerStr.includes('%PDF-')) {
        throw new Error(
          `O ficheiro "${file.name}" não é um PDF válido (%PDF- não encontrado).`
        );
      }

      // 1. Client-side deterministic Novatronica extraction first (avoids serverless payload/timeout limits on large PDFs)
      let extractedDataset: FleetDataset | null = null;
      try {
        extractedDataset = await parseNovatronicaPdfBytes(pdfUint8, file.name);
      } catch {
        extractedDataset = null;
      }

      // 2. Fall back to /api/parse-pdf (server parser + Gemini fallback) when needed
      if (!extractedDataset || extractedDataset.records.length === 0) {
        if (file.size > 4.4 * 1024 * 1024) {
          throw new Error(
            `Não foi possível extrair tabelas Novatronica de "${file.name}" localmente e o ficheiro (${(
              file.size /
              (1024 * 1024)
            ).toFixed(1)} MB) excede o limite de envio ao servidor (4,4 MB).`
          );
        }

        const formData = new FormData();
        formData.append('file', file);

        let res: Response;
        try {
          res = await fetch('/api/parse-pdf', {
            method: 'POST',
            body: formData,
          });
        } catch (netErr) {
          const rawMsg = netErr instanceof Error ? netErr.message : '';
          throw new Error(
            `Falha de ligação ao servidor ao importar "${file.name}". Verifique a ligação à internet ou tente novamente.${
              rawMsg && !rawMsg.toLowerCase().includes('failed to fetch')
                ? ` (${rawMsg})`
                : ''
            }`
          );
        }

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

        extractedDataset = payload.dataset;
      }

      const result = await applyIncomingDataset(extractedDataset, mode, file.name);
      if (!result.accepted) {
        throw new Error(
          result.reason || 'Dados duplicados bloqueados na importação.'
        );
      }
      setUploadModalOpen(false);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Erro ao processar arquivo PDF.';
      setUploadError(
        msg.toLowerCase().includes('failed to fetch')
          ? 'Falha de ligação ao processar o PDF. Verifique a ligação ou recarregue a página.'
          : msg
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleCleanDuplicates = async () => {
    setUploadError(null);
    const mod = activeModuleRef.current;
    const current = datasetsRef.current[mod];
    const { dataset: cleaned, removedRecords, removedDetails } =
      deduplicateDataset(current);

    const persisted = writeDatasetToStorage(cleaned, mod);
    datasetsRef.current[mod] = persisted;

    void fetch('/api/supabase/fleet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'replace',
        moduleId: mod,
        dataset: persisted,
        autoSyncEnabled: autoSyncEnabledRef.current,
      }),
    }).catch(() => {});

    void fetch('/api/powerbi/feed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ moduleId: mod, dataset: persisted }),
    }).catch(() => {});

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
    const mod = activeModuleRef.current;
    const cleanSeed = writeDatasetToStorage(getSeedForModule(mod), mod);
    datasetsRef.current[mod] = cleanSeed;
    setFilters((prev) => ({ ...INITIAL_FILTERS, shiftScheme: prev.shiftScheme }));
    setUploadError(null);
    setUploadSuccess(
      mod === 'exploracao'
        ? 'Relatório Exploração original de 15/11/2026 (184 linhas Resumo · 1.827 entradas) restaurado.'
        : 'Relatório Metalurgia original de 14/11/2026 (3 linhas Resumo · 113 entradas) restaurado.'
    );
    void fetch('/api/supabase/fleet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'replace',
        moduleId: mod,
        dataset: cleanSeed,
        autoSyncEnabled: autoSyncEnabledRef.current,
      }),
    }).catch(() => {});
    void fetch('/api/powerbi/feed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ moduleId: mod, dataset: cleanSeed }),
    }).catch(() => {});
  };

  const isFileAlreadyInSystem = useCallback(
    (filename: string) =>
      isDuplicateFileName(metalurgiaDataset, filename) ||
      isDuplicateFileName(exploracaoDataset, filename),
    [metalurgiaDataset, exploracaoDataset]
  );

  // Lifted Gmail actions with strict filename & content duplicate prevention
  const importGmailAttachment = useCallback(
    async (
      item: GmailAttachmentRow,
      mode: 'replace' | 'append'
    ): Promise<boolean> => {
      if (
        isDuplicateFileName(datasetsRef.current.metalurgia, item.filename) ||
        isDuplicateFileName(datasetsRef.current.exploracao, item.filename)
      ) {
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

        const existingFilesCount = found.filter(
          (it) =>
            isDuplicateFileName(datasetsRef.current.metalurgia, it.filename) ||
            isDuplicateFileName(datasetsRef.current.exploracao, it.filename)
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
              isDuplicateFileName(datasetsRef.current.metalurgia, it.filename) ||
              isDuplicateFileName(datasetsRef.current.exploracao, it.filename) ||
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
      if (
        isDuplicateFileName(datasetsRef.current.metalurgia, it.filename) ||
        isDuplicateFileName(datasetsRef.current.exploracao, it.filename)
      ) {
        return false;
      }
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
        if (
          isDuplicateFileName(datasetsRef.current.metalurgia, it.filename) ||
          isDuplicateFileName(datasetsRef.current.exploracao, it.filename)
        ) {
          continue;
        }
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
          moduleId: activeModuleRef.current,
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
  const showGenericKpiStrip =
    activeTab !== 'reports' &&
    activeTab !== 'users' &&
    !(activeModule === 'exploracao' && activeTab === 'overview');

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col lg:flex-row print-reset-layout">
      <DashboardSidebar
        activeModule={activeModule}
        onModuleChange={handleModuleChange}
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
          activeModule={activeModule}
          onModuleChange={handleModuleChange}
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
          {showGenericKpiStrip && (
            <KpiStrip kpis={kpis} selectedAreaLabel={selectedAreaLabel} />
          )}

          <AnimatePresence mode="wait">
            {activeTab === 'overview' && activeModule === 'exploracao' && fuelKpis && (
              <motion.div
                key="overview-exploracao"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              >
                <ExplorationModuleView
                  selectedAreaLabel={selectedAreaLabel}
                  selectedArea={filters.area}
                  selectedEquipment={filters.equipamento}
                  selectedDriver={filters.condutor}
                  selectedShiftId={filters.shiftId}
                  selectedHour={filters.hour}
                  shiftScheme={filters.shiftScheme}
                  kpis={kpis}
                  fuelKpis={fuelKpis}
                  equipmentRows={explorationEquipRows}
                  areaRows={explorationAreaRows}
                  driverRows={driverMetrics}
                  shiftRows={shiftMetrics}
                  hourlyBuckets={hourlyBuckets}
                  records={analyticsRecords}
                  fuelOverrides={fuelOverrides}
                  onUpdateFuelRate={handleUpdateFuelRate}
                  onResetFuelRates={handleResetFuelRates}
                  onSelectEquipment={(equipamento) =>
                    handleFilterChange({ equipamento })
                  }
                  onSelectArea={(area) => handleFilterChange({ area })}
                  onSelectDriver={(condutor) => handleFilterChange({ condutor })}
                  onSelectShift={(shiftId) => handleFilterChange({ shiftId })}
                  onSelectHour={(hour) => handleFilterChange({ hour })}
                  onOpenReports={() => setActiveTab('reports')}
                  onExportCsv={handleExportCsv}
                />
              </motion.div>
            )}

            {activeTab === 'overview' && activeModule === 'metalurgia' && (
              <motion.div
                key="overview-metalurgia"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                className="space-y-6"
              >
                {analyticsRecords.length > 0 && (
                  <div className="rounded-lg border border-orange-100 bg-orange-50/35 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
                    <div className="space-y-0.5">
                      <h1 className="text-sm font-semibold text-slate-900">
                        Diagnóstico Automatizado — METALURGIA · {selectedAreaLabel}
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
                key={`reports-${activeModule}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              >
                <ReportsView
                  activeModule={activeModule}
                  dataset={dataset}
                  selectedAreaLabel={selectedAreaLabel}
                  shiftScheme={filters.shiftScheme}
                  kpis={kpis}
                  equipmentRows={equipmentAreaMetrics}
                  driverRows={driverMetrics}
                  shiftRows={shiftMetrics}
                  records={filteredResumoRecords}
                  fuelKpis={fuelKpis}
                  explorationEquipRows={explorationEquipRows}
                  explorationAreaRows={explorationAreaRows}
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
                key={`powerbi-${activeModule}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              >
                <PowerBiAutomationView
                  activeModule={activeModule}
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
              Módulo {activeModule === 'exploracao' ? 'Exploração' : 'Metalurgia'} · Ficheiro:{' '}
              {dataset.metadata.arquivoOrigem}
              {!needsAuth && autoSyncEnabled && ' · Gmail auto-sync ativo (5 min)'}
            </span>
          </footer>
        )}
      </div>

      <PdfUploadModal
        activeModule={activeModule}
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
