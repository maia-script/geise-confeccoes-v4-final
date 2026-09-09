# Auditoria final — Geise Confecções V4

Esta versão foi preparada para **homologação antes da divulgação pública**. O objetivo desta auditoria é reduzir falhas reproduzíveis no código e no empacotamento; ela não substitui testes reais de serviços externos.

## Verificação 1 — código-fonte e execução local semelhante à produção

Executado sobre a árvore principal da V4:

- validação de arquivos obrigatórios e sintaxe dos módulos;
- auditoria estática de identidade, segredos, XSS/URLs, estoque, cupons, pedidos, administração, PWA e deploy;
- testes unitários de senha/CPF/telefone, frete, compatibilidade SQL, webhook Mercado Pago, busca por `#código`, badges, estoque, pagamento manual e IA local;
- smoke test do fluxo comercial: catálogo, orçamento como visitante, conta, CPF, checkout, WhatsApp, reserva de estoque, pagamento, reembolso, administração e PWA;
- inicialização com `NODE_ENV=production` em banco SQLite limpo;
- verificação de headers CSP, HSTS, `nosniff`, Referrer-Policy e Permissions-Policy;
- integridade SQLite, foreign keys, códigos/SKUs duplicados e invariantes de estoque;
- teste de caminhos maliciosos simples e duplamente codificados.

Durante esta rodada foi encontrado e corrigido um caso em que uma URL contendo segmentos `..` codificados podia ser normalizada pelo parser de URL e cair na SPA. A V4 agora rejeita esses caminhos antes da normalização e há testes automatizados cobrindo o caso.

## Verificação 2 — pacote final extraído do zero

O ZIP final é criado sem `.env`, bancos SQLite, logs, `node_modules` ou arquivos temporários. Depois ele é extraído em uma pasta limpa e a mesma suíte `npm run verify` é executada novamente a partir do conteúdo extraído. Também são verificados:

- integridade do ZIP;
- ausência de arquivos proibidos/segredos;
- estrutura de deploy (`package.json`, `server.mjs`, `render.yaml`, `public/`, `server/`, `tests/` e documentação);
- hash SHA-256 do artefato final.

## Limitação real

A camada PostgreSQL é implementada e a conversão/portabilidade SQL é testada localmente, mas **uma conexão com um PostgreSQL externo real do Render só pode ser validada depois do deploy de homologação**. O mesmo vale para DNS/domínio, disponibilidade do Render, WhatsApp e qualquer integração futura de Mercado Pago/OpenAI. Por isso a loja deve permanecer em homologação durante os testes planejados antes da divulgação.
