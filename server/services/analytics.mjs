import { dbAll, dbGet, dbRun } from '../db/index.mjs';
import { makeId, nowIso } from '../lib/security.mjs';

const allowed=new Set(['page_view','view_item','search','add_to_cart','remove_from_cart','add_to_wishlist','begin_checkout','add_shipping_info','add_payment_info','purchase']);
export async function trackEvent({userId=null,sessionKey='',eventName,path='',data={}}){
  if(!allowed.has(eventName)) return {ok:false};
  await dbRun('INSERT INTO analytics_events (id,user_id,session_key,event_name,path,data_json,created_at) VALUES (?,?,?,?,?,?,?)',[makeId('evt_'),userId,String(sessionKey||'').slice(0,120),eventName,String(path||'').slice(0,300),JSON.stringify(data&&typeof data==='object'?data:{}).slice(0,10000),nowIso()]);
  return {ok:true};
}

export async function dashboardAnalytics(days=30){
  const start=new Date(Date.now()-days*86400000).toISOString();
  const events=await dbAll('SELECT event_name,COUNT(*) n FROM analytics_events WHERE created_at>=? GROUP BY event_name',[start]);
  const map=Object.fromEntries(events.map(e=>[e.event_name,Number(e.n)]));
  const sales=await dbGet("SELECT COALESCE(SUM(total_cents),0) revenue,COUNT(*) orders,COUNT(DISTINCT user_id) customers FROM orders WHERE payment_status='paid' AND created_at>=?",[start]);
  const low=await dbAll(`SELECT p.name,v.sku,v.color,v.size,(v.stock-v.reserved) available FROM product_variants v JOIN products p ON p.id=v.product_id WHERE v.active=1 AND (v.stock-v.reserved)<=v.low_stock_threshold ORDER BY available ASC LIMIT 20`);
  const funnel={visitors:map.page_view||0,productViews:map.view_item||0,addToCart:map.add_to_cart||0,checkouts:map.begin_checkout||0,purchases:map.purchase||0};
  const revenue=Number(sales?.revenue||0),orders=Number(sales?.orders||0),customers=Number(sales?.customers||0);
  return {periodDays:days,revenueCents:revenue,orders,customers,averageTicketCents:orders?Math.round(revenue/orders):0,funnel,lowStock:low};
}
