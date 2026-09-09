import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';

const port=18988;
const dbPath=path.resolve('runtime/smoke-test.sqlite');
for(const suffix of ['', '-wal','-shm']) fs.rmSync(dbPath+suffix,{force:true});
const child=spawn(process.execPath,['server.mjs'],{cwd:process.cwd(),env:{...process.env,NODE_ENV:'development',PORT:String(port),HOST:'127.0.0.1',PUBLIC_BASE_URL:`http://127.0.0.1:${port}`,DATABASE_PATH:'./runtime/smoke-test.sqlite',DATABASE_URL:'',ADMIN_EMAIL:'admin-test@geise.local',ADMIN_PASSWORD:'Admin-Test-2026!',PAYMENT_PROVIDER:'manual',AI_PROVIDER:'local',WHATSAPP_NUMBER:'5566996676270',FREE_SHIPPING_THRESHOLD:'200',STANDARD_SHIPPING_PRICE:'10'},stdio:['ignore','pipe','pipe']});
let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
const base=`http://127.0.0.1:${port}`;

async function wait(){for(let i=0;i<80;i++){try{const r=await fetch(`${base}/api/health`);if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw new Error(`Servidor não iniciou. Logs:\n${logs}`);}
async function raw(pathname,{method='GET',body,session,headers={}}={}){
  const h={'Accept':'application/json',...headers};
  if(body!==undefined)h['Content-Type']='application/json';
  if(session?.cookie)h.Cookie=session.cookie;
  if(session?.csrf&&!['GET','HEAD','OPTIONS'].includes(method))h['X-CSRF-Token']=session.csrf;
  const r=await fetch(base+pathname,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body)});
  const text=await r.text();let data={};try{data=text?JSON.parse(text):{};}catch{data={text};}
  const cookie=r.headers.get('set-cookie')?.split(';')[0]||session?.cookie||'';
  return {r,data,cookie,status:r.status,text};
}
async function request(pathname,options={}){const out=await raw(pathname,options);if(!out.r.ok)throw new Error(`${options.method||'GET'} ${pathname} -> ${out.status}: ${JSON.stringify(out.data)}`);return out;}
async function expectStatus(status,pathname,options={}){const out=await raw(pathname,options);assert.equal(out.status,status,`${options.method||'GET'} ${pathname}: ${JSON.stringify(out.data)}`);return out;}

try{
  await wait();
  const health=await request('/api/health');assert.equal(health.data.ok,true);assert.equal(health.data.version,'4.0.0');assert.equal(health.data.database,'sqlite');assert.equal(health.data.paymentProvider,'manual');
  const cfg=(await request('/api/config')).data;assert.equal(cfg.paymentProvider,'manual');assert.equal(cfg.store.phone,'(66) 99667-6270');assert.equal(cfg.commerce.freeShippingThresholdCents,20000);

  const shell=await fetch(base+'/catalogo');assert.equal(shell.status,200);const shellText=await shell.text();assert.match(shellText,/Geise Confecções/i);assert.match(shellText,/Busque por nome ou #código/i);
  const robots=await fetch(base+'/robots.txt');assert.equal(robots.status,200);assert.match(await robots.text(),new RegExp(`Sitemap: ${base.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}/sitemap\\.xml`));
  const sitemap=await fetch(base+'/sitemap.xml');assert.equal(sitemap.status,200);const sitemapText=await sitemap.text();assert.match(sitemapText,/<urlset/);assert.match(sitemapText,new RegExp(base.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));

  const codeSearch=(await request('/api/catalog/products?q=%23001&limit=10')).data;assert.equal(codeSearch.items.length,1);assert.equal(codeSearch.items[0].code,'001');
  const byCode=(await request('/api/catalog/code/%23001')).data.product;assert.equal(byCode.code,'001');
  const variant=byCode.variants.find(v=>v.available>0);assert.ok(variant);
  const initialStock=variant.stock,initialReserved=variant.reserved;

  // Visitante consegue cotar carrinho sem autenticação.
  const guestQuote=(await request('/api/quote',{method:'POST',body:{items:[{variantId:variant.id,quantity:1}],zip:'78720630',shippingMethod:'local'}})).data;
  assert.equal(guestQuote.shippingCents,guestQuote.subtotalCents>=20000?0:1000);
  await expectStatus(401,'/api/checkout/create',{method:'POST',body:{}});

  // Conta por telefone, sem exigir e-mail.
  const registration=await request('/api/auth/register',{method:'POST',body:{name:'Cliente Teste',phone:'66991234567',password:'Cliente-2026!',marketingOptIn:true}});
  const customer={cookie:registration.cookie,csrf:registration.data.csrfToken};
  assert.equal(registration.data.user.phone,'66991234567');assert.equal(registration.data.user.email,'');
  await expectStatus(409,'/api/auth/register',{method:'POST',body:{name:'Duplicado',phone:'66991234567',password:'Cliente-2026!'}});

  const address=(await request('/api/auth/addresses',{method:'POST',session:customer,body:{label:'Casa',recipient:'Cliente Teste',zip:'78720630',street:'Rua Teste',number:'100',district:'Centro',city:'Rondonópolis',state:'MT',isDefault:true}})).data;
  assert.equal(address.items.length,1);
  await request('/api/cart',{method:'PUT',session:customer,body:{items:[{variantId:variant.id,quantity:1}]}});
  assert.equal((await request('/api/cart',{session:customer})).data.items.length,1);

  const couponQuote=(await request('/api/quote',{method:'POST',session:customer,body:{items:[{variantId:variant.id,quantity:1}],couponCode:'GEISE10',zip:'78720630',shippingMethod:'local'}})).data;
  if(couponQuote.subtotalCents>=5000)assert.ok(couponQuote.discountCents>0);

  // CPF inválido deve bloquear a compra.
  await expectStatus(400,'/api/checkout/create',{method:'POST',session:customer,body:{name:'Cliente Teste',phone:'66991234567',cpf:'11111111111',items:[{variantId:variant.id,quantity:1}],shippingMethod:'local',paymentMethod:'pix',address:{zip:'78720630',street:'Rua Teste',number:'100',district:'Centro',city:'Rondonópolis',state:'MT'}}});

  // Compra completa com pagamento manual/WhatsApp.
  const orderResult=await request('/api/checkout/create',{method:'POST',session:customer,body:{name:'Cliente Teste',phone:'66991234567',cpf:'52998224725',items:[{variantId:variant.id,quantity:1}],couponCode:'GEISE10',shippingMethod:'local',paymentMethod:'pix',address:{zip:'78720630',street:'Rua Teste',number:'100',district:'Centro',city:'Rondonópolis',state:'MT'}}});
  assert.equal(orderResult.data.order.status,'PENDING_PAYMENT');assert.equal(orderResult.data.order.paymentStatus,'pending');assert.equal(orderResult.data.payment.provider,'manual');assert.match(orderResult.data.payment.checkoutUrl,/^https:\/\/wa\.me\/5566996676270\?text=/);
  const orderId=orderResult.data.order.id,orderNumber=orderResult.data.order.orderNumber;
  assert.match(orderNumber,/^GEI-\d{4}-[A-Z0-9]{7}$/);
  const reservedCatalog=(await request('/api/catalog/code/001')).data.product.variants.find(v=>v.id===variant.id);assert.equal(reservedCatalog.reserved,initialReserved+1);

  const mine=(await request('/api/orders',{session:customer})).data.items;assert.ok(mine.some(o=>o.orderNumber===orderNumber));
  await expectStatus(403,`/api/orders/${orderId}/cancel`,{method:'POST',session:{cookie:customer.cookie,csrf:'wrong'}});

  // Admin confirma recebimento: reserva vira venda real.
  const adminLogin=await request('/api/auth/login',{method:'POST',body:{identifier:'admin-test@geise.local',password:'Admin-Test-2026!'}});
  const admin={cookie:adminLogin.cookie,csrf:adminLogin.data.csrfToken};
  const confirmed=(await request(`/api/admin/orders/${orderId}/payment/confirm`,{method:'POST',session:admin,body:{}})).data.order;
  assert.equal(confirmed.status,'PAID');assert.equal(confirmed.paymentStatus,'paid');
  const paidVariant=(await request('/api/catalog/code/001')).data.product.variants.find(v=>v.id===variant.id);assert.equal(paidVariant.stock,initialStock-1);assert.equal(paidVariant.reserved,initialReserved);
  // Confirmação repetida é idempotente: não pode baixar o estoque duas vezes.
  const confirmedAgain=(await request(`/api/admin/orders/${orderId}/payment/confirm`,{method:'POST',session:admin,body:{}})).data.order;assert.equal(confirmedAgain.paymentStatus,'paid');
  const paidVariantAgain=(await request('/api/catalog/code/001')).data.product.variants.find(v=>v.id===variant.id);assert.equal(paidVariantAgain.stock,initialStock-1);assert.equal(paidVariantAgain.reserved,initialReserved);

  // Reembolso restaura o estoque exatamente uma vez.
  await request(`/api/admin/orders/${orderId}/status`,{method:'POST',session:admin,body:{status:'PREPARING'}});
  const refunded=(await request(`/api/admin/orders/${orderId}/status`,{method:'POST',session:admin,body:{status:'REFUNDED',notes:'Teste de reembolso'}})).data.order;
  assert.equal(refunded.status,'REFUNDED');assert.equal(refunded.paymentStatus,'refunded');
  const restored=(await request('/api/catalog/code/001')).data.product.variants.find(v=>v.id===variant.id);assert.equal(restored.stock,initialStock);assert.equal(restored.reserved,initialReserved);
  await expectStatus(409,`/api/admin/orders/${orderId}/status`,{method:'POST',session:admin,body:{status:'REFUNDED'}});

  // CRUD comercial por #código e badge.
  const adminProducts=(await request('/api/admin/products',{session:admin})).data;
  const categoryId=adminProducts.categories[0].id;
  const newProductBody={code:'T900',name:'Produto Teste Código',slug:'produto-teste-codigo',categoryId,subcategory:'QA',description:'Produto criado pelo smoke test.',material:'Teste',brand:'Geise',featured:false,isNew:true,status:'active',showWhenOutOfStock:true,tags:['qa'],badges:[{label:'TESTE',background:'#92278f',foreground:'#ffffff',animation:'pulse',position:'bottom-right',priority:12}],variants:[{sku:'QA-T900-U',color:'Único',size:'Único',priceCents:5990,salePriceCents:4990,stock:5,lowStockThreshold:2,weightGrams:480,lengthCm:31.5,widthCm:22.5,heightCm:8.5,imageUrl:'/assets/images/demo/placeholder.svg',active:true}]};
  const created=(await request('/api/admin/products',{method:'POST',session:admin,body:newProductBody})).data.product;assert.equal(created.code,'T900');assert.equal(created.badges[0].label,'TESTE');
  assert.equal(created.variants[0].lowStockThreshold,2);assert.equal(created.variants[0].weightGrams,480);assert.equal(created.variants[0].dimensions.lengthCm,31.5);assert.equal(created.variants[0].dimensions.widthCm,22.5);assert.equal(created.variants[0].dimensions.heightCm,8.5);
  // Editar sem reenviar logística não pode apagar peso, dimensões nem limiar já cadastrados.
  const preserveBody={...newProductBody,id:created.id,name:'Produto Teste Código Editado',variants:[{id:created.variants[0].id,sku:'QA-T900-U',color:'Único',size:'Único',priceCents:5990,salePriceCents:4990,stock:5,imageUrl:'/assets/images/demo/placeholder.svg',active:true}]};
  const preserved=(await request(`/api/admin/products/${created.id}`,{method:'PUT',session:admin,body:preserveBody})).data.product;
  assert.equal(preserved.variants[0].lowStockThreshold,2);assert.equal(preserved.variants[0].weightGrams,480);assert.equal(preserved.variants[0].dimensions.lengthCm,31.5);assert.equal(preserved.variants[0].dimensions.widthCm,22.5);assert.equal(preserved.variants[0].dimensions.heightCm,8.5);
  const searched=(await request('/api/catalog/products?q=%23T900')).data.items;assert.equal(searched.length,1);assert.equal(searched[0].slug,'produto-teste-codigo');
  await expectStatus(409,'/api/admin/products',{method:'POST',session:admin,body:{...newProductBody,slug:'produto-duplicado',variants:[{...newProductBody.variants[0],sku:'QA-T900-2'}]}});

  const dashboard=(await request('/api/admin/dashboard',{session:admin})).data;assert.ok(dashboard.counts.products>=10);
  const inventory=(await request('/api/admin/inventory',{session:admin})).data;assert.ok(inventory.items.length>0);
  await request('/api/admin/jobs/run',{method:'POST',session:admin,body:{}});

  // PWA: API não pode ser persistida em cache pelo service worker.
  const sw=await (await fetch(base+'/sw.js')).text();assert.match(sw,/Nunca persista respostas da API/);assert.doesNotMatch(sw,/networkFirst\(req,RUNTIME/);
  console.log('✓ smoke V4: catálogo/#código, guest quote, conta, CPF, checkout, WhatsApp, estoque, pagamento, reembolso, admin e PWA');
} finally {
  child.kill('SIGTERM');
  await new Promise(r=>setTimeout(r,250));
  if(fs.existsSync(dbPath)){
    const db=new DatabaseSync(dbPath,{readOnly:true});
    const integrity=db.prepare('PRAGMA integrity_check').get();assert.equal(integrity.integrity_check,'ok');
    const fk=db.prepare('PRAGMA foreign_key_check').all();assert.equal(fk.length,0,'foreign_key_check deve ficar vazio');
    db.close();
  }
}
