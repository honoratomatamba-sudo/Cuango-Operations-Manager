-- ============================================================================
-- Cuango Fleet BI — Schema SQL para Supabase (PostgreSQL)
-- Execute este script no SQL Editor do seu projeto Supabase:
-- https://supabase.com/dashboard/project/brsljluiivsdvmajelcc/sql/new
-- ============================================================================

create table if not exists public.cuango_workspaces (
  id text primary key,
  organizacao text not null default 'SOCMINEIRACUANGO',
  sistema text not null default 'Novatronica Gestão de Frotas por GPS',
  grupo_equipamentos text not null default 'Pesados Metalurgia',
  equipamentos_no_filtro jsonb not null default '[]'::jsonb,
  grupo_condutores text not null default 'Todos',
  grupo_areas text not null default 'Todos',
  area_selecionada text not null default 'Lavaria PT5',
  margem text not null default '00:00:10',
  data_inicio text not null default '',
  data_fim text not null default '',
  fuso_horario text not null default '(UTC+01:00) West Central Africa',
  gerado_em text not null default '',
  arquivo_origem text not null default '',
  total_entradas_reportado integer,
  auto_sync_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cuango_report_files (
  id text primary key,
  file_name text not null,
  canonical_name text not null,
  area_selecionada text not null default 'N/D',
  data_inicio text not null default '',
  data_fim text not null default '',
  resumo_count integer not null default 0,
  detail_count integer not null default 0,
  total_entradas integer not null default 0,
  imported_at timestamptz not null default now()
);

create table if not exists public.cuango_fleet_records (
  id text primary key,
  record_id text not null,
  source_section text not null check (source_section in ('resumo', 'lista')),
  numero integer not null default 0,
  equipamento text not null,
  condutor_completo text not null,
  condutor_nome text not null,
  condutor_codigo text not null default '—',
  entrada text not null default '',
  saida text not null default '',
  inicio text,
  fim text,
  data text not null default '',
  hora_entrada integer not null default 0,
  entradas_count integer not null default 1,
  duracao_seg integer not null default 0,
  distancia_horas double precision not null default 0,
  utilizacao_seg integer not null default 0,
  relanti_seg integer not null default 0,
  parado_seg integer not null default 0,
  produtivo_seg integer not null default 0,
  contador text not null default 'Indisponível',
  area text not null,
  origem_arquivo text not null default '',
  fingerprint text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists idx_cuango_records_section on public.cuango_fleet_records (source_section);
create index if not exists idx_cuango_records_area on public.cuango_fleet_records (area);
create index if not exists idx_cuango_records_equipamento on public.cuango_fleet_records (equipamento);
create index if not exists idx_cuango_records_data on public.cuango_fleet_records (data);
create index if not exists idx_cuango_records_arquivo on public.cuango_fleet_records (origem_arquivo);

-- Políticas RLS para permitir acesso pela chave API configurada na aplicação
alter table public.cuango_workspaces enable row level security;
alter table public.cuango_report_files enable row level security;
alter table public.cuango_fleet_records enable row level security;

drop policy if exists "cuango_workspaces_api_all" on public.cuango_workspaces;
create policy "cuango_workspaces_api_all"
  on public.cuango_workspaces
  for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "cuango_report_files_api_all" on public.cuango_report_files;
create policy "cuango_report_files_api_all"
  on public.cuango_report_files
  for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "cuango_fleet_records_api_all" on public.cuango_fleet_records;
create policy "cuango_fleet_records_api_all"
  on public.cuango_fleet_records
  for all
  to anon, authenticated
  using (true)
  with check (true);

create table if not exists public.cuango_users (
  id text primary key,
  username text not null unique,
  full_name text not null,
  email text not null default '',
  role text not null default 'operador' check (role in ('admin', 'operador', 'visualizador')),
  password_hash text not null,
  active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cuango_users_username on public.cuango_users (username);

alter table public.cuango_users enable row level security;

drop policy if exists "cuango_users_api_all" on public.cuango_users;
create policy "cuango_users_api_all"
  on public.cuango_users
  for all
  to anon, authenticated
  using (true)
  with check (true);

