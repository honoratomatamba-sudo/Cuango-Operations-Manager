import { CUANGO_SEED_DATASET } from './cuango-seed-data';
import { deduplicateDataset } from './fleet-analytics';
import { FleetDataset } from './fleet-types';

let activeDataset: FleetDataset = deduplicateDataset({
  metadata: { ...CUANGO_SEED_DATASET.metadata },
  records: [...CUANGO_SEED_DATASET.records],
  detailCycles: [...(CUANGO_SEED_DATASET.detailCycles ?? [])],
}).dataset;

export function getActiveServerDataset(): FleetDataset {
  activeDataset = deduplicateDataset(activeDataset).dataset;
  return activeDataset;
}

export function setActiveServerDataset(dataset: FleetDataset): void {
  activeDataset = deduplicateDataset(dataset).dataset;
}
