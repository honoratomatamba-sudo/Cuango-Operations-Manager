import { getDocumentProxy } from 'unpdf';
import {
  deduplicateCycleRecords,
  deduplicateDataset,
  extractDateFromDateTime,
  extractHourFromDateTime,
  parseHMS,
  splitDriverIdentity,
} from './fleet-analytics';
import { FleetCycleRecord, FleetDataset, ReportMetadata } from './fleet-types';

interface PdfTextItem {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
  centerX: number;
}

type TableSectionKind =
  | 'resumo'
  | 'lista'
  | 'equipamentos'
  | 'totais_areas'
  | 'totais_equipamentos'
  | 'filtros'
  | 'unknown';

type ColumnKey =
  | 'dia'
  | 'numero'
  | 'equipamento'
  | 'condutor'
  | 'entrada'
  | 'saida'
  | 'duracao'
  | 'inicio'
  | 'fim'
  | 'distancia'
  | 'utilizacao'
  | 'relanti'
  | 'parado'
  | 'contador'
  | 'area'
  | 'totalAreas'
  | 'totalEquipamentos'
  | 'totalCondutores'
  | 'numResultados';

interface DetectedColumn {
  key: ColumnKey;
  x: number;
  w: number;
  centerX: number;
}

interface RawPdfItemLike {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeHeaderToken(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isGenericAllArea(value?: string): boolean {
  if (!value) return true;
  const norm = normalizeHeaderToken(value);
  return (
    !norm ||
    norm === 'todos' ||
    norm === 'todas' ||
    norm === 'all' ||
    norm === 'n/d' ||
    norm === 'nd' ||
    norm === '-' ||
    norm === 'todas as areas' ||
    norm === 'todos os grupos'
  );
}

function isMultiAreaList(value?: string): boolean {
  return Boolean(value && value.includes(','));
}

function normAreaCompareKey(value: string): string {
  return normalizeHeaderToken(value).replace(/\s+/g, '');
}

function mapHeaderToKey(
  rawHeader: string,
  sectionHint: TableSectionKind
): ColumnKey | null {
  const h = normalizeHeaderToken(rawHeader);
  if (h === 'dia') return 'dia';
  if (h === 'nº' || h === 'no' || h === 'n°' || h === 'numero' || h === 'n.') {
    return 'numero';
  }
  if (h === 'nome' || h === 'equipamento') return 'equipamento';
  if (h === 'condutor') return 'condutor';
  if (h === 'entrada') return 'entrada';
  if (h === 'saida') return 'saida';
  if (h === 'duracao' || h === 'permanencia/duracao') return 'duracao';
  if (h === 'inicio') return 'inicio';
  if (h === 'fim') return 'fim';
  if (h === 'distancia') return 'distancia';
  if (h === 'utilizacao') return 'utilizacao';
  if (h === 'relanti') return 'relanti';
  if (h === 'parado') return 'parado';
  if (h === 'contador') return 'contador';
  if (h === 'area' || h === 'areas' || h === 'zona' || h === 'local') {
    return 'area';
  }
  if (h === 'total areas') return 'totalAreas';
  if (h === 'total equipamentos' || h === 'equipamentos') {
    return sectionHint === 'totais_areas' ? 'totalEquipamentos' : 'equipamento';
  }
  if (h === 'total condutores') return 'totalCondutores';
  if (h === 'nº resultados' || h === 'no resultados' || h === 'n resultados') {
    return 'numResultados';
  }
  return null;
}

function projectItemCoordinates(
  item: RawPdfItemLike,
  rotate: number
): PdfTextItem | null {
  const rawStr = typeof item.str === 'string' ? item.str : '';
  const trimmed = rawStr.trim();
  if (!trimmed) return null;

  const t = Array.isArray(item.transform) ? item.transform : [1, 0, 0, 1, 0, 0];
  const tx = Number(t[4] ?? 0);
  const ty = Number(t[5] ?? 0);
  const w = Math.abs(Number(item.width ?? 0));
  const h = Math.abs(Number(item.height ?? 0));

  let x = tx;
  let y = -ty;

  if (rotate === 90) {
    y = tx;
    x = ty;
  } else if (rotate === 270) {
    y = -tx;
    x = -ty;
  } else if (rotate === 180) {
    y = ty;
    x = -tx;
  }

  return {
    str: trimmed,
    x,
    y,
    w,
    h,
    centerX: x + w / 2,
  };
}

function joinCellItems(items: PdfTextItem[]): string {
  if (items.length === 0) return '';
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: PdfTextItem[][] = [];

  for (const it of sorted) {
    const lastLine = lines[lines.length - 1];
    if (!lastLine || Math.abs(it.y - lastLine[0].y) > 2.5) {
      lines.push([it]);
    } else {
      lastLine.push(it);
    }
  }

  const lineStrings = lines.map((line) => {
    line.sort((a, b) => a.x - b.x);
    let out = '';
    let prevEnd = -Infinity;
    for (const tok of line) {
      if (!out) {
        out = tok.str;
      } else {
        const gap = tok.x - prevEnd;
        out += gap < 0.6 ? tok.str : ` ${tok.str}`;
      }
      prevEnd = tok.x + tok.w;
    }
    return out.trim();
  });

  return normalizeText(lineStrings.filter(Boolean).join(' '));
}

function groupItemsIntoLines(items: PdfTextItem[], yTol = 2.6): PdfTextItem[][] {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: PdfTextItem[][] = [];
  for (const it of sorted) {
    const last = lines[lines.length - 1];
    if (!last || Math.abs(it.y - last[0].y) > yTol) {
      lines.push([it]);
    } else {
      last.push(it);
    }
  }
  for (const line of lines) {
    line.sort((a, b) => a.x - b.x);
  }
  return lines;
}

function isSeparatorOrFooterText(text: string): boolean {
  return (
    /^equipamento\s+(?:dentro|fora)\s+de\s+areas$/i.test(normalizeHeaderToken(text)) ||
    /^total\s+(?:dentro\s+de\s+areas|equipamentos)/i.test(normalizeHeaderToken(text)) ||
    /^numero\s+de\s+entradas/i.test(normalizeHeaderToken(text)) ||
    /^tempos\s+totais/i.test(normalizeHeaderToken(text)) ||
    /^equipamentos\s+dentro\s+de\s+areas/i.test(normalizeHeaderToken(text)) ||
    /^legenda$/i.test(normalizeHeaderToken(text)) ||
    /^\*?\s*baseado\s+na\s+data/i.test(normalizeHeaderToken(text)) ||
    /^sistema\s+automatizado/i.test(normalizeHeaderToken(text)) ||
    /^powered\s+by\s+www\.novatronica/i.test(normalizeHeaderToken(text)) ||
    /todas\s+as\s+datas\s+e\s+horas/i.test(normalizeHeaderToken(text))
  );
}

function detectFooterStartY(items: PdfTextItem[]): number {
  let minFooterY = Infinity;
  for (const it of items) {
    const norm = normalizeHeaderToken(it.str);
    if (
      norm.includes('sistema automatizado') ||
      norm.includes('powered by www.novatronica') ||
      norm.includes('todas as datas e horas')
    ) {
      if (it.y < minFooterY) {
        minFooterY = it.y;
      }
    }
  }
  return Number.isFinite(minFooterY) ? minFooterY - 4 : Infinity;
}

function detectHeaderStartY(items: PdfTextItem[]): number {
  let maxTopHeaderY = -Infinity;
  for (const it of items) {
    if (it.y < 65) {
      const norm = normalizeHeaderToken(it.str);
      if (norm.includes('relatorio de entradas/saidas') || it.y < 45) {
        if (it.y > maxTopHeaderY) {
          maxTopHeaderY = it.y;
        }
      }
    }
  }
  return Number.isFinite(maxTopHeaderY) ? maxTopHeaderY + 8 : 0;
}

interface DetectedPageSlice {
  section: TableSectionKind;
  columns: DetectedColumn[];
  headerMaxY: number;
  dataItems: PdfTextItem[];
  sliceEndY: number;
}

const HEADER_KEYWORDS = new Set([
  'dia',
  'nº',
  'no',
  'n°',
  'nome',
  'equipamento',
  'condutor',
  'entrada',
  'saida',
  'duracao',
  'permanencia/duracao',
  'inicio',
  'fim',
  'distancia',
  'utilizacao',
  'relanti',
  'parado',
  'contador',
  'area',
  'areas',
  'zona',
  'total areas',
  'total equipamentos',
  'total condutores',
  'nº resultados',
  'no resultados',
]);

function mergeHorizontalHeaderTokens(items: PdfTextItem[]): PdfTextItem[] {
  const lines = groupItemsIntoLines(items, 2.5);
  const merged: PdfTextItem[] = [];
  for (const line of lines) {
    for (const tok of line) {
      const prev = merged[merged.length - 1];
      if (
        prev &&
        Math.abs(prev.y - tok.y) <= 2.5 &&
        tok.x - (prev.x + prev.w) >= -1 &&
        tok.x - (prev.x + prev.w) <= 3.2
      ) {
        const gap = tok.x - (prev.x + prev.w);
        prev.str = gap < 0.7 ? `${prev.str}${tok.str}` : `${prev.str} ${tok.str}`;
        prev.w = tok.x + tok.w - prev.x;
        prev.centerX = prev.x + prev.w / 2;
      } else {
        merged.push({ ...tok });
      }
    }
  }
  return merged;
}

function classifySectionFromHeader(
  mergedHeaderCols: PdfTextItem[],
  explicitSection: TableSectionKind | null,
  fallbackSection: TableSectionKind
): TableSectionKind {
  const labelSet = new Set(mergedHeaderCols.map((c) => normalizeHeaderToken(c.str)));
  if (labelSet.has('dia') && labelSet.has('condutor')) {
    return 'resumo';
  }
  if (
    (labelSet.has('nº') || labelSet.has('no') || labelSet.has('n°')) &&
    labelSet.has('condutor') &&
    labelSet.has('entrada')
  ) {
    return 'lista';
  }
  if (labelSet.has('equipamento') && labelSet.has('nº resultados')) {
    return 'totais_equipamentos';
  }
  if ((labelSet.has('area') || labelSet.has('areas')) && labelSet.has('nº resultados')) {
    return 'totais_areas';
  }
  if (
    labelSet.has('nome') &&
    (labelSet.has('area') || labelSet.has('areas')) &&
    labelSet.has('condutor') &&
    !labelSet.has('dia') &&
    !labelSet.has('nº')
  ) {
    return 'equipamentos';
  }
  return explicitSection ?? fallbackSection;
}

function detectExplicitSectionTitleAbove(
  bodyItems: PdfTextItem[],
  minY: number,
  maxY: number
): TableSectionKind | null {
  let found: TableSectionKind | null = null;
  let bestY = -Infinity;

  for (const it of bodyItems) {
    if (it.y < minY || it.y >= maxY) continue;
    const norm = normalizeHeaderToken(it.str);
    let candidate: TableSectionKind | null = null;
    if (norm === 'resumo') candidate = 'resumo';
    else if (norm === 'lista') candidate = 'lista';
    else if (norm === 'equipamentos') candidate = 'equipamentos';
    else if (norm === 'totais areas') candidate = 'totais_areas';
    else if (norm === 'totais equipamentos') candidate = 'totais_equipamentos';
    else if (norm === 'filtros' || norm === 'filtro') candidate = 'filtros';

    if (candidate && it.y >= bestY) {
      bestY = it.y;
      found = candidate;
    }
  }
  return found;
}

function detectPageSections(
  bodyItems: PdfTextItem[],
  previousSection: TableSectionKind,
  previousColumns: DetectedColumn[],
  footerStartY: number
): DetectedPageSlice[] {
  const horizontalMerged = mergeHorizontalHeaderTokens(bodyItems);
  const keywordItems = horizontalMerged.filter((it) =>
    HEADER_KEYWORDS.has(normalizeHeaderToken(it.str))
  );

  // Cluster header keywords by Y band across the ENTIRE page (no y < 230 cap)
  const rawClusters: PdfTextItem[][] = [];
  for (const it of [...keywordItems].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const last = rawClusters[rawClusters.length - 1];
    if (!last || Math.abs(it.y - last[0].y) > 10) {
      rawClusters.push([it]);
    } else {
      last.push(it);
    }
  }

  // Keep valid table header bands (>= 4 distinct header columns/keywords)
  const validBands = rawClusters
    .filter((cluster) => {
      const distinctX = new Set(cluster.map((c) => Math.round(c.x / 8)));
      return cluster.length >= 4 && distinctX.size >= 4;
    })
    .map((cluster) => {
      const minY = Math.min(...cluster.map((c) => c.y)) - 5;
      const maxY = Math.max(...cluster.map((c) => c.y)) + 5;
      return { minY, maxY };
    })
    .sort((a, b) => a.minY - b.minY);

  if (validBands.length === 0) {
    if (previousSection !== 'unknown' && previousColumns.length > 0) {
      const topY = bodyItems.length > 0 ? Math.min(...bodyItems.map((it) => it.y)) - 1 : 0;
      return [
        {
          section: previousSection,
          columns: previousColumns,
          headerMaxY: topY,
          dataItems: bodyItems,
          sliceEndY: footerStartY,
        },
      ];
    }
    return [];
  }

  const slices: DetectedPageSlice[] = [];

  // Handle continuation rows at the top of the page above the first header band (if any)
  if (previousSection !== 'unknown' && previousColumns.length > 0) {
    const firstBand = validBands[0];
    const aboveItems = bodyItems.filter((it) => it.y < firstBand.minY - 22);
    const hasDataAbove = aboveItems.some(
      (it) =>
        /\d{2}\/\d{2}\/\d{4}/.test(it.str) ||
        /\d{2}:\d{2}:\d{2}/.test(it.str)
    );
    if (hasDataAbove) {
      const topY = Math.min(...aboveItems.map((it) => it.y)) - 1;
      slices.push({
        section: previousSection,
        columns: previousColumns,
        headerMaxY: topY,
        dataItems: aboveItems,
        sliceEndY: firstBand.minY - 12,
      });
    }
  }

  let runningSection = previousSection;
  for (let bIdx = 0; bIdx < validBands.length; bIdx++) {
    const band = validBands[bIdx];
    const nextBandMinY =
      bIdx + 1 < validBands.length ? validBands[bIdx + 1].minY - 15 : footerStartY;

    const explicitSection = detectExplicitSectionTitleAbove(
      bodyItems,
      Math.max(0, band.minY - 50),
      band.minY + 1
    );

    const headerBandItems = mergeHorizontalHeaderTokens(
      bodyItems.filter((it) => it.y >= band.minY && it.y <= band.maxY)
    ).sort((a, b) => a.x - b.x || a.y - b.y);

    // Merge vertically stacked tokens at the same column (e.g. "Total / Equipamentos")
    const mergedHeaderCols: PdfTextItem[] = [];
    for (const it of headerBandItems) {
      const existing = mergedHeaderCols.find(
        (m) => Math.abs(m.x - it.x) < 5 || Math.abs(m.centerX - it.centerX) < 5
      );
      if (existing) {
        existing.str = `${existing.str} ${it.str}`.trim();
        const right = Math.max(existing.x + existing.w, it.x + it.w);
        existing.x = Math.min(existing.x, it.x);
        existing.w = right - existing.x;
        existing.centerX = existing.x + existing.w / 2;
      } else {
        mergedHeaderCols.push({ ...it });
      }
    }

    const section = classifySectionFromHeader(
      mergedHeaderCols,
      explicitSection,
      runningSection
    );
    runningSection = section;

    const columns: DetectedColumn[] = [];
    for (const hc of mergedHeaderCols) {
      const key = mapHeaderToKey(hc.str, section);
      if (!key) continue;
      columns.push({
        key,
        x: hc.x,
        w: hc.w,
        centerX: hc.centerX,
      });
    }

    if (columns.length === 0) continue;

    const dataItems = bodyItems.filter(
      (it) => it.y > band.maxY + 1 && it.y < nextBandMinY
    );

    slices.push({
      section,
      columns,
      headerMaxY: band.maxY,
      dataItems,
      sliceEndY: nextBandMinY,
    });
  }

  return slices;
}

function computeColumnBoundaries(
  columns: DetectedColumn[],
  dataItems: PdfTextItem[]
): number[] {
  const boundaries: number[] = [];

  for (let i = 0; i < columns.length - 1; i++) {
    const leftCol = columns[i];
    const rightCol = columns[i + 1];
    const headerMidCenter = (leftCol.centerX + rightCol.centerX) / 2;

    // For left-aligned wide text columns ("equipamento", "condutor"), locate where the right column's data starts
    if (leftCol.key === 'equipamento' || leftCol.key === 'condutor') {
      let nextColStartX = Infinity;

      if (
        rightCol.key === 'entrada' ||
        rightCol.key === 'saida' ||
        rightCol.key === 'inicio' ||
        rightCol.key === 'fim'
      ) {
        for (const it of dataItems) {
          if (
            it.x >= leftCol.x + leftCol.w + 4 &&
            it.x <= rightCol.x + rightCol.w + 15 &&
            (/\d{2}\/\d{2}\/\d{4}/.test(it.str) ||
              /\d{2}:\d{2}:\d{2}/.test(it.str) ||
              /^n\/d/i.test(it.str))
          ) {
            if (it.x < nextColStartX) nextColStartX = it.x;
          }
        }
      } else if (rightCol.key === 'condutor') {
        for (const it of dataItems) {
          if (
            it.x >= rightCol.x - 10 &&
            it.x <= rightCol.x + 8 &&
            it.x > leftCol.x + leftCol.w + 4
          ) {
            if (it.x < nextColStartX) nextColStartX = it.x;
          }
        }
      }

      if (Number.isFinite(nextColStartX)) {
        boundaries.push(
          Math.max(
            leftCol.x + leftCol.w + 2,
            Math.min(rightCol.centerX, nextColStartX - 3)
          )
        );
        continue;
      }

      boundaries.push(Math.max(leftCol.x + leftCol.w + 2, rightCol.x - 6));
      continue;
    }

    // For centered/numeric/date/area columns, locate physical whitespace gutter near header midpoint
    const searchStart = Math.round(leftCol.centerX + 4);
    const searchEnd = Math.round(rightCol.centerX - 4);

    if (searchEnd > searchStart + 4 && dataItems.length > 0) {
      let bestGutterMid: number | null = null;
      let bestScore = Infinity;

      let runStart: number | null = null;
      for (let x = searchStart; x <= searchEnd; x++) {
        const covered = dataItems.some(
          (it) => it.x - 0.5 <= x && it.x + it.w + 0.5 >= x
        );
        if (!covered) {
          if (runStart === null) runStart = x;
        } else if (runStart !== null) {
          const runEnd = x - 1;
          const runWidth = runEnd - runStart + 1;
          if (runWidth >= 2) {
            const mid = (runStart + runEnd) / 2;
            const distToMid = Math.abs(mid - headerMidCenter);
            const score = distToMid - Math.min(runWidth, 12) * 0.4;
            if (score < bestScore) {
              bestScore = score;
              bestGutterMid = mid;
            }
          }
          runStart = null;
        }
      }
      if (runStart !== null) {
        const runEnd = searchEnd;
        const runWidth = runEnd - runStart + 1;
        if (runWidth >= 2) {
          const mid = (runStart + runEnd) / 2;
          const distToMid = Math.abs(mid - headerMidCenter);
          const score = distToMid - Math.min(runWidth, 12) * 0.4;
          if (score < bestScore) {
            bestGutterMid = mid;
          }
        }
      }

      if (bestGutterMid !== null) {
        boundaries.push(bestGutterMid);
        continue;
      }
    }

    boundaries.push(headerMidCenter);
  }

  return boundaries;
}

function findColumnByBounds(
  it: PdfTextItem,
  columns: DetectedColumn[],
  boundaries: number[]
): ColumnKey | null {
  if (columns.length === 0) return null;
  for (let i = 0; i < boundaries.length; i++) {
    if (it.centerX < boundaries[i]) {
      return columns[i].key;
    }
  }
  return columns[columns.length - 1].key;
}

function parseDateTimeToMs(dt: string): number | null {
  const m = dt.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  return Date.UTC(
    parseInt(m[3], 10),
    parseInt(m[2], 10) - 1,
    parseInt(m[1], 10),
    parseInt(m[4], 10),
    parseInt(m[5], 10),
    parseInt(m[6], 10)
  );
}

function parseDistanceHoras(raw: string): number {
  const m = raw.match(/[\d.,]+/);
  if (!m) return 0;
  return parseFloat(m[0].replace(',', '.')) || 0;
}

function cleanCondutor(raw: string): string {
  const cleaned = normalizeText(raw).replace(/\s*\(/g, ' (').trim();
  if (!cleaned || cleaned === '-' || /^n\/d\s*\*?$/i.test(cleaned)) {
    return 'Não identificado';
  }
  return cleaned;
}

function cleanDateTimeCell(raw: string): string {
  const cleaned = normalizeText(raw)
    .replace(/(\d{2}\/\d{2}\/\d{4})(\d{2}:\d{2}:\d{2})/g, '$1 $2');
  return cleaned || 'N/D';
}

function sanitizeAreaCell(raw: string, fallbackArea?: string): string {
  const cleaned = normalizeText(raw)
    .replace(/Total Equipamentos[\s\S]*$/i, '')
    .replace(/Total Dentro de Áreas[\s\S]*$/i, '')
    .replace(/Tempos Totais[\s\S]*$/i, '')
    .replace(/Número de Entradas[\s\S]*$/i, '')
    .replace(/^(?:Area|Área)\s*:\s*/i, '')
    .trim();

  if (!isGenericAllArea(cleaned)) {
    return cleaned;
  }
  if (fallbackArea && !isGenericAllArea(fallbackArea) && !isMultiAreaList(fallbackArea)) {
    return fallbackArea;
  }
  return 'N/D';
}

function buildRowsByAnchor(
  bodyDataItems: PdfTextItem[],
  columns: DetectedColumn[],
  boundaries: number[],
  anchorKey: 'dia' | 'numero',
  anchorRegex: RegExp,
  headerMaxY: number,
  sliceEndY: number
): Array<Partial<Record<ColumnKey, string>> & { _bannerArea?: string }> {
  // Identify separator/summary/banner lines to exclude without clipping preceding row's wrapped cells
  const excludedBands: Array<[number, number]> = [];
  const yLines = groupItemsIntoLines(bodyDataItems, 2.5);
  const bannerAreas: Array<{ y: number; area: string }> = [];

  for (let lIdx = 0; lIdx < yLines.length; lIdx++) {
    const line = yLines[lIdx];
    const lineText = normalizeText(line.map((l) => l.str).join(' '));
    const norm = normalizeHeaderToken(lineText);

    if (norm.includes('equipamento dentro de areas') || norm.includes('equipamento fora de areas')) {
      const sepY = line[0].y;
      excludedBands.push([sepY - 3, sepY + 4]);

      // Only exclude the banner line directly above if it does NOT contain timestamps/durations/anchors
      if (lIdx > 0) {
        const prevLine = yLines[lIdx - 1];
        const prevText = normalizeText(prevLine.map((l) => l.str).join(' '));
        const prevY = prevLine[0].y;
        const looksLikeDataLine =
          /\d{2}\/\d{2}\/\d{4}/.test(prevText) ||
          /\d{2}:\d{2}:\d{2}/.test(prevText) ||
          /^\d{1,6}\s+/.test(prevText);

        if (sepY - prevY <= 18 && !looksLikeDataLine) {
          excludedBands.push([prevY - 3, prevY + 3]);
          const explicitBannerArea = prevText.match(/^(?:Á|A)rea\s*:\s*(.+)$/i);
          if (explicitBannerArea?.[1] && !isGenericAllArea(explicitBannerArea[1])) {
            bannerAreas.push({ y: sepY, area: explicitBannerArea[1].trim() });
          }
        }
      }
    } else if (
      isSeparatorOrFooterText(lineText) ||
      /^(?:sub)?total\b/i.test(norm)
    ) {
      const sepY = line[0].y;
      excludedBands.push([sepY - 3, sepY + 3]);
    }
  }

  const filteredItems = bodyDataItems.filter((it) => {
    for (const [lo, hi] of excludedBands) {
      if (it.y >= lo && it.y <= hi) {
        return false;
      }
    }
    return true;
  });

  // Collect anchors from the anchor column
  const anchors: PdfTextItem[] = [];
  for (const it of filteredItems) {
    const colKey = findColumnByBounds(it, columns, boundaries);
    if (colKey === anchorKey && anchorRegex.test(it.str.trim())) {
      if (!anchors.some((a) => Math.abs(a.y - it.y) <= 4)) {
        anchors.push(it);
      }
    }
  }

  anchors.sort((a, b) => a.y - b.y);
  if (anchors.length === 0) return [];

  const buckets: Array<Record<ColumnKey, PdfTextItem[]>> = anchors.map(() => ({
    dia: [],
    numero: [],
    equipamento: [],
    condutor: [],
    entrada: [],
    saida: [],
    duracao: [],
    inicio: [],
    fim: [],
    distancia: [],
    utilizacao: [],
    relanti: [],
    parado: [],
    contador: [],
    area: [],
    totalAreas: [],
    totalEquipamentos: [],
    totalCondutores: [],
    numResultados: [],
  }));

  for (const it of filteredItems) {
    let bestIdx = -1;
    let bestDist = Infinity;

    for (let k = 0; k < anchors.length; k++) {
      const anchor = anchors[k];
      const prevMid =
        k === 0 ? headerMaxY + 1 : (anchors[k - 1].y + anchor.y) / 2;
      const nextMid =
        k === anchors.length - 1
          ? Math.min(sliceEndY, anchor.y + 24)
          : (anchor.y + anchors[k + 1].y) / 2;

      if (it.y < prevMid || it.y >= nextMid) continue;

      const dist = Math.abs(it.y - anchor.y);
      if (dist <= 22 && dist < bestDist) {
        bestDist = dist;
        bestIdx = k;
      }
    }

    if (bestIdx < 0) continue;

    const colKey = findColumnByBounds(it, columns, boundaries);
    if (!colKey) continue;
    buckets[bestIdx][colKey].push(it);
  }

  return buckets.map((bucket, idx) => {
    const row: Partial<Record<ColumnKey, string>> & { _bannerArea?: string } = {};
    (Object.keys(bucket) as ColumnKey[]).forEach((k) => {
      if (bucket[k].length > 0) {
        row[k] = joinCellItems(bucket[k]);
      }
    });
    const anchorY = anchors[idx].y;
    for (let b = bannerAreas.length - 1; b >= 0; b--) {
      if (bannerAreas[b].y < anchorY) {
        row._bannerArea = bannerAreas[b].area;
        break;
      }
    }
    return row;
  });
}

function parsePage1Metadata(
  page1Items: PdfTextItem[],
  page1FullText: string,
  fileName: string
): {
  org?: string;
  grupoEquipamentos?: string;
  equipamentosNoFiltro?: string[];
  areaSelecionada?: string;
  margem?: string;
  dataInicio?: string;
  dataFim?: string;
  fusoHorario?: string;
  geradoEm?: string;
  totalEntradasReportado?: number;
} {
  const lines = groupItemsIntoLines(page1Items, 3.0)
    .map((l) => normalizeText(l.map((it) => it.str).join(' ')))
    .join('\n');

  const source = `${lines}\n${page1FullText}`;

  const orgMatch = source.match(
    /([A-Z0-9_-]{4,})\s+Relatório de Entradas\/Sa[íi]das de Áreas/i
  );
  const grupoEquipMatch = source.match(
    /Grupos Equipamentos\s+(.+?)\s+Equipamentos/i
  );
  const equipamentosListMatch = source.match(
    /Equipamentos\s+([\s\S]+?)\s+Grupos Condutores/i
  );
  const areaMatch = source.match(
    /Grupo Áreas\s+.+?\s+Áreas\s+([\s\S]+?)\s+(?:Apresentar|Margem)/i
  );
  const margemMatch = source.match(/Margem\s+(\d{2}:\d{2}:\d{2})/i);
  const dataMatch = source.match(
    /Data\s+(\d{2}\/\d{2}\/\d{4})\s+Até\s+(\d{2}\/\d{2}\/\d{4})/i
  );
  const tzMatch = source.match(/\((UTC[^)]+)\)[^\n|]*/i);
  const generatedMatch = source.match(
    /([A-Za-zÀ-ÿ]{3}\s+\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2})/
  );
  const page1TotalsMatch = source.match(
    /(\d{2}:\d{2}:\d{2})\s+\d{2}:\d{2}:\d{2}\s+(\d{1,6})\s+[\d.,]+\s*(?:horas?|hrs?|km|h)?\s+\d{2}:\d{2}:\d{2}\s+\d{2}:\d{2}:\d{2}\s+\d{2}:\d{2}:\d{2}/
  );

  // Grab "Áreas" cleanly from coordinate items on Page 1 ("Áreas" label, value to its right)
  let coordArea: string | undefined;
  const areasLabel = page1Items.find(
    (it) => normalizeHeaderToken(it.str) === 'areas' && it.y < 260
  );
  const apresentarLabel = page1Items.find(
    (it) => normalizeHeaderToken(it.str).startsWith('apresentar') && it.y < 280
  );
  const margemLabel = page1Items.find(
    (it) => normalizeHeaderToken(it.str) === 'margem' && it.y < 280
  );
  if (areasLabel) {
    const nextRowLabels = [apresentarLabel, margemLabel]
      .filter((l): l is PdfTextItem => Boolean(l && l.y > areasLabel.y + 2))
      .map((l) => l.y);
    const maxAreaY =
      nextRowLabels.length > 0 ? Math.min(...nextRowLabels) - 2 : areasLabel.y + 18;
    const sameRowRight = page1Items
      .filter(
        (it) =>
          it.y >= areasLabel.y - 6 &&
          it.y <= maxAreaY &&
          it.x > areasLabel.x + areasLabel.w + 5
      )
      .sort((a, b) => a.y - b.y || a.x - b.x);
    if (sameRowRight.length > 0) {
      coordArea = normalizeText(sameRowRight.map((it) => it.str).join(' '));
    }
  }

  // Extract equipment filter list from coordinate region between "Equipamentos" label and "Grupos Condutores"
  let coordEquipList: string[] | undefined;
  const equipLabel = page1Items.find(
    (it) =>
      normalizeHeaderToken(it.str) === 'equipamentos' &&
      it.x > 200 &&
      it.y < 180
  );
  const condGrupoLabel = page1Items.find(
    (it) => normalizeHeaderToken(it.str) === 'grupos condutores'
  );
  if (equipLabel) {
    const maxY = condGrupoLabel ? condGrupoLabel.y - 3 : equipLabel.y + 20;
    const eqTokens = page1Items
      .filter(
        (it) =>
          it.x > equipLabel.x + equipLabel.w + 5 &&
          it.y >= equipLabel.y - 14 &&
          it.y <= maxY
      )
      .sort((a, b) => a.y - b.y || a.x - b.x);
    if (eqTokens.length > 0) {
      coordEquipList = eqTokens
        .map((t) => t.str)
        .join(' ')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }

  return {
    org: orgMatch?.[1]?.trim(),
    grupoEquipamentos: grupoEquipMatch?.[1]?.trim(),
    equipamentosNoFiltro:
      coordEquipList && coordEquipList.length > 0
        ? coordEquipList
        : equipamentosListMatch
        ? equipamentosListMatch[1]
            .replace(/\r?\n/g, ' ')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined,
    areaSelecionada: coordArea || areaMatch?.[1]?.trim(),
    margem: margemMatch?.[1]?.trim(),
    dataInicio: dataMatch?.[1]?.trim(),
    dataFim: dataMatch?.[2]?.trim(),
    fusoHorario: tzMatch?.[0]?.trim(),
    geradoEm: generatedMatch?.[1]?.trim(),
    totalEntradasReportado: page1TotalsMatch
      ? parseInt(page1TotalsMatch[2], 10)
      : undefined,
  };
}

/**
 * 2D Geometric Coordinate Parser for Novatronica GPS "Relatório de Entradas/Saídas de Áreas" PDFs.
 * Reads exact (X, Y) cell coordinates directly via unpdf's PDF.js document proxy so:
 * - Multi-line wrapped cells ("LAVARIA" + "PT 18", "ALBERTO MUASSOCA" + "(180F3)") never split or truncate
 * - Page 2-6 "Lista" column 1 ("Nº": 351, 528, 594, 600) is strictly isolated and NEVER leaks into Equipment or Driver
 * - "Resumo" rows are the primary dataset; "Lista" cycles enrich exact entry counts and hourly/shift analytics
 */
export async function parseNovatronicaPdfBytes(
  pdfUint8: Uint8Array,
  fileName: string
): Promise<FleetDataset | null> {
  const doc = await getDocumentProxy(new Uint8Array(pdfUint8));
  const numPages = doc.numPages;
  if (!numPages || numPages <= 0) return null;

  const pagesItems: PdfTextItem[][] = [];
  const pageTexts: string[] = [];

  for (let p = 1; p <= numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const rotate = page.rotate || 0;
    const items: PdfTextItem[] = [];

    for (const raw of tc.items as RawPdfItemLike[]) {
      const projected = projectItemCoordinates(raw, rotate);
      if (projected) items.push(projected);
    }

    pagesItems.push(items);
    pageTexts.push(items.map((it) => it.str).join(' '));
  }

  const rawFullText = pageTexts.join('\n');
  const looksLikeNovatronica =
    rawFullText.includes('Entradas/Saídas') ||
    rawFullText.includes('Entradas/Saidas') ||
    rawFullText.toLowerCase().includes('novatronica') ||
    (rawFullText.includes('Utilização') &&
      rawFullText.includes('Relanti') &&
      rawFullText.includes('Parado'));

  if (!looksLikeNovatronica) {
    return null;
  }

  const page1Meta = parsePage1Metadata(
    pagesItems[0] ?? [],
    pageTexts[0] ?? '',
    fileName
  );
  const rawAreaFilter = page1Meta.areaSelecionada;
  const singleFallbackArea =
    rawAreaFilter && !isGenericAllArea(rawAreaFilter) && !isMultiAreaList(rawAreaFilter)
      ? rawAreaFilter
      : undefined;
  const stamp = Date.now();

  const detailCycles: FleetCycleRecord[] = [];
  const resumoRecords: FleetCycleRecord[] = [];
  const equipTotalsCountMap = new Map<string, number>();
  const totaisAreasList: string[] = [];

  let currentSection: TableSectionKind = 'unknown';
  let currentColumns: DetectedColumn[] = [];

  for (let pIdx = 0; pIdx < pagesItems.length; pIdx++) {
    const pageItems = pagesItems[pIdx];
    if (pageItems.length === 0) continue;

    const footerStartY = detectFooterStartY(pageItems);
    const headerStartY = detectHeaderStartY(pageItems);
    const bodyItems = pageItems.filter(
      (it) => it.y >= headerStartY && it.y < footerStartY
    );

    const slices = detectPageSections(
      bodyItems,
      currentSection,
      currentColumns,
      footerStartY
    );

    for (const slice of slices) {
      const { section, columns, headerMaxY, dataItems, sliceEndY } = slice;
      currentSection = section;
      currentColumns = columns;

      if (columns.length === 0 || dataItems.length === 0) continue;

      const boundaries = computeColumnBoundaries(columns, dataItems);

      if (section === 'lista') {
        const rows = buildRowsByAnchor(
          dataItems,
          columns,
          boundaries,
          'numero',
          /^\d{1,6}$/,
          headerMaxY,
          sliceEndY
        );

        for (const row of rows) {
          const numero = parseInt(row.numero ?? '0', 10);
          const equipamento = normalizeText(row.equipamento ?? '');
          if (!numero || !equipamento || /^\d+$/.test(equipamento)) continue;

          const condutorCompleto = cleanCondutor(row.condutor ?? '');
          const entrada = cleanDateTimeCell(row.entrada ?? '');
          const saida = cleanDateTimeCell(row.saida ?? '');
          const duracaoSeg = parseHMS(row.duracao ?? '00:00:00');
          const distanciaHoras = parseDistanceHoras(row.distancia ?? '0');
          const utilizacaoSeg = parseHMS(row.utilizacao ?? '00:00:00');
          const relantiSeg = parseHMS(row.relanti ?? '00:00:00');
          const paradoSeg = parseHMS(row.parado ?? '00:00:00');
          const produtivoSeg = Math.max(0, utilizacaoSeg - relantiSeg);
          const { nome, codigo } = splitDriverIdentity(condutorCompleto);
          const area = sanitizeAreaCell(
            row.area ?? row._bannerArea ?? '',
            singleFallbackArea
          );

          detailCycles.push({
            id: `lista-${stamp}-${numero}-${detailCycles.length}`,
            numero,
            equipamento,
            condutorCompleto,
            condutorNome: nome,
            condutorCodigo: codigo,
            entrada,
            saida,
            data:
              extractDateFromDateTime(entrada) ||
              extractDateFromDateTime(saida),
            horaEntrada: extractHourFromDateTime(entrada),
            entradasCount: 1,
            duracaoSeg,
            distanciaHoras,
            utilizacaoSeg,
            relantiSeg,
            paradoSeg,
            produtivoSeg,
            contador: normalizeText(row.contador ?? 'Indisponível') || 'Indisponível',
            area,
            origemArquivo: fileName,
            sourceSection: 'lista',
          });
        }
      } else if (section === 'resumo') {
        const rows = buildRowsByAnchor(
          dataItems,
          columns,
          boundaries,
          'dia',
          /^\d{2}\/\d{2}\/\d{4}$/,
          headerMaxY,
          sliceEndY
        );

        for (const row of rows) {
          const dia = normalizeText(row.dia ?? '');
          const equipamento = normalizeText(row.equipamento ?? '');
          if (!dia || !equipamento || /^\d+$/.test(equipamento)) continue;

          const condutorCompleto = cleanCondutor(row.condutor ?? '');
          const entrada = cleanDateTimeCell(row.entrada ?? '');
          const saida = cleanDateTimeCell(row.saida ?? '');
          const duracaoSeg = parseHMS(row.duracao ?? '00:00:00');
          const inicio = row.inicio ? cleanDateTimeCell(row.inicio) : undefined;
          const fim = row.fim ? cleanDateTimeCell(row.fim) : undefined;
          const distanciaHoras = parseDistanceHoras(row.distancia ?? '0');
          const utilizacaoSeg = parseHMS(row.utilizacao ?? '00:00:00');
          const relantiSeg = parseHMS(row.relanti ?? '00:00:00');
          const paradoSeg = parseHMS(row.parado ?? '00:00:00');
          const produtivoSeg = Math.max(0, utilizacaoSeg - relantiSeg);
          const { nome, codigo } = splitDriverIdentity(condutorCompleto);
          const area = sanitizeAreaCell(
            row.area ?? row._bannerArea ?? '',
            singleFallbackArea
          );

          const horaSource = /\d{2}:\d{2}:\d{2}/.test(entrada)
            ? entrada
            : inicio && /\d{2}:\d{2}:\d{2}/.test(inicio)
            ? inicio
            : '00/00/0000 00:00:00';

          const rowIndex = resumoRecords.length + 1;
          resumoRecords.push({
            id: `resumo-${stamp}-${rowIndex}-${resumoRecords.length}`,
            numero: rowIndex,
            equipamento,
            condutorCompleto,
            condutorNome: nome,
            condutorCodigo: codigo,
            entrada,
            saida,
            inicio,
            fim,
            data: dia,
            horaEntrada: extractHourFromDateTime(horaSource),
            entradasCount: 1,
            duracaoSeg,
            distanciaHoras,
            utilizacaoSeg,
            relantiSeg,
            paradoSeg,
            produtivoSeg,
            contador: normalizeText(row.contador ?? 'Indisponível') || 'Indisponível',
            area,
            origemArquivo: fileName,
            sourceSection: 'resumo',
          });
        }
      } else if (section === 'totais_equipamentos') {
        const yLines = groupItemsIntoLines(dataItems, 3.0);
        for (const line of yLines) {
          const bucket: Partial<Record<ColumnKey, PdfTextItem[]>> = {};
          for (const it of line) {
            const colKey = findColumnByBounds(it, columns, boundaries);
            if (!colKey) continue;
            bucket[colKey] = bucket[colKey] ?? [];
            bucket[colKey]!.push(it);
          }
          const eq = normalizeText(joinCellItems(bucket.equipamento ?? []));
          const cntStr = normalizeText(joinCellItems(bucket.numResultados ?? []));
          if (
            eq &&
            eq.toLowerCase() !== 'total' &&
            !/^\d+$/.test(eq) &&
            /^\d{1,6}$/.test(cntStr)
          ) {
            equipTotalsCountMap.set(eq, parseInt(cntStr, 10));
          }
        }
      } else if (section === 'totais_areas') {
        const yLines = groupItemsIntoLines(dataItems, 3.0);
        for (const line of yLines) {
          const bucket: Partial<Record<ColumnKey, PdfTextItem[]>> = {};
          for (const it of line) {
            const colKey = findColumnByBounds(it, columns, boundaries);
            if (!colKey) continue;
            bucket[colKey] = bucket[colKey] ?? [];
            bucket[colKey]!.push(it);
          }
          const areaName = sanitizeAreaCell(joinCellItems(bucket.area ?? []));
          if (
            areaName &&
            !isGenericAllArea(areaName) &&
            areaName.toLowerCase() !== 'total' &&
            !/^\d+$/.test(areaName) &&
            !totaisAreasList.some((a) => normAreaCompareKey(a) === normAreaCompareKey(areaName))
          ) {
            totaisAreasList.push(areaName);
          }
        }
      }
    }
  }

  const uniqueDetailCycles = deduplicateCycleRecords(detailCycles).unique;

  // Enrich/split Resumo rows lacking a concrete area using Lista cycles (e.g. when Resumo omits Área column)
  let enrichedResumoRecords: FleetCycleRecord[] = [];
  if (resumoRecords.length > 0) {
    if (uniqueDetailCycles.length > 0) {
      for (const rec of resumoRecords) {
        if (!isGenericAllArea(rec.area)) {
          enrichedResumoRecords.push(rec);
          continue;
        }

        const eqNorm = rec.equipamento.trim().toUpperCase();
        const condNorm = rec.condutorCompleto.trim().toUpperCase();
        const recStartMs = parseDateTimeToMs(rec.entrada);
        const recEndMs = parseDateTimeToMs(rec.saida);

        const matchingCycles = uniqueDetailCycles.filter((c) => {
          if (c.equipamento.trim().toUpperCase() !== eqNorm) return false;
          if (c.condutorCompleto.trim().toUpperCase() !== condNorm) return false;
          if (isGenericAllArea(c.area)) return false;
          if (rec.data && c.data && c.data !== rec.data) return false;
          const cMs = parseDateTimeToMs(c.entrada);
          if (cMs !== null && recStartMs !== null && recEndMs !== null) {
            return cMs >= recStartMs - 60000 && cMs <= recEndMs + 60000;
          }
          return true;
        });

        const fallbackMatching =
          matchingCycles.length > 0
            ? matchingCycles
            : uniqueDetailCycles.filter(
                (c) =>
                  c.equipamento.trim().toUpperCase() === eqNorm &&
                  c.condutorCompleto.trim().toUpperCase() === condNorm &&
                  !isGenericAllArea(c.area) &&
                  (!rec.data || !c.data || c.data === rec.data)
              );

        const concreteAreasMap = new Map<string, FleetCycleRecord[]>();
        for (const c of fallbackMatching) {
          const k = normAreaCompareKey(c.area);
          const list = concreteAreasMap.get(k) ?? [];
          list.push(c);
          concreteAreasMap.set(k, list);
        }

        if (concreteAreasMap.size === 1) {
          const firstArea = fallbackMatching[0].area;
          enrichedResumoRecords.push({ ...rec, area: firstArea });
        } else if (concreteAreasMap.size > 1) {
          // Resumo collapsed multiple areas into one row: split cleanly per area from Lista
          for (const [, cyclesInArea] of concreteAreasMap.entries()) {
            const sorted = [...cyclesInArea].sort(
              (a, b) =>
                (parseDateTimeToMs(a.entrada) ?? 0) -
                (parseDateTimeToMs(b.entrada) ?? 0)
            );
            const duracaoSeg = cyclesInArea.reduce((s, c) => s + c.duracaoSeg, 0);
            const utilizacaoSeg = cyclesInArea.reduce((s, c) => s + c.utilizacaoSeg, 0);
            const relantiSeg = cyclesInArea.reduce((s, c) => s + c.relantiSeg, 0);
            const paradoSeg = cyclesInArea.reduce((s, c) => s + c.paradoSeg, 0);
            const produtivoSeg = cyclesInArea.reduce((s, c) => s + c.produtivoSeg, 0);
            const distanciaHoras =
              Math.round(
                cyclesInArea.reduce((s, c) => s + c.distanciaHoras, 0) * 10
              ) / 10;

            const idx = enrichedResumoRecords.length + 1;
            enrichedResumoRecords.push({
              ...rec,
              id: `resumo-split-${stamp}-${idx}-${enrichedResumoRecords.length}`,
              numero: idx,
              area: sorted[0].area,
              entrada: sorted[0].entrada || rec.entrada,
              saida: sorted[sorted.length - 1].saida || rec.saida,
              horaEntrada: sorted[0].horaEntrada,
              entradasCount: cyclesInArea.length,
              duracaoSeg,
              utilizacaoSeg,
              relantiSeg,
              paradoSeg,
              produtivoSeg,
              distanciaHoras,
            });
          }
        } else if (totaisAreasList.length === 1) {
          enrichedResumoRecords.push({ ...rec, area: totaisAreasList[0] });
        } else {
          enrichedResumoRecords.push(rec);
        }
      }
    } else if (totaisAreasList.length === 1) {
      enrichedResumoRecords = resumoRecords.map((rec) =>
        isGenericAllArea(rec.area) ? { ...rec, area: totaisAreasList[0] } : rec
      );
    } else {
      enrichedResumoRecords = resumoRecords;
    }

    // Reconcile exact entradasCount for Resumo rows from Lista (or Totais Equipamentos if Lista omitted)
    if (uniqueDetailCycles.length > 0) {
      const assignedCounts = new Array<number>(enrichedResumoRecords.length).fill(0);

      for (const cycle of uniqueDetailCycles) {
        const eqNorm = cycle.equipamento.trim().toUpperCase();
        const condNorm = cycle.condutorCompleto.trim().toUpperCase();
        const areaNorm = normAreaCompareKey(cycle.area);

        const candidates: number[] = [];
        enrichedResumoRecords.forEach((rec, i) => {
          const recAreaNorm = normAreaCompareKey(rec.area);
          const areaMatches =
            recAreaNorm === areaNorm ||
            isGenericAllArea(rec.area) ||
            isGenericAllArea(cycle.area);
          if (
            rec.equipamento.trim().toUpperCase() === eqNorm &&
            rec.condutorCompleto.trim().toUpperCase() === condNorm &&
            areaMatches
          ) {
            candidates.push(i);
          }
        });

        const sameDateCandidates = candidates.filter(
          (i) => enrichedResumoRecords[i].data === cycle.data
        );
        const pool =
          sameDateCandidates.length > 0 ? sameDateCandidates : candidates;

        if (pool.length === 1) {
          assignedCounts[pool[0]]++;
        } else if (pool.length > 1) {
          const cycleMs = parseDateTimeToMs(cycle.entrada);
          let matchedIdx = pool[0];
          if (cycleMs !== null) {
            for (const cIdx of pool) {
              const rec = enrichedResumoRecords[cIdx];
              const startMs = parseDateTimeToMs(rec.entrada);
              const endMs = parseDateTimeToMs(rec.saida);
              if (
                startMs !== null &&
                cycleMs >= startMs - 60000 &&
                (endMs === null || cycleMs <= endMs + 60000)
              ) {
                matchedIdx = cIdx;
                break;
              }
            }
          }
          assignedCounts[matchedIdx]++;
        }
      }

      enrichedResumoRecords.forEach((rec, i) => {
        if (assignedCounts[i] > 0) {
          rec.entradasCount = assignedCounts[i];
        }
      });
    } else {
      const byEquip = new Map<string, FleetCycleRecord[]>();
      for (const rec of enrichedResumoRecords) {
        const list = byEquip.get(rec.equipamento) ?? [];
        list.push(rec);
        byEquip.set(rec.equipamento, list);
      }

      for (const [eq, list] of byEquip.entries()) {
        const targetCount =
          equipTotalsCountMap.get(eq) ??
          (byEquip.size === 1 ? page1Meta.totalEntradasReportado : undefined);

        if (targetCount && targetCount > list.length) {
          const totalDur = list.reduce((s, r) => s + r.duracaoSeg, 0);
          let assigned = 0;
          list.forEach((rec, i) => {
            if (i === list.length - 1) {
              rec.entradasCount = Math.max(1, targetCount - assigned);
            } else {
              const share =
                totalDur > 0
                  ? Math.max(1, Math.round((rec.duracaoSeg / totalDur) * targetCount))
                  : Math.max(1, Math.round(targetCount / list.length));
              rec.entradasCount = share;
              assigned += share;
            }
          });
        }
      }
    }
  }

  // Primary records MUST come from "Resumo" when available; otherwise fall back to Lista
  const resumoHasConcreteAreas = enrichedResumoRecords.some(
    (r) => !isGenericAllArea(r.area)
  );
  const listaHasConcreteAreas = uniqueDetailCycles.some(
    (c) => !isGenericAllArea(c.area)
  );
  const primaryRecords =
    enrichedResumoRecords.length > 0 && (resumoHasConcreteAreas || !listaHasConcreteAreas)
      ? enrichedResumoRecords
      : uniqueDetailCycles;

  if (primaryRecords.length === 0) {
    return null;
  }

  const extractedAreas = Array.from(
    new Set(
      primaryRecords
        .map((r) => r.area)
        .filter((a) => !isGenericAllArea(a))
    )
  );

  const areaSelecionada =
    extractedAreas.length > 0
      ? extractedAreas.join(', ')
      : singleFallbackArea ||
        (totaisAreasList.length > 0 ? totaisAreasList.join(', ') : 'N/D');

  const metadata: ReportMetadata = {
    organizacao: page1Meta.org || 'SOCMINEIRACUANGO',
    sistema: 'Novatronica Gestão de Frotas por GPS',
    grupoEquipamentos: page1Meta.grupoEquipamentos || 'Pesados Metalurgia',
    equipamentosNoFiltro:
      page1Meta.equipamentosNoFiltro && page1Meta.equipamentosNoFiltro.length > 0
        ? page1Meta.equipamentosNoFiltro
        : Array.from(new Set(primaryRecords.map((r) => r.equipamento))),
    grupoCondutores: 'Todos',
    grupoAreas: 'Todos',
    areaSelecionada,
    margem: page1Meta.margem || '00:00:10',
    dataInicio: page1Meta.dataInicio || primaryRecords[0]?.data || '',
    dataFim:
      page1Meta.dataFim ||
      primaryRecords[primaryRecords.length - 1]?.data ||
      '',
    fusoHorario: page1Meta.fusoHorario || '(UTC+01:00) West Central Africa',
    geradoEm: page1Meta.geradoEm || new Date().toLocaleString('pt-PT'),
    arquivoOrigem: fileName,
    totalEntradasReportado: page1Meta.totalEntradasReportado,
  };

  return deduplicateDataset({
    metadata,
    records: primaryRecords,
    detailCycles:
      uniqueDetailCycles.length > 0 ? uniqueDetailCycles : undefined,
  }).dataset;
}
