# O que ainda precisa ser real antes de abrir a loja

A V4 já contém os dados básicos da Geise Confecções, regras iniciais de frete, WhatsApp, categorias e estrutura comercial. O que permanece demonstrativo é proposital para permitir testes sem publicar produtos ou credenciais falsas como se fossem reais.

## 1. Catálogo

No `/admin/produtos`, substitua os produtos de QA. Para cada produto real, confira:

- código comercial único (`#147`, `#V147` etc.);
- nome, categoria e subcategoria;
- descrição e material/composição;
- SKU por cor/tamanho;
- preço normal e promocional;
- estoque físico;
- limite de estoque baixo;
- peso e dimensões;
- foto/URL segura;
- status, destaque, novidade e visibilidade quando esgotado;
- selos customizados.

## 2. Imagens

As imagens em `public/assets/images/demo/` são apenas para homologação. Use fotos próprias ou devidamente licenciadas. Para uma operação maior, prefira armazenamento/CDN externo e salve URLs HTTPS no catálogo.

A logo fornecida pela loja está em `public/assets/brand/logo-original.jpg`.

## 3. Administração

No primeiro deploy online, o servidor exige:

```env
ADMIN_EMAIL=EMAIL_VALIDO
ADMIN_PASSWORD=SENHA_FORTE_COM_12_OU_MAIS_CARACTERES
```

Não use as senhas que já apareceram em documentos anteriores. Não compartilhe a conta principal.

## 4. Pagamento

A configuração inicial é:

```env
PAYMENT_PROVIDER=manual
```

O cliente cria o pedido e abre o WhatsApp da Geise para concluir PIX/cartão/combinação. O administrador confirma manualmente o recebimento no painel. Nenhum dado sensível de cartão deve ser solicitado no chat.

Quando houver gateway online, configure as credenciais exclusivamente no servidor e refaça os testes do fluxo de pagamento.

## 5. IA

Inicialmente:

```env
AI_PROVIDER=local
```

Isso evita custo de API. Para ativar OpenAI depois, a chave e o nome de um modelo válido devem ser configurados na hospedagem na época da integração; nunca no frontend.

## 6. Frete

Regra inicial já configurada:

- entrega local em Rondonópolis: R$10;
- entrega local grátis a partir de R$200;
- retirada na loja: grátis;
- preparação informada: até 2 dias corridos após confirmação.

A regra futura por bairro/CEP/distância pode substituir o cálculo fixo sem alterar o restante do checkout.

## 7. Dados empresariais

Já configurados no seed, mas devem ser conferidos antes da abertura:

- Geise Confecções;
- Geisibel Lopes de Souza;
- CNPJ 19.618.264/0001-31;
- Rua Presidente Castelo Branco, 493 — Vila Operária — Rondonópolis/MT — CEP 78720-630;
- `(66) 99667-6270`;
- segunda a sexta 08:00–18:00; sábado e feriados 08:00–14:00;
- Instagram `geise_lojas`.

Se algum desses dados mudar, atualize no painel antes de divulgar.

## 8. Políticas

A regra comercial informada foi: roupas íntimas não são trocadas; demais produtos, até 7 dias com etiqueta. Antes da abertura pública, a responsável pela loja deve revisar os textos de trocas, devoluções, defeitos, privacidade, cookies/LGPD e demais obrigações aplicáveis.

## 9. Domínio

O domínio desejado é `www.lojageise.com`. Ele só deve ser configurado como definitivo depois de registrado e controlado pela loja.

## 10. Infraestrutura

O Blueprint gratuito serve para homologação. Antes de uma operação pública com dados/pedidos reais, defina PostgreSQL persistente, backup, restauração e monitoramento adequados.

## 11. Teste obrigatório

Faça `docs/TESTE-3-DIAS.md` e `docs/GO-LIVE-CHECKLIST.md`. Qualquer correção feita durante os testes deve ser seguida de nova execução do fluxo afetado do início ao fim.
