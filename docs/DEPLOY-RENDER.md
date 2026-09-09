# Deploy da Geise Confecções V4 no Render — passo a passo

Este guia publica a V4 como **ambiente de homologação** usando Node.js + PostgreSQL. A loja foi configurada para pagamento manual via WhatsApp e IA local, então nenhuma conta de gateway ou IA paga é necessária para o primeiro teste online.

> O `render.yaml` usa planos gratuitos para facilitar homologação. Não trate banco gratuito/temporário como infraestrutura definitiva para uma loja pública com pedidos e dados reais. Antes do lançamento comercial, escolha persistência e backup compatíveis com a operação.

## 1. Preparar o GitHub

Use o repositório já criado para o projeto ou outro repositório sob seu controle.

1. Extraia o ZIP final.
2. Abra a pasta extraída.
3. Envie **os arquivos de dentro dela** para a raiz do repositório.
4. Confirme que `package.json`, `server.mjs` e `render.yaml` estão na raiz.
5. Não envie `.env`, `runtime/*.sqlite`, `*.db`, senhas ou tokens.

Estrutura esperada:

```text
package.json
server.mjs
render.yaml
public/
server/
tests/
docs/
.github/
```

## 2. Criar o Blueprint no Render

1. Entre na conta Render.
2. Crie um novo **Blueprint**.
3. Conecte o GitHub ao Render.
4. Escolha o repositório da Geise.
5. O Render lerá `render.yaml`.
6. Revise os dois recursos: Web Service e PostgreSQL.
7. Quando solicitado, informe os valores secretos.

Obrigatórios em produção/homologação online:

```text
ADMIN_EMAIL=um-email-administrativo-valido
ADMIN_PASSWORD=uma-senha-forte-unica-com-12-ou-mais-caracteres
```

Não reutilize senhas que já tenham aparecido em documentos, prints ou conversas.

As configurações iniciais já ficam no Blueprint:

```text
NODE_ENV=production
HOST=0.0.0.0
PAYMENT_PROVIDER=manual
AI_PROVIDER=local
WHATSAPP_NUMBER=5566996676270
FREE_SHIPPING_THRESHOLD=200
STANDARD_SHIPPING_PRICE=10
```

O `DATABASE_URL` é conectado ao PostgreSQL pelo próprio Blueprint.

## 3. Primeiro deploy

Aguarde build e start terminarem. O comando de build é `npm install` e o de start é `npm start`.

Depois abra:

```text
https://SEU-SERVICO.onrender.com/api/health
```

O retorno esperado deve incluir:

```json
{
  "ok": true,
  "version": "4.0.0",
  "database": "postgres"
}
```

Também confira no mesmo retorno que o provedor de pagamento esteja como `manual`.

Se o deploy falhar, verifique os logs do Render. Os quatro primeiros pontos a conferir são: versão do Node, `npm install`, `ADMIN_EMAIL`/`ADMIN_PASSWORD` e conexão PostgreSQL.

## 4. Teste funcional mínimo online

Faça pelo celular:

1. Abra a Home.
2. Entre no catálogo.
3. Pesquise `#001`.
4. Adicione um produto ao carrinho.
5. Crie uma conta por telefone.
6. Informe CPF de teste válido somente em ambiente controlado e um endereço de teste.
7. Escolha entrega local ou retirada.
8. Crie o pedido.
9. Confira se o botão de pagamento abre o WhatsApp oficial.
10. Entre em `/admin`, localize o pedido e teste o fluxo de confirmação apenas com um pedido de QA.

Depois execute `docs/TESTE-3-DIAS.md` antes de divulgar.

## 5. Catálogo real

Antes de clientes reais:

- arquive/substitua produtos demonstrativos;
- cadastre o código comercial (`#147`, `#V147` etc.);
- cadastre SKU por variante;
- informe preço normal/promocional;
- informe estoque físico real;
- informe peso e dimensões;
- use fotos próprias/licenciadas;
- confira selos e promoções.

## 6. Domínio

O domínio desejado do projeto é `lojageise.com`. **Primeiro confirme que o domínio foi registrado e está sob controle da loja.**

Quando estiver disponível para uso:

1. Abra o Web Service no Render.
2. Vá a configurações de domínio personalizado.
3. Adicione o domínio raiz e/ou `www`.
4. No registrador do domínio, crie exatamente os registros DNS indicados pelo Render.
5. Aguarde validação e HTTPS.
6. Defina no Render:

```env
PUBLIC_BASE_URL=https://www.lojageise.com
```

7. Teste novamente `/api/health`, Home, login, checkout, sitemap e links de compartilhamento.

Enquanto o domínio não estiver pronto, a URL `onrender.com` serve para homologação.

## 7. Pagamento real automatizado — fase posterior

A V4 pode vender inicialmente com confirmação manual pelo WhatsApp, especialmente enquanto a operação organiza o gateway online. Isso não significa coletar cartão pelo chat: dados sensíveis de cartão nunca devem passar pelo site/WhatsApp da loja.

Se posteriormente usar Mercado Pago:

```env
PAYMENT_PROVIDER=mercadopago
MERCADOPAGO_ACCESS_TOKEN=SEGREDO
MERCADOPAGO_WEBHOOK_SECRET=SEGREDO
```

Configure o webhook HTTPS do provedor e realize testes controlados de aprovado, pendente, recusado, duplicado e reembolso antes de ativar para todos.

## 8. IA OpenAI — fase posterior

A V4 começa com:

```env
AI_PROVIDER=local
```

Para uma integração remota futura, configure a chave apenas na hospedagem. Não coloque chave no código, frontend ou GitHub. O modelo deve ser escolhido no momento da integração conforme preço/capacidade disponíveis na API naquela data.

## 9. Antes de abrir oficialmente

Use um PostgreSQL persistente com estratégia de backup, teste restauração, confirme HTTPS/domínio, troque dados demonstrativos e conclua `docs/GO-LIVE-CHECKLIST.md`.
