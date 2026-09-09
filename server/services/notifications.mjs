import { dbAll, dbRun } from '../db/index.mjs';
import { config } from '../config.mjs';
import { makeId, nowIso } from '../lib/security.mjs';

export async function enqueueNotification({userId=null,orderId=null,channel='email',template,recipient='',payload={},availableAt=null}){
  const now=nowIso();
  await dbRun(`INSERT INTO notification_outbox (id,user_id,order_id,channel,template,recipient,payload_json,status,attempts,available_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'pending',0,?,?,?)`,[makeId('ntf_'),userId,orderId,channel,template,String(recipient||'').slice(0,250),JSON.stringify(payload).slice(0,15000),availableAt||now,now,now]);
}
export async function processOutbox(limit=30){
  const items=await dbAll("SELECT * FROM notification_outbox WHERE status='pending' AND available_at<=? ORDER BY created_at LIMIT ?",[nowIso(),limit]);let processed=0;
  for(const item of items){
    try{
      const payload={id:item.id,channel:item.channel,template:item.template,recipient:item.recipient,data:JSON.parse(item.payload_json||'{}')};
      if(config.notificationWebhookUrl){
        const r=await fetch(config.notificationWebhookUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(8000)});
        if(!r.ok)throw new Error(`Webhook HTTP ${r.status}`);
        await dbRun("UPDATE notification_outbox SET status='sent',sent_at=?,attempts=attempts+1,updated_at=? WHERE id=?",[nowIso(),nowIso(),item.id]);
      }else{
        console.log(`[Geise Notification][dev] ${item.template} -> ${item.recipient||item.user_id||'sem destinatário'}`);
        await dbRun("UPDATE notification_outbox SET status='development_logged',sent_at=?,attempts=attempts+1,updated_at=? WHERE id=?",[nowIso(),nowIso(),item.id]);
      }
      processed++;
    }catch(error){
      await dbRun("UPDATE notification_outbox SET attempts=attempts+1,last_error=?,available_at=?,updated_at=?,status=CASE WHEN attempts>=4 THEN 'failed' ELSE 'pending' END WHERE id=?",[String(error.message).slice(0,500),new Date(Date.now()+15*60_000).toISOString(),nowIso(),item.id]);
    }
  }
  return processed;
}
export async function enqueueOrderStatus(order,template){const hasEmail=Boolean(order.customerEmail);return enqueueNotification({userId:order.userId,orderId:order.id,channel:hasEmail?'email':'whatsapp',template,recipient:hasEmail?order.customerEmail:order.customerPhone,payload:{orderNumber:order.orderNumber,status:order.status,totalCents:order.totalCents,trackingCode:order.trackingCode}});}
export async function enqueueAbandonedCarts(){
  const cutoff=new Date(Date.now()-2*60*60_000).toISOString(),oldest=new Date(Date.now()-48*60*60_000).toISOString();
  const carts=await dbAll(`SELECT c.id,c.user_id,c.updated_at,u.email,u.phone,u.marketing_opt_in,COUNT(ci.variant_id) item_count FROM carts c JOIN users u ON u.id=c.user_id JOIN cart_items ci ON ci.cart_id=c.id WHERE c.abandoned_notified_at IS NULL AND c.updated_at<=? AND c.updated_at>=? GROUP BY c.id,u.email,u.phone,u.marketing_opt_in,c.user_id,c.updated_at HAVING COUNT(ci.variant_id)>0`,[cutoff,oldest]);
  for(const c of carts){
    if(c.marketing_opt_in){const synthetic=String(c.email||'').endsWith('@cliente.lojageise.invalid');const channel=c.phone?'whatsapp':'email';const recipient=c.phone||(!synthetic?c.email:'');if(recipient)await enqueueNotification({userId:c.user_id,channel,template:'abandoned_cart',recipient,payload:{cartId:c.id,itemCount:Number(c.item_count)}});}
    await dbRun('UPDATE carts SET abandoned_notified_at=? WHERE id=?',[nowIso(),c.id]);
  }
  return carts.length;
}
