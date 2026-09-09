import crypto from 'node:crypto';
import { config } from '../config.mjs';
import { dbGet, dbRun } from '../db/index.mjs';
import { makeId, nowIso } from '../lib/security.mjs';

function brl(cents){return (Number(cents||0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}

export async function createPayment({order,items,paymentMethod='pix'}){
  if(config.paymentProvider==='mercadopago') return createMercadoPagoPreference({order,items});
  if(config.paymentProvider==='manual' || config.paymentProvider==='whatsapp') return createManualPayment({order,paymentMethod});
  if(config.paymentProvider==='mock' && !config.isProd) return {provider:'mock',status:'pending',checkoutUrl:`${config.baseUrl}/pedido/${encodeURIComponent(order.orderNumber)}?payment=mock`,externalId:`mock-${order.id}`,method:'mock'};
  throw Object.assign(new Error('Provedor de pagamento não configurado. Use PAYMENT_PROVIDER=manual ou configure um gateway.'),{status:503});
}

function createManualPayment({order,paymentMethod}){
  const method = ['pix','card','cash','other'].includes(String(paymentMethod)) ? String(paymentMethod) : 'pix';
  const label = {pix:'PIX',card:'cartão',cash:'dinheiro',other:'pagamento'}[method];
  const message = `Olá! Fiz o pedido ${order.orderNumber} na Geise Confecções, no total de ${brl(order.totalCents)}. Gostaria de concluir o pagamento por ${label}.`;
  const phone = config.whatsappNumber;
  const checkoutUrl = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}` : '';
  return {provider:'manual',status:'pending',checkoutUrl,externalId:`manual-${order.id}`,method,requiresManualConfirmation:true};
}

async function createMercadoPagoPreference({order,items}){
  if(!config.mercadoPagoToken) throw Object.assign(new Error('MERCADOPAGO_ACCESS_TOKEN não configurado no servidor.'),{status:503});
  const payload={
    external_reference:order.id,
    items:items.map(item=>({id:item.variantId,title:`${item.productName} — ${item.color}/${item.size}`,quantity:item.quantity,currency_id:'BRL',unit_price:item.unitPriceCents/100})),
    payer:{email:order.customerEmail||undefined,name:order.customerName},
    back_urls:{success:`${config.baseUrl}/pedido/${order.orderNumber}?status=success`,pending:`${config.baseUrl}/pedido/${order.orderNumber}?status=pending`,failure:`${config.baseUrl}/pedido/${order.orderNumber}?status=failure`},
    auto_return:'approved',
    ...(config.mercadoPagoWebhookUrl?{notification_url:config.mercadoPagoWebhookUrl}:{})
  };
  const response=await fetch('https://api.mercadopago.com/checkout/preferences',{method:'POST',headers:{Authorization:`Bearer ${config.mercadoPagoToken}`,'Content-Type':'application/json','X-Idempotency-Key':order.id},body:JSON.stringify(payload),signal:AbortSignal.timeout(10000)});
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw Object.assign(new Error(data.message||'Falha ao iniciar o pagamento no Mercado Pago.'),{status:502,details:data});
  return {provider:'mercadopago',status:'pending',checkoutUrl:data.init_point,externalId:data.id,method:'provider'};
}

function safeEqualHex(a,b){
  if(!a||!b||a.length!==b.length) return false;
  try{return crypto.timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));}catch{return false;}
}

export function verifyMercadoPagoSignature({xSignature,xRequestId,dataId,secret=config.mercadoPagoWebhookSecret}){
  if(!secret) return !config.isProd;
  if(!xSignature||!dataId) return false;
  const parts=Object.fromEntries(String(xSignature).split(',').map(part=>part.trim().split('=').map(x=>x.trim())).filter(pair=>pair.length===2));
  const ts=parts.ts;
  const received=parts.v1;
  if(!ts||!received) return false;
  const manifest=[`id:${String(dataId).toLowerCase()};`,xRequestId?`request-id:${xRequestId};`:'',`ts:${ts};`].join('');
  const expected=crypto.createHmac('sha256',secret).update(manifest).digest('hex');
  return safeEqualHex(expected,received);
}

export async function resolveMercadoPagoWebhook({body,xSignature,xRequestId,dataId}){
  if(!config.mercadoPagoToken) throw Object.assign(new Error('Mercado Pago não configurado.'),{status:503});
  const paymentId=String(dataId||body?.data?.id||body?.id||'').trim();
  if(!paymentId) return null;
  if(!verifyMercadoPagoSignature({xSignature,xRequestId,dataId:paymentId})) throw Object.assign(new Error('Assinatura do webhook do Mercado Pago inválida.'),{status:401});

  const eventType=String(body?.action||body?.type||'payment');
  const eventId=String(body?.id||crypto.createHash('sha256').update(JSON.stringify(body||{})).digest('hex'));
  const duplicate=await dbGet(`SELECT id FROM payment_events WHERE provider='mercadopago' AND external_id=? LIMIT 1`,[eventId]);
  if(duplicate) return {duplicate:true};

  const response=await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`,{headers:{Authorization:`Bearer ${config.mercadoPagoToken}`,Accept:'application/json'},signal:AbortSignal.timeout(10000)});
  if(!response.ok) throw Object.assign(new Error('Falha ao validar notificação do Mercado Pago.'),{status:502});
  const payment=await response.json();
  await dbRun(`INSERT INTO payment_events (id,provider,external_id,order_id,event_type,payload_json,processed_at,created_at) VALUES (?,?,?,?,?,?,?,?)`,[
    makeId('pevt_'),'mercadopago',eventId,payment.external_reference||null,eventType,JSON.stringify({notification:body,payment}),nowIso(),nowIso()
  ]);
  return {externalId:String(payment.id),orderId:payment.external_reference,status:String(payment.status||''),raw:payment,duplicate:false};
}
