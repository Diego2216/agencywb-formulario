-- GO BURN • Relatórios internos; executar após 001_schema.sql
create schema if not exists goburn_internal;
revoke all on schema goburn_internal from public, anon, authenticated;
grant usage on schema goburn_internal to service_role;

create or replace view goburn_internal.sales_funnel as
select date_trunc('month',created_at)::date as mes,
count(*) as checkout_iniciados,
count(*) filter (where status in ('paid','submitted')) as pagamentos_confirmados,
count(*) filter (where status='submitted') as formularios_finalizados,
coalesce(sum(amount_cents) filter (where status in ('paid','submitted')),0)/100.0 as faturamento_bruto_confirmado
from public.goburn_orders group by 1 order by 1 desc;

create or replace view goburn_internal.product_opportunities as
select
  answers->>'sector' as segmento,
  opportunity_type,
  answers->>'impact' as dor_principal,
  count(*) as casos_pagos,
  round(avg(lead_score),1) as score_medio,
  count(*) filter (where priority='alta') as casos_prioritarios,
  min(submitted_at) as primeiro_caso,
  max(submitted_at) as ultimo_caso
from public.goburn_cases
group by 1,2,3 order by casos_pagos desc,score_medio desc;

create or replace view goburn_internal.case_pipeline as
select c.protocol,c.status,c.priority,c.opportunity_type,c.lead_score,
  o.plan,o.amount_cents/100.0 as valor_diagnostico,
  o.customer_name,o.customer_email,o.customer_company,
  c.answers->>'problem' as problema,
  c.answers->>'outcome' as objetivo,
  c.answers->>'budget' as orcamento_implantacao,
  c.answers->>'timeline' as prazo_implantacao,
  c.submitted_at
from public.goburn_cases c join public.goburn_orders o on o.id=c.order_id
order by case when c.priority='alta' then 1 when c.priority='media' then 2 else 3 end,c.submitted_at;

revoke all on all tables in schema goburn_internal from public,anon,authenticated;
grant select on all tables in schema goburn_internal to service_role;

comment on view goburn_internal.product_opportunities is 'Agrupamento interno de demandas para identificar candidatos a SaaS. Não expor a indivíduos nem publicar grupos pequenos.';
