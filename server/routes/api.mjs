import { dbAll, dbGet, dbRun, databaseEngine } from '../db/index.mjs';
import { config } from '../config.mjs';
import { json, rateLimit, readJson, requestIp } from '../lib/http.mjs';
import { makeId, nowIso } from '../lib/security.mjs';
import { authenticate, createSession, deleteAddress, destroySession, listAddresses, registerUser, requestPasswordReset, requireAdmin, requireOwner, requireCsrf, requireSession, resendVerification, resetPassword, revokeOtherSessions, saveAddress, sessionFromRequest, updateProfile, verifyEmail } from '../services/auth.mjs';
import { getProductById, getProductBySlug, getProductByCode, listCategories, listProducts, productReviews, suggestions } from '../services/catalog.mjs';
import { getCart, quoteCart, replaceCart } from '../services/commerce.mjs';
import { lookupCep } from '../services/shipping.mjs';
import { adminTransition, cancelOrder, createOrder, getGuestOrder, getOrderById, getOrderByNumber, getOrderForUser, listOrdersForUser, markPayment, listOrdersAdmin } from '../services/orders.mjs';
import { resolveMercadoPagoWebhook } from '../services/payment.mjs';
import { assistant } from '../services/ai.mjs';
import { dashboard, saveProduct, archiveProduct, adjustStock, listCoupons, saveCoupon, listCustomers, listInventory, listAudit, listProductsAdmin, listReviewsAdmin, moderateReview, getSettings, saveSettings, audit, listBadgeTemplates, saveBadgeTemplate } from '../services/admin.mjs';
import { trackEvent } from '../services/analytics.mjs';
import { getPublishedPost, listCampaigns, listPostsAdmin, listPublishedPosts, savePost } from '../services/content.mjs';
import { runJobs } from '../services/jobs.mjs';

function ok(res,data,status=200,headers={}){json(res,status,data,headers);return true;}
function queryObject(url){return Object.fromEntries(url.searchParams.entries());}
function bodyRequired(req){return readJson(req);}
async function sessionMaybe(req){try{return await sessionFromRequest(req);}catch{return null;}}

export async function handleApi(req,res,url){
  const path=url.pathname; const method=req.method||'GET';
  if(path==='/api/health'&&method==='GET') return ok(res,{ok:true,version:'4.0.0',environment:config.env,time:nowIso(),database:databaseEngine,paymentProvider:config.paymentProvider,aiProvider:config.aiProvider});
  if(path==='/api/config'&&method==='GET'){
    const settings=await getSettings();
    return ok(res,{store:settings.store||{},commerce:settings.commerce||{},features:settings.features||{},ai:settings.ai||{},paymentProvider:config.paymentProvider,paymentMethods:config.paymentProvider==='manual'?['pix','card','cash']:['provider'],aiProvider:config.aiProvider,environment:config.env});
  }

  if(path==='/api/catalog/categories'&&method==='GET') return ok(res,{items:await listCategories()});
  if(path==='/api/catalog/products'&&method==='GET') return ok(res,await listProducts(queryObject(url)));
  const productSlug=path.match(/^\/api\/catalog\/products\/([^/]+)$/);
  if(productSlug&&method==='GET'){const p=await getProductBySlug(decodeURIComponent(productSlug[1]));return p?ok(res,{product:p,reviews:await productReviews(p.id)}):ok(res,{error:'Produto não encontrado.'},404);}
  const productCode=path.match(/^\/api\/catalog\/code\/([^/]+)$/);
  if(productCode&&method==='GET'){const p=await getProductByCode(decodeURIComponent(productCode[1]));return p?ok(res,{product:p}):ok(res,{error:'Produto não encontrado.'},404);}
  if(path==='/api/search/suggestions'&&method==='GET'){if(!rateLimit(req,res,{key:'search',limit:240,windowMs:15*60_000}))return true;return ok(res,{items:await suggestions(url.searchParams.get('q')||'')});}
  if(path==='/api/content/posts'&&method==='GET') return ok(res,{items:await listPublishedPosts()});
  const publicPost=path.match(/^\/api\/content\/posts\/([^/]+)$/);
  if(publicPost&&method==='GET'){const post=await getPublishedPost(decodeURIComponent(publicPost[1]));return post?ok(res,{post}):ok(res,{error:'Conteúdo não encontrado.'},404);}
  if(path==='/api/content/campaigns'&&method==='GET') return ok(res,{items:await listCampaigns()});

  if(path==='/api/auth/register'&&method==='POST'){
    if(!rateLimit(req,res,{key:'register',limit:12,windowMs:15*60_000}))return true;
    const user=await registerUser(await bodyRequired(req)); const ses=await createSession(user.id); return ok(res,{user,csrfToken:ses.csrf},201,{'Set-Cookie':ses.cookie});
  }
  if(path==='/api/auth/login'&&method==='POST'){
    if(!rateLimit(req,res,{key:'login',limit:20,windowMs:15*60_000}))return true;
    const body=await bodyRequired(req); const user=await authenticate(body.identifier??body.email,body.password); const ses=await createSession(user.id); return ok(res,{user,csrfToken:ses.csrf},200,{'Set-Cookie':ses.cookie});
  }
  if(path==='/api/auth/me'&&method==='GET'){const s=await sessionMaybe(req);return ok(res,s?{authenticated:true,user:s.user,csrfToken:s.csrf}:{authenticated:false,user:null,csrfToken:null});}
  if(path==='/api/auth/logout'&&method==='POST'){const s=await sessionMaybe(req);if(s)requireCsrf(req,s);return ok(res,{ok:true},200,{'Set-Cookie':await destroySession(req)});}
  if(path==='/api/auth/profile'&&method==='PATCH'){const s=await requireSession(req);requireCsrf(req,s);return ok(res,{user:await updateProfile(s.user.id,await bodyRequired(req))});}
  if(path==='/api/auth/email/verify'&&method==='POST'){const b=await bodyRequired(req);return ok(res,await verifyEmail(b.token));}
  if(path==='/api/auth/email/resend'&&method==='POST'){const s=await requireSession(req);requireCsrf(req,s);return ok(res,await resendVerification(s.user));}
  if(path==='/api/auth/sessions/revoke-others'&&method==='POST'){const s=await requireSession(req);requireCsrf(req,s);return ok(res,await revokeOtherSessions(s.sessionId,s.user.id));}
  if(path==='/api/auth/addresses'&&method==='GET'){const s=await requireSession(req);return ok(res,{items:await listAddresses(s.user.id)});}
  if(path==='/api/auth/addresses'&&method==='POST'){const s=await requireSession(req);requireCsrf(req,s);return ok(res,{items:await saveAddress(s.user.id,await bodyRequired(req))},201);}
  const addressMatch=path.match(/^\/api\/auth\/addresses\/([^/]+)$/);
  if(addressMatch&&method==='PUT'){const s=await requireSession(req);requireCsrf(req,s);const b=await bodyRequired(req);b.id=decodeURIComponent(addressMatch[1]);return ok(res,{items:await saveAddress(s.user.id,b)});}
  if(addressMatch&&method==='DELETE'){const s=await requireSession(req);requireCsrf(req,s);return ok(res,await deleteAddress(s.user.id,decodeURIComponent(addressMatch[1])));}
  if(path==='/api/auth/password/request-reset'&&method==='POST'){if(!rateLimit(req,res,{key:'pwd-reset',limit:8,windowMs:60*60_000}))return true;const b=await bodyRequired(req);return ok(res,await requestPasswordReset(b.identifier??b.email));}
  if(path==='/api/auth/password/reset'&&method==='POST'){const b=await bodyRequired(req);return ok(res,await resetPassword(b.token,b.password));}

  if(path==='/api/favorites'&&method==='GET'){const s=await requireSession(req);const items=await dbAll(`SELECT p.slug,p.name,p.product_code code,p.id,(SELECT image_url FROM product_variants v WHERE v.product_id=p.id LIMIT 1) image_url FROM favorites f JOIN products p ON p.id=f.product_id WHERE f.user_id=? ORDER BY f.created_at DESC`,[s.user.id]);return ok(res,{items});}
  if(path==='/api/favorites'&&method==='POST'){const s=await requireSession(req);requireCsrf(req,s);const b=await bodyRequired(req);if(!await getProductById(b.productId))return ok(res,{error:'Produto não encontrado.'},404);await dbRun('INSERT INTO favorites (user_id,product_id,created_at) VALUES (?,?,?) ON CONFLICT (user_id,product_id) DO NOTHING',[s.user.id,b.productId,nowIso()]);return ok(res,{ok:true});}
  const fav=path.match(/^\/api\/favorites\/([^/]+)$/);
  if(fav&&method==='DELETE'){const s=await requireSession(req);requireCsrf(req,s);await dbRun('DELETE FROM favorites WHERE user_id=? AND product_id=?',[s.user.id,decodeURIComponent(fav[1])]);return ok(res,{ok:true});}

  if(path==='/api/cart'&&method==='GET'){const s=await requireSession(req);return ok(res,await getCart(s.user.id));}
  if(path==='/api/cart'&&method==='PUT'){const s=await requireSession(req);requireCsrf(req,s);return ok(res,await replaceCart(s.user.id,await bodyRequired(req)));}
  if(path==='/api/quote'&&method==='POST'){if(!rateLimit(req,res,{key:'quote',limit:120,windowMs:15*60_000}))return true;const s=await sessionMaybe(req);const b=await bodyRequired(req);return ok(res,await quoteCart({...b,userId:s?.user?.id||null}));}
  const cep=path.match(/^\/api\/shipping\/cep\/([^/]+)$/); if(cep&&method==='GET'){if(!rateLimit(req,res,{key:'cep',limit:90,windowMs:15*60_000}))return true;return ok(res,await lookupCep(cep[1]));}

  if(path==='/api/checkout/create'&&method==='POST'){
    if(!rateLimit(req,res,{key:'checkout',limit:30,windowMs:60*60_000}))return true;
    const s=await requireSession(req);requireCsrf(req,s);const result=await createOrder(await bodyRequired(req),{userId:s.user.id});return ok(res,result,201);
  }
  if(path==='/api/orders'&&method==='GET'){const s=await requireSession(req);return ok(res,{items:await listOrdersForUser(s.user.id)});}
  const orderNumberMatch=path.match(/^\/api\/orders\/number\/([^/]+)$/);
  if(orderNumberMatch&&method==='GET'){
    const num=decodeURIComponent(orderNumberMatch[1]);const s=await sessionMaybe(req);let order=s?await getOrderForUser(num,s.user.id):null;if(!order){const token=String(req.headers['x-order-token']||'');if(token)order=await getGuestOrder(num,token);}return order?ok(res,{order}):ok(res,{error:'Pedido não encontrado ou acesso inválido.'},404);
  }
  const cancelMatch=path.match(/^\/api\/orders\/([^/]+)\/cancel$/);
  if(cancelMatch&&method==='POST'){const s=await requireSession(req);requireCsrf(req,s);const order=await getOrderById(decodeURIComponent(cancelMatch[1]));if(!order||order.userId!==s.user.id)return ok(res,{error:'Pedido não encontrado.'},404);return ok(res,{order:await cancelOrder(order.id,{actorUserId:s.user.id})});}

  if(path==='/api/payments/mock/approve'&&method==='POST'){
    if(config.isProd||config.paymentProvider!=='mock')return ok(res,{error:'Rota de simulação desativada.'},404);
    const b=await bodyRequired(req);const order=await getOrderByNumber(b.orderNumber);if(!order)return ok(res,{error:'Pedido não encontrado.'},404);return ok(res,{order:await markPayment(order.id,{status:'approved',externalId:`mock-paid-${Date.now()}`,provider:'mock'})});
  }
  if(path==='/api/webhooks/payment/mercadopago'&&method==='POST'){
    const body=await bodyRequired(req);
    const resolved=await resolveMercadoPagoWebhook({body,xSignature:req.headers['x-signature'],xRequestId:req.headers['x-request-id'],dataId:url.searchParams.get('data.id')||body?.data?.id||body?.id});
    if(resolved?.orderId&&!resolved.duplicate)await markPayment(resolved.orderId,{status:resolved.status,externalId:resolved.externalId,provider:'mercadopago'});
    return ok(res,{received:true,duplicate:Boolean(resolved?.duplicate)});
  }

  if(path==='/api/reviews'&&method==='POST'){const s=await requireSession(req);requireCsrf(req,s);const b=await bodyRequired(req);const product=await getProductById(b.productId);if(!product)return ok(res,{error:'Produto não encontrado.'},404);const rating=Math.trunc(Number(b.rating));if(rating<1||rating>5)return ok(res,{error:'Avaliação deve ser de 1 a 5.'},400);const purchased=await dbGet(`SELECT o.id FROM orders o JOIN order_items oi ON oi.order_id=o.id WHERE o.user_id=? AND oi.product_id=? AND o.payment_status='paid' LIMIT 1`,[s.user.id,b.productId]);if(!purchased)return ok(res,{error:'Somente compradores verificados podem avaliar este produto.'},403);const id=makeId('rev_'),now=nowIso();await dbRun(`INSERT INTO reviews (id,user_id,product_id,order_id,rating,title,body,image_urls_json,verified_purchase,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,1,'pending',?,?)`,[id,s.user.id,b.productId,purchased.id,rating,String(b.title||'').slice(0,120),String(b.body||'').slice(0,3000),JSON.stringify(Array.isArray(b.images)?b.images.slice(0,5):[]),now,now]);return ok(res,{ok:true,message:'Avaliação enviada para moderação.'},201);}

  if(path==='/api/analytics'&&method==='POST'){if(!rateLimit(req,res,{key:'analytics',limit:300,windowMs:15*60_000}))return true;const b=await bodyRequired(req,100_000);const s=await sessionMaybe(req);return ok(res,await trackEvent({userId:s?.user?.id||null,sessionKey:b.sessionKey,eventName:b.eventName,path:b.path,data:b.data}),202);}
  if(path==='/api/ai/chat'&&method==='POST'){if(!rateLimit(req,res,{key:'ai',limit:40,windowMs:60*60_000}))return true;const b=await bodyRequired(req);const s=await sessionMaybe(req);return ok(res,await assistant(String(b.message||'').slice(0,1500),{...(b.context||{}),authenticated:Boolean(s),userId:s?.user?.id||null}));}

  // ADMIN — staff can operate catalog/stock/orders; owner-only actions are explicitly protected.
  if(path==='/api/admin/dashboard'&&method==='GET'){await requireAdmin(req);return ok(res,await dashboard());}
  if(path==='/api/admin/products'&&method==='GET'){await requireAdmin(req);return ok(res,{items:await listProductsAdmin(),categories:await listCategories(),badgeTemplates:await listBadgeTemplates()});}
  if(path==='/api/admin/products'&&method==='POST'){const s=await requireAdmin(req);requireCsrf(req,s);return ok(res,{product:await saveProduct(await bodyRequired(req),{actorUserId:s.user.id,ip:requestIp(req)})},201);}
  const adminProduct=path.match(/^\/api\/admin\/products\/([^/]+)$/);
  if(adminProduct&&method==='PUT'){const s=await requireAdmin(req);requireCsrf(req,s);const b=await bodyRequired(req);b.id=decodeURIComponent(adminProduct[1]);return ok(res,{product:await saveProduct(b,{actorUserId:s.user.id,ip:requestIp(req)})});}
  if(adminProduct&&method==='DELETE'){const s=await requireAdmin(req);requireCsrf(req,s);return ok(res,await archiveProduct(decodeURIComponent(adminProduct[1]),{actorUserId:s.user.id,ip:requestIp(req)}));}
  if(path==='/api/admin/inventory'&&method==='GET'){await requireAdmin(req);return ok(res,{items:await listInventory()});}
  if(path==='/api/admin/inventory/adjust'&&method==='POST'){const s=await requireAdmin(req);requireCsrf(req,s);return ok(res,await adjustStock(await bodyRequired(req),{actorUserId:s.user.id,ip:requestIp(req)}));}
  if(path==='/api/admin/orders'&&method==='GET'){await requireAdmin(req);return ok(res,{items:await listOrdersAdmin(300)});}
  const adminOrder=path.match(/^\/api\/admin\/orders\/([^/]+)\/status$/);
  if(adminOrder&&method==='POST'){const s=await requireAdmin(req);requireCsrf(req,s);const b=await bodyRequired(req);const before=await getOrderById(decodeURIComponent(adminOrder[1]));const order=await adminTransition(decodeURIComponent(adminOrder[1]),b.status,b);await audit({actorUserId:s.user.id,action:'order.transition',entityType:'order',entityId:order.id,before,after:order,ip:requestIp(req)});return ok(res,{order});}
  const confirmPayment=path.match(/^\/api\/admin\/orders\/([^/]+)\/payment\/confirm$/);
  if(confirmPayment&&method==='POST'){const s=await requireOwner(req);requireCsrf(req,s);const id=decodeURIComponent(confirmPayment[1]);const before=await getOrderById(id);const order=await markPayment(id,{status:'paid',provider:before?.paymentProvider||'manual',externalId:`manual-confirm-${Date.now()}`});await audit({actorUserId:s.user.id,action:'payment.manual_confirm',entityType:'order',entityId:id,before,after:order,ip:requestIp(req)});return ok(res,{order});}
  if(path==='/api/admin/customers'&&method==='GET'){await requireAdmin(req);return ok(res,{items:await listCustomers()});}
  if(path==='/api/admin/coupons'&&method==='GET'){await requireOwner(req);return ok(res,{items:await listCoupons()});}
  if(path==='/api/admin/coupons'&&method==='POST'){const s=await requireOwner(req);requireCsrf(req,s);return ok(res,{coupon:await saveCoupon(await bodyRequired(req),{actorUserId:s.user.id,ip:requestIp(req)})},201);}
  if(path==='/api/admin/badges'&&method==='GET'){await requireAdmin(req);return ok(res,{items:await listBadgeTemplates()});}
  if(path==='/api/admin/badges'&&method==='POST'){const s=await requireOwner(req);requireCsrf(req,s);return ok(res,{badge:await saveBadgeTemplate(await bodyRequired(req),{actorUserId:s.user.id,ip:requestIp(req)})},201);}
  if(path==='/api/admin/reviews'&&method==='GET'){await requireAdmin(req);return ok(res,{items:await listReviewsAdmin()});}
  const review=path.match(/^\/api\/admin\/reviews\/([^/]+)$/); if(review&&method==='POST'){const s=await requireAdmin(req);requireCsrf(req,s);const b=await bodyRequired(req);return ok(res,await moderateReview(decodeURIComponent(review[1]),b.status,{actorUserId:s.user.id,ip:requestIp(req)}));}
  if(path==='/api/admin/settings'&&method==='GET'){await requireOwner(req);return ok(res,{settings:await getSettings()});}
  if(path==='/api/admin/settings'&&method==='PUT'){const s=await requireOwner(req);requireCsrf(req,s);const b=await bodyRequired(req);return ok(res,await saveSettings(String(b.key||''),b.value,{actorUserId:s.user.id,ip:requestIp(req)}));}
  if(path==='/api/admin/audit'&&method==='GET'){await requireOwner(req);return ok(res,{items:await listAudit()});}
  if(path==='/api/admin/content/posts'&&method==='GET'){await requireAdmin(req);return ok(res,{items:await listPostsAdmin()});}
  if(path==='/api/admin/content/posts'&&method==='POST'){const s=await requireOwner(req);requireCsrf(req,s);return ok(res,{post:await savePost(await bodyRequired(req),{actorUserId:s.user.id,ip:requestIp(req)})},201);}
  const adminPost=path.match(/^\/api\/admin\/content\/posts\/([^/]+)$/);
  if(adminPost&&method==='PUT'){const s=await requireOwner(req);requireCsrf(req,s);const b=await bodyRequired(req);b.id=decodeURIComponent(adminPost[1]);return ok(res,{post:await savePost(b,{actorUserId:s.user.id,ip:requestIp(req)})});}
  if(path==='/api/admin/jobs/run'&&method==='POST'){const s=await requireOwner(req);requireCsrf(req,s);return ok(res,await runJobs());}

  return false;
}
