export type ShiftScheme = '3x8h' | '2x12h';

export type ShiftId =
  | 'manha'
  | 'tarde'
  | 'noite'
  | 'dia_12h'
  | 'noite_12h';

export interface FleetCycleRecord {
  id: string;
  numero: number;
  equipamento: string;
  condutorCompleto: string;
  condutorNome: string;
  condutorCodigo: string;
  entrada: string; // "DD/MM/YYYY HH:MM:SS"
  saida: string;   // "DD/MM/YYYY HH:MM:SS"
  inicio?: string; // "DD/MM/YYYY HH:MM:SS" (from Resumo)
  fim?: string;    // "DD/MM/YYYY HH:MM:SS" (from Resumo)
  data: string;    // "DD/MM/YYYY"
  horaEntrada: number; // 0-23
  entradasCount?: number; // Exact count of entries in area (1 for Lista row, N for Resumo row)
  duracaoSeg: number;
  distanciaHoras: number;
  utilizacaoSeg: number;
  relantiSeg: number;
  paradoSeg: number;
  produtivoSeg: number; // utilizacaoSeg - relantiSeg
  contador: string;
  area: string;
  origemArquivo?: string;
  sourceSection?: 'resumo' | 'lista';
}

export interface ReportMetadata {
  organizacao: string;
  sistema: string;
  grupoEquipamentos: string;
  equipamentosNoFiltro: string[];
  grupoCondutores: string;
  grupoAreas: string;
  areaSelecionada: string;
  margem: string;
  dataInicio: string;
  dataFim: string;
  fusoHorario: string;
  geradoEm: string;
  arquivoOrigem: string;
  totalEntradasReportado?: number;
}

export interface FleetDataset {
  metadata: ReportMetadata;
  /** Main report records (extracted from "Resumo" page when present) */
  records: FleetCycleRecord[];
  /** Optional granular entry/exit cycles from "Lista" pages for hourly/shift precision */
  detailCycles?: FleetCycleRecord[];
}

export interface FilterState {
  area: string;         // 'ALL' or specific area
  equipamento: string;  // 'ALL' or specific equipment
  condutor: string;     // 'ALL' or condutorCompleto
  shiftScheme: ShiftScheme;
  shiftId: string;      // 'ALL' or ShiftId
  hour: number | null;  // null or 0-23
  searchQuery: string;
}

export interface GlobalKPIs {
  totalEntradas: number;
  totalEquipamentosAtivos: number;
  totalCondutoresAtivos: number;
  totalAreasAtivas: number;
  permanenciaSeg: number;
  utilizacaoSeg: number;
  relantiSeg: number;
  paradoSeg: number;
  produtivoSeg: number;
  distanciaHoras: number;
  mediaPermanenciaPorEntradaSeg: number;
  disponibilidadeMotorPct: number;
  eficienciaEfetivaPct: number;
  taxaRelantiSobrePermanenciaPct: number;
  taxaRelantiSobreUtilizacaoPct: number;
  taxaParadoPct: number;
}

export interface ShiftMetrics {
  shiftId: ShiftId;
  label: string;
  windowLabel: string;
  entradas: number;
  equipamentosCount: number;
  condutores: string[];
  permanenciaSeg: number;
  utilizacaoSeg: number;
  produtivoSeg: number;
  relantiSeg: number;
  paradoSeg: number;
  mediaCicloSeg: number;
  eficienciaEfetivaPct: number;
  taxaRelantiPct: number;
  taxaParadoPct: number;
  participacaoTempoPct: number;
}

export interface DriverMetrics {
  condutorCompleto: string;
  condutorNome: string;
  condutorCodigo: string;
  entradas: number;
  primeiraEntrada: string;
  ultimaSaida: string;
  equipamentos: string[];
  areas: string[];
  turnos: string[];
  permanenciaSeg: number;
  utilizacaoSeg: number;
  produtivoSeg: number;
  relantiSeg: number;
  paradoSeg: number;
  distanciaHoras: number;
  mediaCicloSeg: number;
  eficienciaEfetivaPct: number;
  taxaRelantiPct: number;
  taxaParadoPct: number;
  participacaoEntradasPct: number;
}

export interface EquipmentAreaMetrics {
  equipamento: string;
  area: string;
  entradas: number;
  condutoresCount: number;
  condutores: string[];
  primeiraEntrada: string;
  ultimaSaida: string;
  permanenciaSeg: number;
  utilizacaoSeg: number;
  produtivoSeg: number;
  relantiSeg: number;
  paradoSeg: number;
  distanciaHoras: number;
  mediaCicloSeg: number;
  eficienciaEfetivaPct: number;
  taxaRelantiPct: number;
}

export interface HourlyBucket {
  hour: number;
  hourLabel: string;
  entradas: number;
  permanenciaSeg: number;
  produtivoSeg: number;
  relantiSeg: number;
  paradoSeg: number;
  eficienciaPct: number;
}

export type FleetModuleId = 'metalurgia' | 'exploracao';

export interface FuelRatePair {
  operacaoLh: number;
  relantiLh: number;
}

export interface EquipmentFuelProfile extends FuelRatePair {
  equipamento: string;
  categoria: string;
}

export interface FuelGlobalKPIs {
  horasOperacaoEfetiva: number;
  horasRelanti: number;
  horasUtilizacaoTotal: number;
  combustivelOperacaoLitros: number;
  combustivelRelantiLitros: number;
  combustivelTotalLitros: number;
  taxaMediaOperacaoLh: number;
  taxaMediaRelantiLh: number;
  consumoMedioUtilizacaoLh: number;
  pctDesperdicioRelanti: number;
  economiaPotencialLitros: number;
}

export interface ExplorationEquipmentMetric {
  equipamento: string;
  categoria: string;
  entradas: number;
  areas: string[];
  condutores: string[];
  permanenciaSeg: number;
  utilizacaoSeg: number;
  produtivoSeg: number;
  relantiSeg: number;
  paradoSeg: number;
  distanciaHoras: number;
  eficienciaEfetivaPct: number;
  taxaRelantiSobreUtilizacaoPct: number;
  taxaParadoPct: number;
  operacaoLh: number;
  relantiLh: number;
  combustivelOperacaoLitros: number;
  combustivelRelantiLitros: number;
  combustivelTotalLitros: number;
  consumoMedioUtilizacaoLh: number;
  pctDesperdicioCombustivel: number;
  nivelOtimizacao: 'Otimizado' | 'Atenção' | 'Crítico';
}

export interface ExplorationAreaMetric {
  area: string;
  entradas: number;
  equipamentosCount: number;
  equipamentos: string[];
  condutoresCount: number;
  permanenciaSeg: number;
  utilizacaoSeg: number;
  produtivoSeg: number;
  relantiSeg: number;
  paradoSeg: number;
  mediaCicloSeg: number;
  eficienciaEfetivaPct: number;
  taxaRelantiSobreUtilizacaoPct: number;
  combustivelOperacaoLitros: number;
  combustivelRelantiLitros: number;
  combustivelTotalLitros: number;
}

