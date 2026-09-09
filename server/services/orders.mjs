import { dbAll, dbGet, dbRun, jsonValue, transaction } from '../db/index.mjs';
import { config } from '../config.mjs';
import { hashToken, isValidCpf, makeId, nowIso, onlyDigits, randomToken } from '../lib/security.mjs';
import { commitReservedInventory, quoteCart, releaseCouponRedemption, releaseReservedInventory, reserveCouponRedemption, reserveInventory, restoreCommittedInventory } from './commerce.mjs';
import { createPayment } from './payment.mjs';
import { enqueueOrderStatus } from './notifications.mjs';

const allowedTransitions={
  PENDING_PAYMENT:['PAID','CANCELLED'], PAID:['PREPARING','READY_PICKUP','REFUNDED'], PREPARING:['SHIPPED','READY_PICKUP','REFUNDED'],
  READY_PICKUP:['DELIVERED','REFUNDED'], SHIPPED:['DELIVERED','REFUNDED'], DELIVERED:['REFUNDED'], CANCELLED:[], REFUNDED:[]
};

function orderNumber(){const year=new Date().getFullYear();const token=globalThis.crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase().padStart(7,'0').slice(-7);return `GEI-${year}-${token}`;}

async function orderDto(row){
  if(!row)return null;
  const rawItems=await dbAll('SELECT * FROM order_items WHERE order_id=? ORDER BY id',[row.id]);
  const items=rawItems.map(i=>({id:i.id,productId:i.product_id,variantId:i.variant_id,productName:i.product_name,sku:i.sku,color:i.color,size:i.size,unitPriceCents:Number(i.unit_price_cents),quantity:Number(i.quantity),totalCents:Number(i.total_cents),imageUrl:i.image_url}));
  return {id:row.id,orderNumber:row.order_number,userId:row.user_id,status:row.status,paymentStatus:row.payment_status,paymentProvider:row.payment_provider,paymentMethod:row.payment_method||'',paymentExternalId:row.payment_external_id,customerName:row.customer_name,customerEmail:row.customer_email||'',customerPhone:row.customer_phone||'',customerCpf:row.customer_cpf||'',subtotalCents:Number(row.subtotal_cents),discountCents:Number(row.discount_cents||0),shippingCents:Number(row.shipping_cents||0),totalCents:Number(row.total_cents),couponCode:row.coupon_code||'',shippingMethod:row.shipping_method,shippingEta:row.shipping_eta||'',shippingAddress:jsonValue(row.shipping_address_json,{}),trackingCode:row.tracking_code||'',carrier:row.carrier||'',notes:row.notes||'',expiresAt:row.expires_at,paidAt:row.paid_at,shippedAt:row.shipped_at,deliveredAt:row.delivered_at,cancelledAt:row.cancelled_at,createdAt:row.created_at,updatedAt:row.updated_at,items};
}

export async function createOrder(input,{userId}){
  if(!userId) throw Object.assign(new Error('Faça login para finalizar a compra.'),{status:401});
  const accessToken=randomToken(24);
  const address=input.address||{};
  const name=String(input.name||'').trim().slice(0,120);
  const phone=onlyDigits(input.phone).slice(0,13);
  const cpf=onlyDigits(input.cpf);
  const email=String(input.email||'').trim().toLowerCase().slice(0,200);
  if(!name) throw Object.assign(new Error('Informe seu nome completo.'),{status:400});
  if(phone.length<10) throw Object.assign(new Error('Informe um telefone válido.'),{status:400});
  if(!isValidCpf(cpf)) throw Object.assign(new Error('Informe um CPF válido.'),{status:400});
  for(const [key,label] of [['zip','CEP'],['street','endereço'],['number','número'],['city','cidade'],['state','estado']]) if(!String(address[key]||'').trim()) throw Object.assign(new Error(`Informe ${label}.`),{status:400});
  if(String(address.zip||'').replace(/\D/g,'').length!==8) throw Object.assign(new Error('Informe um CEP válido.'),{status:400});

  const shippingMethod=String(input.shippingMethod||'standard');
  const paymentMethod=['pix','card','cash','other','provider'].includes(String(input.paymentMethod))?String(input.paymentMethod):'pix';
  const quote=await quoteCart({items:input.items,couponCode:input.couponCode||'',shippingMethod,zip:address.zip||'',userId});
  const id=makeId('ord_'),number=orderNumber(),now=nowIso(),expires=new Date(Date.now()+config.orderReservationMinutes*60_000).toISOString();

  await transaction(async()=>{
    await dbRun(`INSERT INTO orders (id,order_number,user_id,customer_name,customer_email,customer_phone,customer_cpf,payment_method,status,payment_status,access_token_hash,subtotal_cents,discount_cents,shipping_cents,total_cents,coupon_code,shipping_method,shipping_eta,shipping_address_json,expires_at,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?, 'PENDING_PAYMENT','pending',?,?,?,?,?,?,?,?,?,?,?,?)`,[id,number,userId,name,email,phone,cpf,paymentMethod,hashToken(accessToken),quote.subtotalCents,quote.discountCents,quote.shippingCents,quote.totalCents,quote.coupon?.code||null,quote.shipping.id,quote.shipping.eta,JSON.stringify(address),expires,now,now]);
    for(const item of quote.items){
      await dbRun(`INSERT INTO order_items (id,order_id,product_id,variant_id,product_name,sku,color,size,unit_price_cents,quantity,total_cents,image_url) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,[makeId('itm_'),id,item.productId,item.variantId,item.productName,item.sku,item.color,item.size,item.unitPriceCents,item.quantity,item.totalCents,item.imageUrl]);
    }
    await reserveInventory(id,quote.items,userId);
    if(quote.coupon)await reserveCouponRedemption({couponCode:quote.coupon.code,userId,subtotalCents:quote.subtotalCents,orderId:id});
  });

  const beforePayment=await orderDto(await dbGet('SELECT * FROM orders WHERE id=?',[id]));
  try{
    const payment=await createPayment({order:beforePayment,items:quote.items,paymentMethod});
    await dbRun('UPDATE orders SET payment_provider=?,payment_external_id=?,updated_at=? WHERE id=?',[payment.provider,payment.externalId||null,nowIso(),id]);
    const created=await orderDto(await dbGet('SELECT * FROM orders WHERE id=?',[id]));
    await enqueueOrderStatus(created,'order_created');
    return {order:created,payment,accessToken};
  }catch(error){
    await transaction(async()=>{
      await releaseReservedInventory(id,userId);
      await releaseCouponRedemption(id);
      await dbRun("UPDATE orders SET status='CANCELLED',payment_status='failed',cancelled_at=?,updated_at=? WHERE id=?",[nowIso(),nowIso(),id]);
    });
    throw error;
  }
}

export async function listOrdersForUser(userId){const rows=await dbAll('SELECT * FROM orders WHERE user_id=? ORDER BY created_at DESC',[userId]);return Promise.all(rows.map(orderDto));}
export async function getOrderForUser(orderNumber,userId){return orderDto(await dbGet('SELECT * FROM orders WHERE order_number=? AND user_id=?',[orderNumber,userId]));}
export async function getOrderByNumber(orderNumber){return orderDto(await dbGet('SELECT * FROM orders WHERE order_number=?',[orderNumber]));}
export async function getGuestOrder(orderNumber,accessToken){return orderDto(await dbGet('SELECT * FROM orders WHERE order_number=? AND access_token_hash=?',[orderNumber,hashToken(accessToken)]));}
export async function getOrderById(id){return orderDto(await dbGet('SELECT * FROM orders WHERE id=?',[id]));}

export async function cancelOrder(orderId,{actorUserId=null}={}){
  const row=await dbGet('SELECT * FROM orders WHERE id=?',[orderId]);if(!row)throw Object.assign(new Error('Pedido não encontrado.'),{status:404});
  if(row.status!=='PENDING_PAYMENT') throw Object.assign(new Error('Pedidos pagos precisam ser cancelados pela equipe para análise do reembolso.'),{status:409});
  await transaction(async()=>{
    const now=nowIso();
    const claim=await dbRun("UPDATE orders SET status='CANCELLED',payment_status='cancelled',cancelled_at=?,updated_at=? WHERE id=? AND status='PENDING_PAYMENT'",[now,now,orderId]);
    if(Number(claim.changes||0)!==1) throw Object.assign(new Error('O pedido foi alterado por outra operação. Atualize e tente novamente.'),{status:409});
    await releaseReservedInventory(orderId,actorUserId);
    await releaseCouponRedemption(orderId);
  });
  const cancelled=await getOrderById(orderId);await enqueueOrderStatus(cancelled,'order_cancelled');return cancelled;
}

export async function markPayment(orderId,{status,externalId='',provider='manual'}={}){
  const initial=await dbGet('SELECT * FROM orders WHERE id=?',[orderId]);if(!initial)throw Object.assign(new Error('Pedido não encontrado.'),{status:404});
  if(status==='approved' || status==='paid'){
    if(initial.payment_status==='paid') return getOrderById(orderId);
    let claimed=false;
    await transaction(async()=>{
      const now=nowIso();
      const claim=await dbRun("UPDATE orders SET status='PAID',payment_status='processing',payment_provider=?,payment_external_id=COALESCE(?,payment_external_id),updated_at=? WHERE id=? AND status='PENDING_PAYMENT' AND payment_status<>'paid'",[provider,externalId||null,now,orderId]);
      if(Number(claim.changes||0)!==1)return;
      claimed=true;
      const row=await dbGet('SELECT * FROM orders WHERE id=?',[orderId]);
      await commitReservedInventory(orderId,null);
      if(row.coupon_code){
        // Pedidos novos já reservam o uso do cupom no checkout. Este fallback atende pedidos antigos criados antes da V4 final.
        const existingRedemption=await dbGet('SELECT id FROM coupon_redemptions WHERE order_id=?',[orderId]);
        if(!existingRedemption){
          const coupon=await dbGet('SELECT id FROM coupons WHERE UPPER(code)=UPPER(?)',[row.coupon_code]);
          if(coupon)await dbRun('INSERT INTO coupon_redemptions (id,coupon_id,user_id,order_id,created_at) VALUES (?,?,?,?,?)',[makeId('red_'),coupon.id,row.user_id,orderId,now]);
        }
      }
      await dbRun("UPDATE orders SET payment_status='paid',paid_at=?,updated_at=? WHERE id=?",[now,now,orderId]);
    });
    if(!claimed){
      const current=await getOrderById(orderId);
      if(current?.paymentStatus==='paid')return current;
      throw Object.assign(new Error('O pedido não está mais aguardando pagamento.'),{status:409});
    }
  }else if(['rejected','cancelled','failed'].includes(status)){
    await transaction(async()=>{
      const now=nowIso();
      const claim=await dbRun("UPDATE orders SET status='CANCELLED',payment_status=?,cancelled_at=?,updated_at=? WHERE id=? AND status='PENDING_PAYMENT'",[status,now,now,orderId]);
      if(Number(claim.changes||0)===1){await releaseReservedInventory(orderId,null);await releaseCouponRedemption(orderId);}
    });
  }
  const updated=await getOrderById(orderId);await enqueueOrderStatus(updated, updated.paymentStatus==='paid'?'payment_approved':'order_status');return updated;
}

export async function adminTransition(orderId,next,{trackingCode='',carrier='',notes=''}={}){
  const row=await dbGet('SELECT * FROM orders WHERE id=?',[orderId]);if(!row)throw Object.assign(new Error('Pedido não encontrado.'),{status:404});
  if(!allowedTransitions[row.status]?.includes(next)) throw Object.assign(new Error(`Transição inválida: ${row.status} → ${next}.`),{status:409});
  if(next==='PAID') return markPayment(orderId,{status:'paid',provider:row.payment_provider||'manual'});
  const now=nowIso();
  const shipped=next==='SHIPPED'?now:row.shipped_at;
  const delivered=next==='DELIVERED'?now:row.delivered_at;
  const cancelled=next==='CANCELLED'?now:row.cancelled_at;
  const paymentStatus=next==='REFUNDED'?'refunded':row.payment_status;
  await transaction(async()=>{
    const claim=await dbRun(`UPDATE orders SET status=?,payment_status=?,tracking_code=?,carrier=?,notes=?,updated_at=?,shipped_at=?,delivered_at=?,cancelled_at=? WHERE id=? AND status=?`,[next,paymentStatus,String(trackingCode||row.tracking_code||'').slice(0,120),String(carrier||row.carrier||'').slice(0,120),String(notes||row.notes||'').slice(0,1000),now,shipped,delivered,cancelled,orderId,row.status]);
    if(Number(claim.changes||0)!==1) throw Object.assign(new Error('O pedido foi alterado por outra operação. Atualize e tente novamente.'),{status:409});
    if(next==='CANCELLED') await releaseReservedInventory(orderId,null);
    if(next==='REFUNDED') await restoreCommittedInventory(orderId,null);
  });
  const updated=await getOrderById(orderId);await enqueueOrderStatus(updated, next==='SHIPPED'?'order_shipped':next==='DELIVERED'?'order_delivered':'order_status');return updated;
}

export async function expirePendingOrders(){
  const rows=await dbAll("SELECT id FROM orders WHERE status='PENDING_PAYMENT' AND expires_at IS NOT NULL AND expires_at<?",[nowIso()]);
  let expired=0;
  for(const row of rows){
    await transaction(async()=>{
      const now=nowIso();
      const claim=await dbRun("UPDATE orders SET status='CANCELLED',payment_status='expired',cancelled_at=?,updated_at=? WHERE id=? AND status='PENDING_PAYMENT' AND expires_at IS NOT NULL AND expires_at<?",[now,now,row.id,now]);
      if(Number(claim.changes||0)!==1)return;
      await releaseReservedInventory(row.id,null);await releaseCouponRedemption(row.id);expired++;
    });
  }
  return expired;
}

export async function listOrdersAdmin(limit=100){const rows=await dbAll('SELECT * FROM orders ORDER BY created_at DESC LIMIT ?',[Math.min(500,Math.max(1,Number(limit)||100))]);return Promise.all(rows.map(orderDto));}
