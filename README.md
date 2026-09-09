# Geise Confecções V4 — Release Candidate verificada

Loja virtual full-stack/PWA da **Geise Confecções**, construída em HTML, CSS e JavaScript modular no frontend e Node.js no backend. Usa SQLite para desenvolvimento/testes locais e PostgreSQL quando `DATABASE_URL` estiver configurada na hospedagem.

A V4 foi preparada para homologação real antes da abertura comercial: catálogo administrável, busca por código `#xxx`, variantes e estoque, selos customizados, conta por telefone, CPF/endereço no checkout, frete local, pedidos, pagamento manual via WhatsApp, IA local de baixo custo, painel administrativo e estrutura opcional para Mercado Pago/OpenAI no futuro.

## Estado desta entrega

- Versão da aplicação: `4.0.0`.
- Pagamento padrão: `manual` — o pedido nasce no site e o cliente é encaminhado ao WhatsApp oficial para concluir PIX/cartão/combinação com a equipe.
- IA padrão: `local` — não usa API paga e consulta apenas dados permitidos do catálogo.
- Frete inicial: R$ 10 para entrega local; grátis a partir de R$ 200; retirada na loja grátis.
- WhatsApp: `55 66 99667-6270`.
- Banco local: SQLite.
- Banco de hospedagem: PostgreSQL via `DATABASE_URL`.
- `render.yaml` incluído para criar ambiente de homologação no Render.

> Os produtos e imagens presentes no seed são demonstrativos para QA. Antes de divulgar a loja, cadastre produtos, preços, códigos, fotos e estoque reais no painel.

## Recursos comerciais principais

### Catálogo e busca

- Código comercial único por produto, como `#001`, `#147` ou `#V147`.
- Busca exata por `#código` e busca textual por nome, descrição, categoria, tags e marca.
- Categorias/subcategorias, cores, tamanhos e variantes.
- Estoque físico, reservado e disponível.
- Peso e dimensões de embalagem por variante.
- Produto pode continuar visível como esgotado.
- Badges/selos customizados com cor, posição, prioridade e animação.

### Compra

- Navegação e carrinho sem login.
- Compra exige conta por telefone + senha.
- CPF válido e endereço são obrigatórios no checkout.
- Preço, cupom, frete e estoque são recalculados no servidor.
- Reserva temporária de estoque enquanto o pedido aguarda pagamento.
- Cupom inicial de demonstração/configuração: `GEISE10`.
- Frete local e retirada em loja.
- Numeração de pedido `GEI-ANO-CÓDIGO`.

### Pagamento

O modo inicial usa:

```env
PAYMENT_PROVIDER=manual
```

Ele **não coleta cartão, CVV ou senha bancária**. O servidor cria o pedido e gera um link para o WhatsApp oficial com número do pedido, valor e método desejado. Um administrador confirma o recebimento no painel apenas depois de verificar o pagamento real.

Quando a loja quiser automatizar pagamentos, a arquitetura já contém suporte opcional ao Mercado Pago:

```env
PAYMENT_PROVIDER=mercadopago
MERCADOPAGO_ACCESS_TOKEN=...
MERCADOPAGO_WEBHOOK_SECRET=...
```

Segredos devem existir somente nas variáveis de ambiente da hospedagem.

### IA Gê

O modo padrão custa zero em API:

```env
AI_PROVIDER=local
```

A Gê atua como assistente da loja, prioriza satisfação, não inventa produto/preço/estoque e encaminha atendimento humano quando necessário. A arquitetura aceita integração futura com API compatível com OpenAI, configurada exclusivamente no servidor.

## Rodar localmente

Requisitos:

- Node.js 22.5 ou superior.
- npm.

```bash
npm install
cp .env.example .env
npm start
```

No Windows, copie `.env.example` para `.env` pelo Explorador de Arquivos.

Abra:

```text
http://localhost:8080
```

Sem `DATABASE_URL`, o banco padrão fica em:

```text
runtime/geise-v4.sqlite
```

## Verificação automatizada

```bash
npm run check
npm run audit
npm test
npm run verify
```

`npm run verify` executa estrutura/sintaxe, auditoria estática e os testes unitários + fluxo comercial completo.

## Deploy

Leia nesta ordem:

1. `COMECE-AQUI.txt`
2. `docs/DEPLOY-RENDER.md`
3. `docs/AUDITORIA-FINAL-V4.md`
4. `docs/TESTE-3-DIAS.md`
5. `docs/GO-LIVE-CHECKLIST.md`

O Blueprint gratuito do Render é indicado nesta entrega para **homologação**. Antes de aceitar pedidos/dados de clientes reais em operação pública, use infraestrutura persistente adequada, backup e política de restauração testada.

## Segurança implementada

- Senhas derivadas com scrypt.
- Sessões opacas em cookie HttpOnly/SameSite; Secure em produção.
- CSRF para operações mutáveis.
- Rate limiting em autenticação e endpoints sensíveis.
- CSP/HSTS e outros headers de segurança.
- RBAC admin/staff no backend.
- Validação de CPF e normalização de telefone.
- Sanitização de URLs e HTML administrável.
- Limites de tamanho/quantidade em carrinho e requisições.
- Estoque reservado/baixado/liberado com atualizações condicionais.
- Confirmação de pagamento e reembolso idempotentes.
- Logs administrativos.
- API não é persistida pelo Service Worker.
- Nenhum segredo necessário no frontend.

## Estrutura

```text
public/                 frontend + PWA
server/                 backend Node.js
server/db/              schema, seed, migrations e SQLite/PostgreSQL
server/routes/          API
server/services/        regras de negócio
.github/workflows/      CI
render.yaml             homologação Render
Dockerfile              alternativa de deploy
docs/                    operação, QA e deploy
tests/                   check, auditoria, unit e smoke
runtime/                 dados locais — não versionar
```

## Limites desta verificação

Os testes locais validam SQLite e a camada de compatibilidade PostgreSQL, mas não substituem um deploy real. A primeira conexão com PostgreSQL do Render, DNS, disponibilidade da hospedagem, WhatsApp, gateway futuro e API futura de IA são serviços externos e precisam ser validados no ambiente de homologação.

A recomendação é exatamente a escolhida para esta loja: **subir, testar por pelo menos 3 dias, corrigir qualquer detalhe observado e só então divulgar**.
