import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const walk=dir=>fs.readdirSync(path.join(root,dir),{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
const sourceFiles=['README.md','COMECE-AQUI.txt','.env.example','render.yaml',...walk('server'),...walk('public'),...walk('docs'),...walk('tests')].filter(f=>fs.statSync(path.join(root,f)).isFile());
const all=sourceFiles.filter(f=>f!=='tests/deep-audit.mjs').map(read).join('\n');
const publicCode=walk('public').filter(f=>/\.(?:js|html|css|webmanifest)$/.test(f)).map(read).join('\n');

// Identidade/versão/configuração comercial.
assert.equal(JSON.parse(read('package.json')).version,'4.0.0');
assert.match(read('render.yaml'),/PAYMENT_PROVIDER\s*\n\s*value: manual/);
assert.match(read('render.yaml'),/AI_PROVIDER\s*\n\s*value: local/);
assert.match(read('render.yaml'),/WHATSAPP_NUMBER\s*\n\s*value: "5566996676270"/);
assert.match(read('.env.example'),/FREE_SHIPPING_THRESHOLD=200/);
assert.match(read('.env.example'),/STANDARD_SHIPPING_PRICE=10/);
assert.doesNotMatch(all,/66\s*999667-6270|31102010|248637|maiaotavio262@gmail\.com/i,'dados incorretos/credenciais antigas não podem permanecer');

// Segredos: nomes de variáveis são permitidos em documentação/config, valores reais não.
assert.equal(fs.existsSync(path.join(root,'.env')),false,'.env real não deve fazer parte do projeto');
assert.doesNotMatch(publicCode,/(?:sk-[A-Za-z0-9_-]{20,}|APP_USR-[A-Za-z0-9_-]{20,}|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY)/,'frontend contém padrão de segredo');
assert.doesNotMatch(publicCode,/process\.env|MERCADOPAGO_ACCESS_TOKEN|MERCADOPAGO_WEBHOOK_SECRET|AI_API_KEY|ADMIN_PASSWORD/,'frontend não pode conhecer segredos do servidor');

// Segurança web e dados persistentes.
const http=read('server/lib/http.mjs');
assert.match(http,/Content-Security-Policy/);assert.match(http,/Strict-Transport-Security/);assert.match(http,/path\.relative\(config\.publicDir, file\)/);assert.match(http,/hasPathTraversal/);
const content=read('server/services/content.mjs');assert.match(content,/sanitizeHtml/);assert.match(content,/safeHref/);
const admin=read('server/services/admin.mjs');assert.match(admin,/sanitizePublicUrl/);assert.match(admin,/length_cm=\?/);assert.match(admin,/width_cm=\?/);assert.match(admin,/height_cm=\?/);
const app=read('public/assets/js/app.js');assert.match(app,/esc\(String\(error\.message/);

// Carrinho/estoque/pedidos: atualizações condicionais e idempotência.
const commerce=read('server/services/commerce.mjs');
assert.match(commerce,/quantity>20/);assert.match(commerce,/\(stock-reserved\)>=\?/);assert.match(commerce,/reserveCouponRedemption/);assert.match(commerce,/releaseCouponRedemption/);
const orders=read('server/services/orders.mjs');
assert.match(orders,/AND status='PENDING_PAYMENT'/);assert.match(orders,/payment_status='processing'/);assert.match(orders,/restoreCommittedInventory/);assert.match(orders,/releaseCouponRedemption/);

// PWA: API privada é sempre network-only/no-store no navegador.
const sw=read('public/sw.js');assert.match(sw,/Nunca persista respostas da API/);assert.doesNotMatch(sw,/networkFirst\(req,RUNTIME/);

// Administração V4: busca/código, selos e logística de variante editável sem perda silenciosa.
const adminJs=read('public/assets/js/pages/admin.js');
for(const field of ['data-v="low"','data-v="weight"','data-v="length"','data-v="width"','data-v="height"'])assert.ok(adminJs.includes(field),`campo administrativo ausente: ${field}`);
assert.match(adminJs,/#\$\{esc\(p\.code/);assert.match(adminJs,/Selos personalizados/);

// Deploy/docs não podem instruir a V3 nem domínio antigo.
const docs=['README.md','COMECE-AQUI.txt',...walk('docs').filter(f=>f.endsWith('.md'))].map(read).join('\n');
assert.doesNotMatch(docs,/V3\.1|versão `3\.1\.0`|geiseconfeccoes\.com\.br/i);
assert.match(docs,/TESTE-3-DIAS/);assert.match(docs,/homologa/i);
for(const f of ['docs/DEPLOY-RENDER.md','docs/AUDITORIA-FINAL-V4.md','docs/TESTE-3-DIAS.md','docs/GO-LIVE-CHECKLIST.md']) assert.ok(fs.existsSync(path.join(root,f)),`documentação referenciada ausente: ${f}`);

// Arquivos essenciais de marca/PWA.
for(const f of ['public/assets/brand/logo-original.jpg','public/assets/icons/icon-192.png','public/assets/icons/icon-512.png','public/assets/icons/maskable-512.png','public/manifest.webmanifest','public/sw.js','public/offline.html'])assert.ok(fs.existsSync(path.join(root,f)),`arquivo essencial ausente: ${f}`);

console.log(`✓ deep audit V4: identidade, segredos, XSS/URLs, estoque, cupons, pedidos, admin, PWA e deploy validados (${sourceFiles.length} arquivos inspecionados)`);
