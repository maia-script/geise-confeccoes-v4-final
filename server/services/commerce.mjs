import { dbAll, dbGet, dbRun, transaction } from '../db/index.mjs';
import { config } from '../config.mjs';
import { getVariant } from './catalog.mjs';
import { makeId, nowIso } from '../lib/security.mjs';

export function effectivePriceCents(v){
  return v.salePriceCents != null && v.salePriceCents < v.priceCents ? v.salePriceCents : v.priceCents;
}

async function loadCoupon(code, userId, subtotalCents){
  if(!code) return null;
  const now = nowIso();
  const normalized=String(code).trim().toUpperCase();
  const c = await dbGet(`SELECT * FROM coupons WHERE UPPER(code)=? AND active=1`,[normalized]);
  if(!c) throw Object.assign(new Error('Cupom inválido.'),{status:400});
  if(c.starts_at && c.starts_at > now) throw Object.assign(new Error('Este cupom ainda não está disponível.'),{status:400});
  if(c.expires_at && c.expires_at < now) throw Object.assign(new Error('Este cupom expirou.'),{status:400});
  if(subtotalCents < c.min_subtotal_cents) throw Object.assign(new Error(`Este cupom exige subtotal mínimo de R$ ${(c.min_subtotal_cents/100).toFixed(2).replace('.',',')}.`),{status:400});
  const totalUses = Number((await dbGet('SELECT COUNT(*) n FROM coupon_redemptions WHERE coupon_id=?',[c.id]))?.n||0);
  if(c.max_uses != null && totalUses >= c.max_uses) throw Object.assign(new Error('Este cupom atingiu o limite de usos.'),{status:400});
  if(userId){
    const uses = Number((await dbGet('SELECT COUNT(*) n FROM coupon_redemptions WHERE coupon_id=? AND user_id=?',[c.id,userId]))?.n||0);
    if(uses >= c.max_uses_per_customer) throw Object.assign(new Error('Você já utilizou este cupom o máximo de vezes permitido.'),{status:400});
    if(c.first_purchase_only){
      const prior = Number((await dbGet("SELECT COUNT(*) n FROM orders WHERE user_id=? AND payment_status='paid'",[userId]))?.n||0);
      if(prior > 0) throw Object.assign(new Error('Este cupom é válido somente para a primeira compra.'),{status:400});
    }
  }
  return c;
}


export async function reserveCouponRedemption({couponCode,userId,subtotalCents,orderId}){
  if(!couponCode)return null;
  const normalized=String(couponCode).trim().toUpperCase();
  const candidate=await dbGet('SELECT id FROM coupons WHERE UPPER(code)=? AND active=1',[normalized]);
  if(!candidate)throw Object.assign(new Error('Cupom inválido.'),{status:400});
  // No PostgreSQL, esta atualização sem alteração adquire lock da linha até o fim da transação.
  // No SQLite, createOrder já roda dentro de BEGIN IMMEDIATE.
  await dbRun('UPDATE coupons SET updated_at=updated_at WHERE id=?',[candidate.id]);
  const coupon=await loadCoupon(normalized,userId,subtotalCents);
  const already=await dbGet('SELECT id FROM coupon_redemptions WHERE order_id=?',[orderId]);
  if(!already)await dbRun('INSERT INTO coupon_redemptions (id,coupon_id,user_id,order_id,created_at) VALUES (?,?,?,?,?)',[makeId('red_'),coupon.id,userId||null,orderId,nowIso()]);
  return coupon;
}

export async function releaseCouponRedemption(orderId){
  if(!orderId)return 0;
  const result=await dbRun('DELETE FROM coupon_redemptions WHERE order_id=?',[orderId]);
  return Number(result.changes||0);
}

export function shippingOptions({subtotalCents, zip=''}){
  const free = subtotalCents >= Math.round(config.freeShippingThreshold*100);
  const localPrice = free ? 0 : Math.round(config.standardShippingPrice*100);
  const cleanZip = String(zip).replace(/\D/g,'');
  const isRondonopolis = !cleanZip || /^787/.test(cleanZip);
  const options = [];
  if (isRondonopolis) options.push({id:'local',label:'Entrega local por motoboy',priceCents:localPrice,eta:'Até 2 dias corridos após confirmação do pagamento',carrier:'Entrega local Geise',available:true});
  options.push({id:'pickup',label:'Retirada na loja',priceCents:0,eta:'Até 2 dias corridos após confirmação do pagamento',carrier:'Retirada na loja',available:true});
  return options;
}

function normalizeRequestedItems(items){
  if(!Array.isArray(items) || !items.length) throw Object.assign(new Error('Seu carrinho está vazio.'),{status:400});
  const merged=new Map();
  for(const raw of items){
    const variantId=String(raw?.variantId||'').trim();
    const quantity=Math.trunc(Number(raw?.quantity));
    if(!variantId || !Number.isFinite(quantity) || quantity<1 || quantity>20) throw Object.assign(new Error('Quantidade inválida no carrinho.'),{status:400});
    const total=(merged.get(variantId)||0)+quantity;
    if(total>20) throw Object.assign(new Error('O limite é de 20 unidades por variação em cada pedido.'),{status:400});
    merged.set(variantId,total);
  }
  return [...merged].map(([variantId,quantity])=>({variantId,quantity}));
}

export async function quoteCart({items=[],couponCode='',shippingMethod='local',zip='',userId=null}){
  const requested=normalizeRequestedItems(items);
  const normalized=[]; let subtotal=0;
  for(const item of requested){
    const quantity=item.quantity;
    const v=await getVariant(item.variantId);
    if(!v || !v.active || v.productStatus!=='active') throw Object.assign(new Error('Uma variação do carrinho não está mais disponível.'),{status:409});
    if(v.available < quantity) throw Object.assign(new Error(`${v.productName}: apenas ${v.available} unidade(s) disponíveis para ${v.color}/${v.size}.`),{status:409});
    const unit=effectivePriceCents(v); const total=unit*quantity; subtotal+=total;
    normalized.push({variantId:v.id,productId:v.productId,productName:v.productName,productSlug:v.productSlug,sku:v.sku,color:v.color,size:v.size,imageUrl:v.imageUrl,quantity,unitPriceCents:unit,totalCents:total,available:v.available});
  }
  const coupon=await loadCoupon(couponCode,userId,subtotal);
  let discount=0;
  if(coupon){
    if(coupon.type==='percent') discount=Math.floor(subtotal*(coupon.value/100));
    else if(coupon.type==='fixed') discount=Math.min(subtotal,coupon.value);
  }
  const options=shippingOptions({subtotalCents:subtotal,zip});
  const normalizedMethod=shippingMethod==='standard'?'local':shippingMethod;
  const selected=options.find(x=>x.id===normalizedMethod);
  if(!selected) throw Object.assign(new Error('Entrega local disponível inicialmente apenas para Rondonópolis/MT. Escolha retirada na loja ou fale com a equipe pelo WhatsApp.'),{status:400});
  const shipping=coupon?.type==='free_shipping'?0:selected.priceCents;
  return {items:normalized,subtotalCents:subtotal,discountCents:discount,shippingCents:shipping,totalCents:Math.max(0,subtotal-discount+shipping),coupon:coupon?{id:coupon.id,code:coupon.code,type:coupon.type,value:coupon.value}:null,shipping:{...selected,priceCents:shipping},shippingOptions:options,freeShippingThresholdCents:Math.round(config.freeShippingThreshold*100)};
}

async function getOrCreateCart(userId){
  let cart=await dbGet('SELECT * FROM carts WHERE user_id=?',[userId]);
  if(!cart){
    const now=nowIso();const id=makeId('cart_');
    await dbRun('INSERT INTO carts (id,user_id,created_at,updated_at) VALUES (?,?,?,?)',[id,userId,now,now]);
    cart=await dbGet('SELECT * FROM carts WHERE id=?',[id]);
  }
  return cart;
}

export async function getCart(userId){
  const cart=await getOrCreateCart(userId);
  const rows=await dbAll(`SELECT ci.variant_id,ci.quantity,v.product_id,p.name,p.slug,v.sku,v.color,v.size,v.price_cents,v.sale_price_cents,v.stock,v.reserved,v.image_url FROM cart_items ci JOIN product_variants v ON v.id=ci.variant_id JOIN products p ON p.id=v.product_id WHERE ci.cart_id=? ORDER BY ci.created_at`,[cart.id]);
  return {couponCode:cart.coupon_code||'',items:rows.map(r=>({variantId:r.variant_id,quantity:r.quantity,productId:r.product_id,productName:r.name,productSlug:r.slug,sku:r.sku,color:r.color,size:r.size,priceCents:r.price_cents,salePriceCents:r.sale_price_cents,available:Math.max(0,r.stock-r.reserved),imageUrl:r.image_url}))};
}

export async function replaceCart(userId,{items=[],couponCode=''}){
  const cart=await getOrCreateCart(userId); const now=nowIso();
  const requested=items.length?normalizeRequestedItems(items):[];
  await transaction(async()=>{
    await dbRun('DELETE FROM cart_items WHERE cart_id=?',[cart.id]);
    for(const item of requested){
      const v=await getVariant(item.variantId); if(!v || !v.active || v.productStatus!=='active') throw Object.assign(new Error('Uma variação do carrinho não está mais disponível.'),{status:409});
      if(v.available<item.quantity) throw Object.assign(new Error(`${v.productName}: apenas ${v.available} unidade(s) disponíveis para ${v.color}/${v.size}.`),{status:409});
      await dbRun('INSERT INTO cart_items (cart_id,variant_id,quantity,created_at,updated_at) VALUES (?,?,?,?,?)',[cart.id,v.id,item.quantity,now,now]);
    }
    await dbRun('UPDATE carts SET coupon_code=?,updated_at=? WHERE id=?',[String(couponCode||'').trim().toUpperCase()||null,now,cart.id]);
  });
  return getCart(userId);
}

export async function reserveInventory(orderId, quotedItems, actorUserId=null){
  for(const item of quotedItems){
    const now=nowIso();
    const result=await dbRun('UPDATE product_variants SET reserved=reserved+?,updated_at=? WHERE id=? AND active=1 AND (stock-reserved)>=?',[item.quantity,now,item.variantId,item.quantity]);
    if(Number(result.changes||0)!==1) throw Object.assign(new Error(`Estoque insuficiente para ${item.productName}.`),{status:409});
    const row=await dbGet('SELECT stock,reserved FROM product_variants WHERE id=?',[item.variantId]);
    const after=Number(row.stock)-Number(row.reserved);const before=after+item.quantity;
    await dbRun('INSERT INTO inventory_movements (id,variant_id,order_id,type,quantity,stock_before,stock_after,note,actor_user_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',[makeId('mov_'),item.variantId,orderId,'RESERVE',-item.quantity,before,after,'Reserva criada no checkout',actorUserId,now]);
  }
}

export async function commitReservedInventory(orderId, actorUserId=null){
  const items=await dbAll('SELECT variant_id,quantity FROM order_items WHERE order_id=?',[orderId]);
  for(const item of items){
    const now=nowIso();
    const result=await dbRun('UPDATE product_variants SET stock=stock-?,reserved=reserved-?,updated_at=? WHERE id=? AND stock>=? AND reserved>=?',[item.quantity,item.quantity,now,item.variant_id,item.quantity,item.quantity]);
    if(Number(result.changes||0)!==1) throw Object.assign(new Error('A reserva de estoque deste pedido não está íntegra. Revise o pedido antes de confirmar o pagamento.'),{status:409});
    const row=await dbGet('SELECT stock FROM product_variants WHERE id=?',[item.variant_id]);const after=Number(row.stock),before=after+Number(item.quantity);
    await dbRun('INSERT INTO inventory_movements (id,variant_id,order_id,type,quantity,stock_before,stock_after,note,actor_user_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',[makeId('mov_'),item.variant_id,orderId,'SALE',-item.quantity,before,after,'Pagamento confirmado',actorUserId,now]);
  }
}


export async function restoreCommittedInventory(orderId, actorUserId=null){
  const items=await dbAll('SELECT variant_id,quantity FROM order_items WHERE order_id=?',[orderId]);
  for(const item of items){
    const already=await dbGet("SELECT id FROM inventory_movements WHERE order_id=? AND variant_id=? AND type='RETURN' LIMIT 1",[orderId,item.variant_id]);
    if(already) continue;
    const sale=await dbGet("SELECT id FROM inventory_movements WHERE order_id=? AND variant_id=? AND type='SALE' LIMIT 1",[orderId,item.variant_id]);
    if(!sale) continue;
    const row=await dbGet('SELECT stock,reserved FROM product_variants WHERE id=?',[item.variant_id]); if(!row) continue;
    const before=Number(row.stock); const quantity=Math.max(0,Number(item.quantity)||0);
    await dbRun('UPDATE product_variants SET stock=stock+?,updated_at=? WHERE id=?',[quantity,nowIso(),item.variant_id]);
    await dbRun('INSERT INTO inventory_movements (id,variant_id,order_id,type,quantity,stock_before,stock_after,note,actor_user_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',[makeId('mov_'),item.variant_id,orderId,'RETURN',quantity,before,before+quantity,'Estoque devolvido após reembolso/cancelamento pós-pagamento',actorUserId,nowIso()]);
  }
}

export async function releaseReservedInventory(orderId, actorUserId=null){
  const items=await dbAll('SELECT variant_id,quantity FROM order_items WHERE order_id=?',[orderId]);
  for(const item of items){
    const now=nowIso();
    const result=await dbRun('UPDATE product_variants SET reserved=reserved-?,updated_at=? WHERE id=? AND reserved>=?',[item.quantity,now,item.variant_id,item.quantity]);
    if(Number(result.changes||0)!==1) continue;
    const row=await dbGet('SELECT stock,reserved FROM product_variants WHERE id=?',[item.variant_id]);const after=Number(row.stock)-Number(row.reserved),before=after-Number(item.quantity);
    await dbRun('INSERT INTO inventory_movements (id,variant_id,order_id,type,quantity,stock_before,stock_after,note,actor_user_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',[makeId('mov_'),item.variant_id,orderId,'RELEASE',item.quantity,before,after,'Reserva liberada',actorUserId,now]);
  }
}
