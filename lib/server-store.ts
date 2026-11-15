import { CUANGO_EXPLORACAO_SEED_DATASET } from './cuango-exploracao-seed';
import { CUANGO_SEED_DATASET } from './cuango-seed-data';
import { deduplicateDataset } from './fleet-analytics';
import { FleetDataset, FleetModuleId } from './fleet-types';

const moduleDatasets: Record<FleetModuleId, FleetDataset> = {
  metalurgia: deduplicateDataset({
    metadata: { ...CUANGO_SEED_DATASET.metadata },
    records: [...CUANGO_SEED_DATASET.records],
    detailCycles: [...(CUANGO_SEED_DATASET.detailCycles ?? [])],
  }).dataset,
  exploracao: deduplicateDataset({
    metadata: { ...CUANGO_EXPLORACAO_SEED_DATASET.metadata },
    records: [...CUANGO_EXPLORACAO_SEED_DATASET.records],
    detailCycles: [...(CUANGO_EXPLORACAO_SEED_DATASET.detailCycles ?? [])],
  }).dataset,
};

export function getActiveServerDataset(
  moduleId: FleetModuleId = 'metalurgia'
): FleetDataset {
  const clean = deduplicateDataset(moduleDatasets[moduleId]).dataset;
  moduleDatasets[moduleId] = clean;
  return clean;
}

export function setActiveServerDataset(
  dataset: FleetDataset,
  moduleId: FleetModuleId = 'metalurgia'
): void {
  moduleDatasets[moduleId] = deduplicateDataset(dataset).dataset;
}
