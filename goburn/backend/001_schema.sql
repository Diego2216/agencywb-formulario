-- GO BURN • schema isolado logicamente. Executar APENAS em projeto Supabase autorizado para GO BURN.
create extension if not exists pgcrypto;
create table if not exists public.goburn_orders (
  id uuid primary key default gen_random_uuid(),
  plan text not null check (plan in ('essencial','estrategico','blueprint')),
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'BRL' check (currency='BRL'),
  customer_name text not null,
  customer_email text not null,
  customer_company text not null,
  customer_phone text,
  terms_accepted_at timestamptz not null,
  access_token_hash text not null,
  preference_id text unique,
  payment_id text unique,
  status text not null default 'pending' check (status in ('pending','paid','submitted','revoked')),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  submitted_at timestamptz
);
create index if not exists goburn_orders_email_created_idx on public.goburn_orders(lower(customer_email), created_at desc);
create index if not exists goburn_orders_status_idx on public.goburn_orders(status,created_at desc);
create table if not exists public.goburn_cases (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.goburn_orders(id) on delete restrict,
  answers jsonb not null,
  lead_score integer not null check (lead_score between 0 and 100),
  opportunity_type text not null,
  priority text not null check (priority in ('alta','media','baixa')),
  protocol text not null unique,
  status text not null default 'aguardando_analise' check (status in ('aguardando_analise','em_analise','entregue','proposta_enviada','contratado','arquivado')),
  submitted_at timestamptz not null default now(),
  delivered_at timestamptz,
  internal_notes text
);
create index if not exists goburn_cases_queue_idx on public.goburn_cases(status,priority,submitted_at);
-- Nenhum acesso do navegador direto às tabelas. Todas as operações passam pela Edge Function.
alter table public.goburn_orders enable row level security;
alter table public.goburn_cases enable row level security;
revoke all on table public.goburn_orders from anon, authenticated;
revoke all on table public.goburn_cases from anon, authenticated;
-- Não criar policies públicas. service_role opera no servidor; não expor esta chave no site.
comment on table public.goburn_orders is 'GO BURN: pedidos de diagnósticos pagos, acesso liberado apenas por confirmação do Mercado Pago';
comment on table public.goburn_cases is 'GO BURN: respostas de clientes com pagamentos confirmados, dados privados';
