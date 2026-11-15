import { NextRequest, NextResponse } from 'next/server';
import { deduplicateDataset } from '@/lib/fleet-analytics';
import { FleetCycleRecord, FleetDataset } from '@/lib/fleet-types';
import { setActiveServerDataset } from '@/lib/server-store';
import {
  deserializeFleetRecordRow,
  deserializeWorkspaceMetadata,
  getSupabaseServerClient,
  isMissingSchemaError,
  serializeFleetRecordRow,
  serializeReportFiles,
  serializeWorkspaceRow,
  SupabaseFleetRecordRow,
  SupabaseWorkspaceRow,
} from '@/lib/supabase-server';

export async function GET() {
  const supabase = getSupabaseServerClient();

  try {
    const { data: wsData, error: wsErr } = await supabase
      .from('cuango_workspaces')
      .select('*')
      .eq('id', 'default')
      .maybeSingle();

    if (wsErr) {
      if (isMissingSchemaError(wsErr)) {
        return NextResponse.json({
          schemaReady: false,
          sqlSetupRequired: true,
          dataset: null,
        });
      }
      return NextResponse.json({ error: wsErr.message }, { status: 500 });
    }

    if (!wsData) {
      return NextResponse.json({
        schemaReady: true,
        sqlSetupRequired: false,
        dataset: null,
      });
    }

    // Fetch all fleet records in 1000-row pages
    const allRows: SupabaseFleetRecordRow[] = [];
    const PAGE_SIZE = 1000;
    let from = 0;

    while (true) {
      const { data: chunk, error: recErr } = await supabase
        .from('cuango_fleet_records')
        .select('*')
        .order('numero', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (recErr) {
        if (isMissingSchemaError(recErr)) {
          return NextResponse.json({
            schemaReady: false,
            sqlSetupRequired: true,
            dataset: null,
          });
        }
        return NextResponse.json({ error: recErr.message }, { status: 500 });
      }

      const typed = (chunk ?? []) as SupabaseFleetRecordRow[];
      allRows.push(...typed);
      if (typed.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    const resumo: FleetCycleRecord[] = [];
    const lista: FleetCycleRecord[] = [];

    for (const row of allRows) {
      const rec = deserializeFleetRecordRow(row);
      if (row.source_section === 'lista') {
        lista.push(rec);
      } else {
        resumo.push(rec);
      }
    }

    const wsTyped = wsData as SupabaseWorkspaceRow;
    const dataset = deduplicateDataset({
      metadata: deserializeWorkspaceMetadata(wsTyped),
      records: resumo,
      detailCycles: lista.length > 0 ? lista : undefined,
    }).dataset;

    if (dataset.records.length > 0) {
      setActiveServerDataset(dataset);
    }

    return NextResponse.json({
      schemaReady: true,
      sqlSetupRequired: false,
      autoSyncEnabled: wsTyped.auto_sync_enabled,
      dataset: dataset.records.length > 0 ? dataset : null,
    });
  } catch (err) {
    if (isMissingSchemaError(err)) {
      return NextResponse.json({
        schemaReady: false,
        sqlSetupRequired: true,
        dataset: null,
      });
    }
    const msg = err instanceof Error ? err.message : 'Erro ao ler Supabase.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const supabase = getSupabaseServerClient();

  try {
    const body = (await req.json()) as {
      action?: 'sync' | 'replace' | 'preference';
      dataset?: FleetDataset;
      autoSyncEnabled?: boolean;
    };

    const action = body.action ?? 'sync';

    if (action === 'preference') {
      const { error } = await supabase
        .from('cuango_workspaces')
        .update({
          auto_sync_enabled: Boolean(body.autoSyncEnabled),
          updated_at: new Date().toISOString(),
        })
        .eq('id', 'default');

      if (error) {
        if (isMissingSchemaError(error)) {
          return NextResponse.json({
            ok: false,
            schemaReady: false,
            sqlSetupRequired: true,
          });
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, schemaReady: true });
    }

    if (!body.dataset || !Array.isArray(body.dataset.records)) {
      return NextResponse.json(
        { error: 'Dataset inválido para sincronização Supabase.' },
        { status: 400 }
      );
    }

    const clean = deduplicateDataset(body.dataset).dataset;
    setActiveServerDataset(clean);

    if (action === 'replace') {
      const { error: delRecErr } = await supabase
        .from('cuango_fleet_records')
        .delete()
        .neq('id', '');
      if (delRecErr) {
        if (isMissingSchemaError(delRecErr)) {
          return NextResponse.json({
            ok: false,
            schemaReady: false,
            sqlSetupRequired: true,
          });
        }
        return NextResponse.json({ error: delRecErr.message }, { status: 500 });
      }

      const { error: delFileErr } = await supabase
        .from('cuango_report_files')
        .delete()
        .neq('id', '');
      if (delFileErr && !isMissingSchemaError(delFileErr)) {
        return NextResponse.json({ error: delFileErr.message }, { status: 500 });
      }
    }

    const wsPayload = serializeWorkspaceRow(clean.metadata, body.autoSyncEnabled);
    const { error: wsErr } = await supabase
      .from('cuango_workspaces')
      .upsert(wsPayload, { onConflict: 'id' });

    if (wsErr) {
      if (isMissingSchemaError(wsErr)) {
        return NextResponse.json({
          ok: false,
          schemaReady: false,
          sqlSetupRequired: true,
        });
      }
      return NextResponse.json({ error: wsErr.message }, { status: 500 });
    }

    const reportRows = serializeReportFiles(clean);
    if (reportRows.length > 0) {
      const { error: repErr } = await supabase
        .from('cuango_report_files')
        .upsert(reportRows, { onConflict: 'id' });
      if (repErr) {
        return NextResponse.json({ error: repErr.message }, { status: 500 });
      }
    }

    const allRecordRows: SupabaseFleetRecordRow[] = [
      ...clean.records.map((r) => serializeFleetRecordRow(r, 'resumo')),
      ...(clean.detailCycles ?? []).map((c) => serializeFleetRecordRow(c, 'lista')),
    ];

    // Deduplicate by primary key `id` inside payload before batch upsert
    const uniqueById = new Map<string, SupabaseFleetRecordRow>();
    for (const row of allRecordRows) {
      uniqueById.set(row.id, row);
    }
    const dedupedRows = Array.from(uniqueById.values());

    const BATCH_SIZE = 300;
    for (let i = 0; i < dedupedRows.length; i += BATCH_SIZE) {
      const batch = dedupedRows.slice(i, i + BATCH_SIZE);
      const { error: upsertErr } = await supabase
        .from('cuango_fleet_records')
        .upsert(batch, { onConflict: 'id' });

      if (upsertErr) {
        return NextResponse.json({ error: upsertErr.message }, { status: 500 });
      }
    }

    return NextResponse.json({
      ok: true,
      schemaReady: true,
      totalRecords: dedupedRows.length,
    });
  } catch (err) {
    if (isMissingSchemaError(err)) {
      return NextResponse.json({
        ok: false,
        schemaReady: false,
        sqlSetupRequired: true,
      });
    }
    const msg = err instanceof Error ? err.message : 'Erro ao gravar no Supabase.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
