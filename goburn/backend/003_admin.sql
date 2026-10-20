-- GO BURN • Permissões para a central privada (executar APÓS 001_schema.sql)
create table if not exists public.goburn_staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'analyst' check (role in ('owner','admin','analyst')),
  created_at timestamptz not null default now()
);
alter table public.goburn_staff enable row level security;
revoke all on public.goburn_staff from anon,authenticated;
-- Inserir manualmente o UUID de um usuário autenticado da equipe:
-- insert into public.goburn_staff(user_id,role) values ('UUID_DA_EQUIPE','owner');
-- Nunca permitir autoinscrição em goburn_staff via navegador.
create table if not exists public.goburn_audit (
  id bigint generated always as identity primary key,
  actor uuid references auth.users(id) on delete set null,
  case_id uuid references public.goburn_cases(id) on delete set null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.goburn_audit enable row level security;
revoke all on public.goburn_audit from anon,authenticated;
create index if not exists goburn_audit_case on public.goburn_audit(case_id,created_at desc);
