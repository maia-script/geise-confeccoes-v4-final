# Go-live — antes de divulgar a Geise Confecções

Esta lista é para a abertura pública, depois da homologação de 3 dias.

## Infraestrutura e segurança

- [ ] HTTPS ativo.
- [ ] Domínio definitivo sob controle da loja.
- [ ] `PUBLIC_BASE_URL` correto.
- [ ] PostgreSQL persistente adequado à operação.
- [ ] Backup automático e restauração testada.
- [ ] `.env`, banco local, senhas e chaves fora do GitHub.
- [ ] `NODE_ENV=production`.
- [ ] `/api/health` retorna `ok: true`, versão `4.0.0` e banco `postgres`.
- [ ] `npm run verify` passou no código publicado.
- [ ] Senha administrativa forte, nova e exclusiva.
- [ ] Cookies HttpOnly/Secure, CSRF, CSP, HSTS e rate limiting conferidos.
- [ ] Logs administrativos acessíveis somente ao administrador principal.

## Catálogo e estoque

- [ ] Produtos demonstrativos arquivados/substituídos.
- [ ] Códigos `#xxx` conferidos e únicos.
- [ ] SKUs únicos.
- [ ] Preços e promoções reais.
- [ ] Estoque físico contado e igual ao painel.
- [ ] Peso/dimensões cadastrados quando necessários.
- [ ] Fotos próprias/licenciadas.
- [ ] Selos não escondem informações importantes.
- [ ] Produto esgotado/estoque baixo testados.

## Compra

- [ ] Cadastro por telefone testado.
- [ ] CPF inválido bloqueado e CPF válido aceito.
- [ ] Endereço/CEP testados.
- [ ] Carrinho mantém quantidades válidas.
- [ ] `GEISE10` ou cupons ativos testados conforme a regra comercial.
- [ ] Entrega local custa R$10 abaixo de R$200.
- [ ] Frete local fica grátis a partir de R$200.
- [ ] Retirada na loja é grátis.
- [ ] Reserva de estoque expira/libera corretamente.

## Pagamento inicial manual

- [ ] `PAYMENT_PROVIDER=manual` enquanto não houver gateway automatizado.
- [ ] WhatsApp oficial é `(66) 99667-6270`.
- [ ] Site não solicita CVV, senha bancária ou código de autenticação.
- [ ] Pedido aparece no painel como aguardando pagamento.
- [ ] Somente o administrador principal confirma pagamento recebido.
- [ ] Confirmação repetida não baixa estoque duas vezes.
- [ ] Cancelamento pendente libera estoque e uso reservado de cupom.
- [ ] Reembolso de pedido pago restaura estoque exatamente uma vez.

## Atendimento, conteúdo e políticas

- [ ] Endereço, horário, telefone, CNPJ e redes sociais conferidos.
- [ ] Atendimento humano pelo WhatsApp testado.
- [ ] História/textos institucionais revisados pela responsável pela loja.
- [ ] Política de trocas/devoluções revisada.
- [ ] Política de privacidade/LGPD revisada antes de tráfego público.
- [ ] Nenhuma avaliação fictícia apresentada como real.

## PWA, SEO e experiência

- [ ] Home e catálogo testados em celular e desktop.
- [ ] Busca por nome e `#código` testada.
- [ ] PWA instala e página offline funciona.
- [ ] API não aparece com dados privados em cache offline.
- [ ] `/robots.txt` e `/sitemap.xml` usam o domínio correto.
- [ ] Página 404 e rotas principais funcionam.
- [ ] Não existem erros graves no console/logs durante os fluxos principais.

## Gate final

- [ ] `docs/TESTE-3-DIAS.md` concluído.
- [ ] Uma compra completa de QA foi refeita do início ao fim depois da última correção.
- [ ] A responsável pela loja aprovou catálogo, preços, políticas e atendimento.

Só depois disso divulgue a URL publicamente.
