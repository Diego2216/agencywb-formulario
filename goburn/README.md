# GO BURN • Diagnósticos pagos e fábrica de soluções digitais

**Status (20/10/2026):** frontend e backend versionados. Página de apresentação em estágio de homologação. **Checkout de produção, banco GO BURN e entrega dos relatórios ainda NÃO foram ativados nem testados de ponta a ponta.** Acesso à contratação permanece bloqueado enquanto `config.js` não tem `apiBase`.

## Objetivo

Vender diagnósticos profissionais, receber casos **somente após confirmação de pagamento**, identificar dores recorrentes em negócios reais e transformar as demandas em serviços sob medida ou produtos SaaS escaláveis.

A operação **não herda gratuidade** do Wodburn Radar. O Radar segue independente, gratuito no projeto piloto específico. Nenhuma pessoa enviada pelo Radar é cobrada ou migrada automaticamente para GO BURN.

## Produtos e escopos propostos (valores de validação; dependem de aprovação comercial)

| Produto | Preço BRL | Entrega |
|---|---:|---|
| Essencial | R$ 297 | Análise de até 3 problemas, oportunidades e prioridades |
| Estratégico | R$ 897 | Essencial + processos, solução preliminar e roadmap |
| Blueprint | R$ 1.997 | Estratégico + requisitos, arquitetura de referência, MVP e dependências |

Todos excluem desenvolvimento, hospedagem, terceiros, suporte e licenças — tratados em proposta separada. Definir prazos exatos, política de reembolso, revisões e obrigações antes da cobrança.

## Estrutura do repositório

- `index.html`: site e formulário protegido de 5 etapas
- `styles.css`: design responsivo GO BURN (grafite/laranja)
- `app.js`: checkout, validação do status e questionário
- `config.js`: **somente dados públicos** (no momento, vazio e seguro)
- `admin/index.html`: CRM privado com login Supabase Auth, fila de casos e mudança de status
- `backend/001_schema.sql`: pedidos pagos + respostas confidenciais
- `backend/002_intelligence.sql`: indicadores internos e clusters de dor
- `backend/003_admin.sql`: equipe autorizada e trilha de auditoria
- `backend/goburn-api/index.ts`: Supabase Edge Function, Mercado Pago, formulários e API privada
- `privacidade.html`, `termos.html`: **minutas**, revisar antes de ativar vendas
- `PLAYBOOK.md`: tratamento comercial e produto derivado das dores
- `tests/`: inspeções estáticas automatizáveis

## Segurança planejada

1. O browser nunca recebe `MERCADOPAGO_ACCESS_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY` nem segredo do webhook.
2. O servidor determina preço e id do pedido; o frontend não pode alterá-los.
3. Checkout Mercado Pago em ambiente externo; redirect de retorno **não** confirma pagamento.
4. Somente webhook assinado, validado por HMAC e conciliado pela API do Mercado Pago com valor e moeda corretos, muda o status para `paid`.
5. Para consultar pedido / enviar formulário, o cliente precisa de `order_id` + segredo aleatório de 256 bits, cujo hash está no banco.
6. Respostas são aceitas apenas se o pedido estiver `paid`; uma resposta por pedido.
7. Banco com RLS habilitado; tabelas não acessíveis por `anon` ou `authenticated`.
8. Central exige usuário Supabase Auth associado manualmente a `goburn_staff`.
9. Consentimento necessário separado de autorização **opcional** de marketing.
10. Dados do diagnóstico nunca são expostos em URL pública, busca, análises públicas ou relatórios anônimos com grupos pequenos.

**Pontos adicionais antes do lançamento:** limites de acesso e monitoramento de abuso, recuperação segura de acesso por e-mail, alertas de casos pagos, reconciliação de chargebacks/refunds, testes e revisão LGPD/contratual. Os testes reais de Pix e cartão exigem credenciais do recebedor.

## Implantação (não executar contra o banco do Wodburn Radar sem aprovação)

1. Criar **repositório e domínio específicos** para GO BURN, se desejado; por ora somente área de homologação no repositório do Radar. URL de referência provisória: `https://radar.wodburn.com.br/goburn/` — verificar DNS e Actions antes de divulgá-la. O acesso via `github.io` pode redirecionar ao domínio personalizado do repo.
2. Criar projeto Supabase **dedicado** para GO BURN após confirmar eventual custo. **Não misturar dados de projetos distintos.**
3. Executar as migrações `001_schema.sql`, `002_intelligence.sql`, `003_admin.sql` em ordem.
4. Implantar arquivo `backend/goburn-api/index.ts` como Edge Function `goburn-api` com JWT gateway **desabilitado apenas para essa função**; ela mesma valida segredo do cliente, webhook HMAC e JWT da equipe.
5. Configurar secrets privados no Supabase: `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`, `GOBURN_SITE_URL`, `GOBURN_ALLOWED_ORIGIN`, `GOBURN_API_URL`. As variáveis `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são disponibilizadas pela instância Supabase ou devem ser configuradas apenas como secrets.
6. Em Mercado Pago Developer, configurar webhook do tópico `payment` para `GOBURN_API_URL?action=webhook`, validar assinatura e realizar testes reais controlados. Fontes: https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-preferences/payment-notifications
7. Criar colaborador GO BURN pelo Supabase Auth com MFA recomendado e inserir **manualmente** seu `user_id` em `goburn_staff` com `role='owner'`.
8. Preencher `config.js` apenas com valores públicos `apiBase`, `supabaseUrl`, `supabaseAnonKey`. Nunca incluir chave privada.
9. **Antes** de ativar config de pagamento, publicar condições comerciais finais, documentos legais finais, política de suporte, canal de contato, SLA e comprovante do recebedor.
10. Testar fluxo com pagamento aprovado, pendente, rejeitado, estornado, webhook repetido, cross-origin, submit sem pagamento, duplicação, login sem equipe e login autorizado. Só depois remover `noindex` e divulgar.

## Política anti-gratuidade

O formulário de briefing de negócio completo não aceita envio sem status `paid`. Somente o nome, email e empresa são solicitados para criar a sessão de pagamento. O servidor não deve enviar diagnóstico, relatórios, arquitetura ou proposta detalhada gratuitamente.

## Limites conhecidos da versão 1

- A recuperação de pedido quando usuário perde a aba/sessão ainda é manual. Implementar token de recuperação por e-mail.
- Não há integração ativa com provedor de e-mail nem mensageria para notificar a equipe de novas compras: equipe deverá consultar o CRM até ativar alertas.
- Não há geração automática de relatórios nem assinatura de contrato eletrônico; entrega inicial exige analista.
- Ranking de oportunidades é **heurístico de triagem comercial**, não avaliação técnica final nem previsão de sucesso.
- Painel apresenta 150 casos mais recentes; paginar em escala.
- Não há cobrança em produção habilitada no momento.
