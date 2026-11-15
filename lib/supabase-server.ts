import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  canonicalFileName,
  deduplicateDataset,
  getEntryCount,
  getRecordFingerprint,
} from './fleet-analytics';
import {
  FleetCycleRecord,
  FleetDataset,
  FleetModuleId,
  ReportMetadata,
} from './fleet-types';

const DEFAULT_SUPABASE_URL = 'https://brsljluiivsdvmajelcc.supabase.co';
const DEFAULT_SUPABASE_KEY = 'sb_publishable_gIqDVKiA7CQUeQ3qc3E1tg_OV_uvRhe';

function resolveSupabaseConfig(): { url: string; key: string } {
  const rawUrl =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    DEFAULT_SUPABASE_URL;

  const url = rawUrl
    .trim()
    .replace(/\/rest\/v1\/?$/i, '')
    .replace(/\/+$/, '');

  const key = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    DEFAULT_SUPABASE_KEY
  ).trim();

  return { url, key };
}

let cachedClient: SupabaseClient | null = null;

export function getSupabaseServerClient(): SupabaseClient {
  if (!cachedClient) {
    const { url, key } = resolveSupabaseConfig();
    cachedClient = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }
  return cachedClient;
}

export function isMissingSchemaError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; message?: string };
  const code = String(e.code ?? '');
  const msg = String(e.message ?? '');
  return (
    code === 'PGRST205' ||
    code === '42P01' ||
    msg.includes('schema cache') ||
    msg.includes('does not exist')
  );
}

function hashFingerprint(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= ch;
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return `${(h1 >>> 0).toString(36)}_${(h2 >>> 0).toString(36)}`;
}

export interface SupabaseWorkspaceRow {
  id: string;
  organizacao: string;
  sistema: string;
  grupo_equipamentos: string;
  equipamentos_no_filtro: string[];
  grupo_condutores: string;
  grupo_areas: string;
  area_selecionada: string;
  margem: string;
  data_inicio: string;
  data_fim: string;
  fuso_horario: string;
  gerado_em: string;
  arquivo_origem: string;
  total_entradas_reportado: number | null;
  auto_sync_enabled: boolean;
}

export interface SupabaseFleetRecordRow {
  id: string;
  record_id: string;
  source_section: 'resumo' | 'lista';
  numero: number;
  equipamento: string;
  condutor_completo: string;
  condutor_nome: string;
  condutor_codigo: string;
  entrada: string;
  saida: string;
  inicio: string | null;
  fim: string | null;
  data: string;
  hora_entrada: number;
  entradas_count: number;
  duracao_seg: number;
  distancia_horas: number;
  utilizacao_seg: number;
  relanti_seg: number;
  parado_seg: number;
  produtivo_seg: number;
  contador: string;
  area: string;
  origem_arquivo: string;
  fingerprint: string;
}

export function serializeWorkspaceRow(
  metadata: ReportMetadata,
  autoSyncEnabled?: boolean,
  moduleId: FleetModuleId = 'metalurgia'
): Record<string, unknown> {
  const row: Record<string, unknown> = {
    id: moduleId === 'exploracao' ? 'exploracao' : 'default',
    organizacao: metadata.organizacao || 'SOCMINEIRACUANGO',
    sistema: metadata.sistema || 'Novatronica Gestão de Frotas por GPS',
    grupo_equipamentos:
      metadata.grupoEquipamentos ||
      (moduleId === 'exploracao' ? 'Pesados Exploração' : 'Pesados Metalurgia'),
    equipamentos_no_filtro: Array.from(
      new Set(metadata.equipamentosNoFiltro ?? [])
    ),
    grupo_condutores: metadata.grupoCondutores || 'Todos',
    grupo_areas: metadata.grupoAreas || 'Todos',
    area_selecionada: metadata.areaSelecionada || 'N/D',
    margem: metadata.margem || '00:00:10',
    data_inicio: metadata.dataInicio || '',
    data_fim: metadata.dataFim || '',
    fuso_horario: metadata.fusoHorario || '(UTC+01:00) West Central Africa',
    gerado_em: metadata.geradoEm || new Date().toLocaleString('pt-PT'),
    arquivo_origem: metadata.arquivoOrigem || '',
    total_entradas_reportado:
      typeof metadata.totalEntradasReportado === 'number'
        ? Math.trunc(metadata.totalEntradasReportado)
        : null,
    updated_at: new Date().toISOString(),
  };
  if (typeof autoSyncEnabled === 'boolean') {
    row.auto_sync_enabled = autoSyncEnabled;
  }
  return row;
}

export function serializeFleetRecordRow(
  r: FleetCycleRecord,
  section: 'resumo' | 'lista',
  moduleId: FleetModuleId = 'metalurgia'
): SupabaseFleetRecordRow {
  const normalized: FleetCycleRecord = { ...r, sourceSection: section };
  const baseFingerprint = getRecordFingerprint(normalized);
  const fingerprint =
    moduleId === 'exploracao' ? `exp|${baseFingerprint}` : baseFingerprint;
  const prefix =
    moduleId === 'exploracao'
      ? section === 'resumo'
        ? 'exp_res'
        : 'exp_lst'
      : section === 'resumo'
      ? 'res'
      : 'lst';
  const id = `${prefix}_${hashFingerprint(fingerprint)}`;
  const rawRecordId = (r.id || '').replace(/^exp::/, '');
  const recordId =
    moduleId === 'exploracao' ? `exp::${rawRecordId}` : rawRecordId;

  return {
    id,
    record_id: recordId,
    source_section: section,
    numero: Math.max(0, Math.trunc(r.numero || 0)),
    equipamento: r.equipamento || 'N/D',
    condutor_completo: r.condutorCompleto || 'Não identificado',
    condutor_nome: r.condutorNome || 'Não identificado',
    condutor_codigo: r.condutorCodigo || '—',
    entrada: r.entrada || '',
    saida: r.saida || '',
    inicio: r.inicio ?? null,
    fim: r.fim ?? null,
    data: r.data || '',
    hora_entrada: Math.min(23, Math.max(0, Math.trunc(r.horaEntrada || 0))),
    entradas_count: Math.max(0, Math.trunc(getEntryCount(r))),
    duracao_seg: Math.max(0, Math.round(r.duracaoSeg || 0)),
    distancia_horas: Math.max(0, Number(r.distanciaHoras || 0)),
    utilizacao_seg: Math.max(0, Math.round(r.utilizacaoSeg || 0)),
    relanti_seg: Math.max(0, Math.round(r.relantiSeg || 0)),
    parado_seg: Math.max(0, Math.round(r.paradoSeg || 0)),
    produtivo_seg: Math.max(0, Math.round(r.produtivoSeg || 0)),
    contador: r.contador || 'Indisponível',
    area: r.area || 'N/D',
    origem_arquivo: r.origemArquivo || '',
    fingerprint,
  };
}

export function serializeReportFiles(
  dataset: FleetDataset,
  moduleId: FleetModuleId = 'metalurgia'
) {
  const clean = deduplicateDataset(dataset).dataset;
  const files = (clean.metadata.arquivoOrigem || '')
    .split(' + ')
    .map((s) => s.trim())
    .filter(Boolean);

  return files.map((fileName) => {
    const canonical = canonicalFileName(fileName) || fileName.toLowerCase();
    const res = clean.records.filter(
      (r) => !r.origemArquivo || r.origemArquivo === fileName
    );
    const lst = (clean.detailCycles ?? []).filter(
      (c) => !c.origemArquivo || c.origemArquivo === fileName
    );
    return {
      id:
        moduleId === 'exploracao'
          ? `rep_exp_${hashFingerprint(canonical)}`
          : `rep_${hashFingerprint(canonical)}`,
      file_name: fileName,
      canonical_name: canonical,
      area_selecionada: clean.metadata.areaSelecionada || 'N/D',
      data_inicio: clean.metadata.dataInicio || '',
      data_fim: clean.metadata.dataFim || '',
      resumo_count: res.length,
      detail_count: lst.length,
      total_entradas: res.reduce((acc, r) => acc + getEntryCount(r), 0),
    };
  });
}

export function deserializeWorkspaceMetadata(
  ws: SupabaseWorkspaceRow
): ReportMetadata {
  return {
    organizacao: ws.organizacao || 'SOCMINEIRACUANGO',
    sistema: ws.sistema || 'Novatronica Gestão de Frotas por GPS',
    grupoEquipamentos: ws.grupo_equipamentos || 'Pesados Metalurgia',
    equipamentosNoFiltro: Array.isArray(ws.equipamentos_no_filtro)
      ? ws.equipamentos_no_filtro
      : [],
    grupoCondutores: ws.grupo_condutores || 'Todos',
    grupoAreas: ws.grupo_areas || 'Todos',
    areaSelecionada: ws.area_selecionada || 'N/D',
    margem: ws.margem || '00:00:10',
    dataInicio: ws.data_inicio || '',
    dataFim: ws.data_fim || '',
    fusoHorario: ws.fuso_horario || '(UTC+01:00) West Central Africa',
    geradoEm: ws.gerado_em || '',
    arquivoOrigem: ws.arquivo_origem || '',
    totalEntradasReportado:
      typeof ws.total_entradas_reportado === 'number'
        ? ws.total_entradas_reportado
        : undefined,
  };
}

export function deserializeFleetRecordRow(
  row: SupabaseFleetRecordRow
): FleetCycleRecord {
  return {
    id: (row.record_id || row.id).replace(/^exp::/, ''),
    numero: row.numero,
    equipamento: row.equipamento,
    condutorCompleto: row.condutor_completo,
    condutorNome: row.condutor_nome,
    condutorCodigo: row.condutor_codigo,
    entrada: row.entrada,
    saida: row.saida,
    inicio: row.inicio ?? undefined,
    fim: row.fim ?? undefined,
    data: row.data,
    horaEntrada: row.hora_entrada,
    entradasCount: row.entradas_count,
    duracaoSeg: row.duracao_seg,
    distanciaHoras: Number(row.distancia_horas ?? 0),
    utilizacaoSeg: row.utilizacao_seg,
    relantiSeg: row.relanti_seg,
    paradoSeg: row.parado_seg,
    produtivoSeg: row.produtivo_seg,
    contador: row.contador,
    area: row.area,
    origemArquivo: row.origem_arquivo || undefined,
    sourceSection: row.source_section,
  };
}
