# Status técnico — Geise Confecções V4

## Pronto para homologação

A V4 possui frontend/PWA, backend Node.js, autenticação por telefone, sessões e CSRF, catálogo por `#código`, variantes/SKU, selos, estoque com reserva, carrinho, favoritos, cupom, CPF/endereço no checkout, frete local, pedidos, confirmação manual de pagamento, painel administrativo, auditoria, CMS, IA local, SQLite/PostgreSQL e testes automatizados.

O fluxo comercial automatizado testado cobre: catálogo → carrinho → cadastro → endereço → CPF → orçamento → checkout → pedido → reserva → confirmação administrativa de pagamento → baixa de estoque → preparação → reembolso → restauração de estoque.

## Modo operacional inicial

- `PAYMENT_PROVIDER=manual`: pedido criado no site e conclusão pelo WhatsApp oficial; admin confirma após conferir recebimento.
- `AI_PROVIDER=local`: assistência sem custo de API externa.
- Frete: R$10 local, grátis a partir de R$200, retirada grátis.

## Ainda depende do ambiente externo

- primeira conexão real com PostgreSQL da hospedagem;
- domínio/DNS/HTTPS definitivo;
- persistência e backup escolhidos para produção;
- catálogo/fotos/estoque reais;
- políticas finais revisadas pela responsável pela loja;
- gateway automatizado, caso seja ativado;
- API remota de IA, caso seja ativada.

## Regra de lançamento

A entrega deve passar primeiro por homologação. O plano do projeto é testar por pelo menos 3 dias conforme `TESTE-3-DIAS.md` e só divulgar depois de corrigir qualquer comportamento observado.
