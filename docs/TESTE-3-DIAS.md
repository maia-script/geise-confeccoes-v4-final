# Plano de homologação — 3 dias antes de divulgar

Use a versão online sem publicidade e com dados/pedidos de teste. Registre qualquer comportamento estranho antes de abrir a loja ao público.

## Dia 1 — cliente e catálogo

- Testar Home em Android, navegador móvel e computador.
- Pesquisar por nome e por `#001`/outro código.
- Navegar categorias e filtros.
- Abrir produtos, trocar cor/tamanho e quantidade.
- Testar produto esgotado e estoque baixo.
- Testar selos em diferentes posições/animações.
- Criar conta por telefone e efetuar login/logout.
- Testar senha errada e recuperação.
- Testar favoritos e carrinho.
- Verificar ausência de erros visuais, textos cortados e botões sem ação.

## Dia 2 — compra e administração

- Criar pedidos de teste com entrega local e retirada.
- Confirmar R$10 de frete abaixo de R$200.
- Confirmar frete grátis em R$200 ou mais.
- Testar CPF inválido e válido.
- Testar endereço/CEP.
- Testar cupom válido e inválido.
- Conferir abertura do WhatsApp oficial.
- Confirmar que nenhum campo pede CVV/senha bancária.
- Conferir pedido no painel.
- Confirmar pagamento de um pedido de teste.
- Conferir baixa de estoque uma única vez.
- Testar cancelamento/reembolso controlado e conferir restauração de estoque.
- Criar/editar produto, código, preço, estoque, peso, dimensões e selos.

## Dia 3 — resistência e lançamento

- Repetir os fluxos em rede móvel/Wi‑Fi.
- Recarregar páginas durante carrinho/checkout.
- Testar navegação PWA/offline nas páginas permitidas.
- Testar 404, robots.txt, sitemap.xml e `/api/health`.
- Conferir logs do servidor e do admin.
- Verificar mobile em tela estreita e desktop.
- Revisar dados empresariais, WhatsApp, endereço e horário.
- Substituir/arquivar todos os produtos demonstrativos antes da abertura.
- Conferir estoque físico x painel.
- Confirmar infraestrutura persistente e backup antes de dados/vendas públicas reais.

## Critério de aprovação

Só divulgar quando não houver erro bloqueador, divergência de preço/estoque, falha de autenticação, link de pagamento incorreto, dado empresarial errado ou problema visual grave. Qualquer falha encontrada deve ser corrigida e o fluxo afetado deve ser testado novamente do início ao fim.
