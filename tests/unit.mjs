import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const dbPath=path.resolve('runtime/unit-test.sqlite');
for(const suffix of ['', '-wal','-shm']) fs.rmSync(dbPath+suffix,{force:true});
process.env.DATABASE_PATH='./runtime/unit-test.sqlite';
process.env.DATABASE_URL='';
process.env.ADMIN_PASSWORD='UnitTest-Admin-2026!';
process.env.ADMIN_EMAIL='unit-admin@geise.test';
process.env.NODE_ENV='test';
process.env.FREE_SHIPPING_THRESHOLD='200';
process.env.STANDARD_SHIPPING_PRICE='10';
process.env.PAYMENT_PROVIDER='manual';
process.env.WHATSAPP_NUMBER='5566996676270';
process.env.AI_PROVIDER='local';

const security=await import('../server/lib/security.mjs');
const {initDb,dbGet,dbRun,closeDb,__dbTest}=await import('../server/db/index.mjs');
await initDb();
const commerce=await import('../server/services/commerce.mjs');
const catalog=await import('../server/services/catalog.mjs');
const payment=await import('../server/services/payment.mjs');
const auth=await import('../server/services/auth.mjs');
const admin=await import('../server/services/admin.mjs');
const ai=await import('../server/services/ai.mjs');
const content=await import('../server/services/content.mjs');
const httpLib=await import('../server/lib/http.mjs');

// Segurança básica e CPF.
const hash=security.hashPassword('Senha-Forte-123');
assert.equal(security.verifyPassword('Senha-Forte-123',hash),true);
assert.equal(security.verifyPassword('senha-errada',hash),false);
assert.equal(security.isValidCpf('529.982.247-25'),true,'CPF válido deve passar no dígito verificador');
assert.equal(security.isValidCpf('111.111.111-11'),false,'CPF repetido deve ser rejeitado');
assert.equal(security.isValidCpf('529.982.247-24'),false,'CPF com dígito errado deve ser rejeitado');
assert.equal(auth.normalizePhone('(66) 99667-6270'),'66996676270');
assert.equal(auth.normalizePhone('+55 66 99667-6270'),'66996676270');
assert.equal(auth.normalizePhone('123'),'');
assert.equal(httpLib.hasPathTraversal('/%2e%2e/%2e%2e/etc/passwd'),true);
assert.equal(httpLib.hasPathTraversal('/%252e%252e/%252e%252e/etc/passwd'),true);
assert.equal(httpLib.hasPathTraversal('/catalogo/vestido-midi'),false);


// Sanitização de HTML persistente: scripts, handlers e URLs perigosas são removidos.
const dirtyHtml='<p onclick="alert(1)">Olá</p><img src=x onerror=alert(1)><a href="jav&#x61;script:alert(1)">ruim</a><a href="https://example.com/a?b=1&amp;c=2">ok</a><script>alert(1)</script>';
const cleanHtml=content.__contentTest.sanitizeHtml(dirtyHtml);
assert.doesNotMatch(cleanHtml,/script|onclick|onerror|javascript:/i);
assert.doesNotMatch(cleanHtml,/<img/i);
assert.match(cleanHtml,/href="https:\/\/example\.com\/a\?b=1&(?:amp;)?c=2"/);
assert.equal(content.__contentTest.safeHref('jav&#x61;script:alert(1)'), '');
assert.equal(content.__contentTest.safeHref('/catalogo?q=vestido'), '/catalogo?q=vestido');

// Recuperação por telefone não revela se a conta existe.
const resetProbe=await auth.requestPasswordReset('66996676270');
assert.equal(resetProbe.channel,'whatsapp');
assert.equal(Object.hasOwn(resetProbe,'customerExists'),false);

// Frete Geise: R$10 local, grátis >= R$200, retirada grátis e fora da zona só retirada.
let options=commerce.shippingOptions({subtotalCents:19999,zip:'78720630'});
assert.equal(options.find(x=>x.id==='local')?.priceCents,1000);
assert.equal(options.find(x=>x.id==='pickup')?.priceCents,0);
options=commerce.shippingOptions({subtotalCents:20000,zip:'78720630'});
assert.equal(options.find(x=>x.id==='local')?.priceCents,0);
options=commerce.shippingOptions({subtotalCents:10000,zip:'01001000'});
assert.equal(options.some(x=>x.id==='local'),false);
assert.equal(options.some(x=>x.id==='pickup'),true);

// Portabilidade SQL.
assert.equal(__dbTest.pgSql('SELECT * FROM products WHERE id=? AND status=?'),'SELECT * FROM products WHERE id=$1 AND status=$2');
const pgSchema=__dbTest.postgresSchema((await import('../server/db/schema.mjs')).schemaSql);
assert.equal(/PRAGMA|COLLATE\s+NOCASE/i.test(pgSchema),false);

// Mercado Pago: assinatura HMAC correta/incorreta.
const mpSecret='webhook-test-secret',mpDataId='ABC123',mpRequestId='request-987',mpTs='1742505638683';
const mpManifest=`id:${mpDataId.toLowerCase()};request-id:${mpRequestId};ts:${mpTs};`;
const mpHash=crypto.createHmac('sha256',mpSecret).update(mpManifest).digest('hex');
assert.equal(payment.verifyMercadoPagoSignature({xSignature:`ts=${mpTs},v1=${mpHash}`,xRequestId:mpRequestId,dataId:mpDataId,secret:mpSecret}),true);
assert.equal(payment.verifyMercadoPagoSignature({xSignature:`ts=${mpTs},v1=${'0'.repeat(64)}`,xRequestId:mpRequestId,dataId:mpDataId,secret:mpSecret}),false);

// Catálogo, código #xxx e badges.
const products=await catalog.listProducts({limit:50});
assert.ok(products.items.length>=9,'seed V4 precisa ter catálogo demonstrativo suficiente para QA');
const exact=(await catalog.listProducts({q:'#001',limit:10})).items;
assert.equal(exact.length,1);
assert.equal(exact[0].code,'001');
assert.equal((await catalog.getProductByCode('#001')).id,exact[0].id);
assert.equal(catalog.__catalogTest.cleanCode(' ##v-147 '),'V-147');
const cleanBadge=catalog.__catalogTest.normalizeBadge({label:'OFERTA',background:'javascript:red',animation:'hack',position:'x'});
assert.equal(cleanBadge.background,'#92278f');
assert.equal(cleanBadge.animation,'none');
assert.equal(cleanBadge.position,'top-left');
const adminBadges=admin.__adminTest.cleanBadges([{label:'FLASH',background:'#ff00aa',foreground:'#fff',animation:'pulse',position:'bottom-right',priority:999}]);
assert.equal(adminBadges[0].priority,100);
assert.equal(adminBadges[0].position,'bottom-right');

// Orçamento e reserva/release são consistentes.
const product=products.items.find(p=>p.variants.some(v=>v.available>0));
const variant=product.variants.find(v=>v.available>0);
const quote=await commerce.quoteCart({items:[{variantId:variant.id,quantity:1}],zip:'78720630',shippingMethod:'local'});
assert.equal(quote.items.length,1);
assert.ok(quote.totalCents>0);
await assert.rejects(()=>commerce.quoteCart({items:[{variantId:variant.id,quantity:11},{variantId:variant.id,quantity:10}],zip:'78720630',shippingMethod:'local'}),/limite é de 20 unidades/i);
const before=(await dbGet('SELECT reserved FROM product_variants WHERE id=?',[variant.id])).reserved;
await commerce.reserveInventory('unit-order',[{variantId:variant.id,quantity:1,productName:product.name}],null);
assert.equal((await dbGet('SELECT reserved FROM product_variants WHERE id=?',[variant.id])).reserved,before+1);
await dbRun('UPDATE product_variants SET reserved=? WHERE id=?',[before,variant.id]);
assert.equal((await dbGet('SELECT reserved FROM product_variants WHERE id=?',[variant.id])).reserved,before);

// Pagamento manual gera somente URL oficial do WhatsApp e não coleta cartão.
const manual=await payment.createPayment({order:{id:'ord_unit',orderNumber:'GEI-2026-TESTE',totalCents:12345},items:[],paymentMethod:'pix'});
assert.equal(manual.provider,'manual');
assert.equal(manual.requiresManualConfirmation,true);
assert.match(manual.checkoutUrl,/^https:\/\/wa\.me\/5566996676270\?text=/);
assert.equal(/cvv|senha banc/i.test(decodeURIComponent(manual.checkoutUrl)),false);

// IA local respeita o código e não precisa de API.
const aiResult=await ai.assistant('Quero o #001');
assert.equal(aiResult.mode,'local');
assert.equal(aiResult.products[0]?.code,'001');
assert.match(ai.__aiTest.compactSystemPrompt(),/Nunca invente produto/i);

// Migração pode rodar novamente sem destruir dados.
const {migrateDatabase}=await import('../server/db/migrations.mjs');
await migrateDatabase();
assert.ok(await dbGet('SELECT id FROM products WHERE product_code=?',['001']));

await closeDb();
console.log('✓ unit V4: segurança/CPF, telefone, frete, SQL, webhook, #código, badges, estoque, pagamento manual e IA local');
