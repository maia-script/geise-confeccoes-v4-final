import { dbAll, dbGet, dbRun, transaction } from '../db/index.mjs';
import { getProductById, listProducts } from './catalog.mjs';
import { isValidEmail, makeId, nowIso, sanitizePublicUrl } from '../lib/security.mjs';
import { dashboardAnalytics } from './analytics.mjs';
import { listOrdersAdmin } from './orders.mjs';

export async function audit({actorUserId,action,entityType,entityId=null,before=null,after=null,ip=''}){
  await dbRun('INSERT INTO audit_logs (id,actor_user_id,action,entity_type,entity_id,before_json,after_json,ip,created_at) VALUES (?,?,?,?,?,?,?,?,?)',[makeId('aud_'),actorUserId,action,entityType,entityId,before?JSON.stringify(before):null,after?JSON.stringify(after):null,ip,nowIso()]);
}

export async function dashboard(){
  const analytics=await dashboardAnalytics(30);
  const products=Number((await dbGet("SELECT COUNT(*) n FROM products WHERE status!='archived'"))?.n||0);
  const customers=Number((await dbGet("SELECT COUNT(*) n FROM users WHERE role='customer'"))?.n||0);
  const pendingOrders=Number((await dbGet("SELECT COUNT(*) n FROM orders WHERE status IN ('PENDING_PAYMENT','PAID','PREPARING','READY_PICKUP','SHIPPED')"))?.n||0);
  return {...analytics,counts:{products,customers,pendingOrders},recentOrders:await listOrdersAdmin(8)};
}

function cleanProductCode(value){return String(value||'').trim().replace(/^#+/,'').toUpperCase().replace(/[^A-Z0-9_-]/g,'').slice(0,40);}
function safeHex(value,fallback){return /^#[0-9a-f]{3,8}$/i.test(String(value||''))?String(value):fallback;}
function cleanBadges(input){
  if(!Array.isArray(input))return [];
  const animations=new Set(['none','pulse','glow','shimmer','float','zoom','slide','gradient']);
  const positions=new Set(['top-left','top-right','bottom-left','bottom-right','name']);
  return input.slice(0,8).map(b=>({
    label:String(b.label||'').trim().slice(0,40),icon:String(b.icon||'').trim().slice(0,30),
    background:safeHex(b.background,'#92278f'),foreground:safeHex(b.foreground,'#ffffff'),borderColor:safeHex(b.borderColor,'')||'',
    animation:animations.has(b.animation)?b.animation:'none',position:positions.has(b.position)?b.position:'top-left',
    priority:Math.max(-100,Math.min(100,Math.trunc(Number(b.priority)||0))),startsAt:b.startsAt||null,endsAt:b.endsAt||null,enabled:b.enabled!==false
  })).filter(b=>b.label);
}

async function cleanProductInput(input){
  const name=String(input.name||'').trim().slice(0,180);
  const slug=String(input.slug||'').trim().toLowerCase().replace(/[^a-z0-9\-]+/g,'-').replace(/^-+|-+$/g,'');
  const code=cleanProductCode(input.code);
  if(!name||!slug) throw Object.assign(new Error('Nome e slug são obrigatórios.'),{status:400});
  if(!code) throw Object.assign(new Error('Informe o código comercial do produto (ex.: 147 ou V147).'),{status:400});
  const categoryId=String(input.categoryId||'');
  if(!await dbGet('SELECT id FROM categories WHERE id=?',[categoryId])) throw Object.assign(new Error('Categoria inválida.'),{status:400});
  const duplicate=await dbGet('SELECT id FROM products WHERE UPPER(product_code)=? AND id<>?',[code,String(input.id||'')]);
  if(duplicate) throw Object.assign(new Error(`O código #${code} já está cadastrado em outro produto.`),{status:409});
  const slugDuplicate=await dbGet('SELECT id FROM products WHERE slug=? AND id<>?',[slug,String(input.id||'')]);
  if(slugDuplicate) throw Object.assign(new Error('Esta URL/slug já está em uso por outro produto.'),{status:409});
  return {
    name,slug,code,categoryId,subcategory:String(input.subcategory||'').trim().slice(0,100),
    description:String(input.description||'').trim().slice(0,5000),material:String(input.material||'').trim().slice(0,500),
    brand:String(input.brand||'Geise').trim().slice(0,120),featured:input.featured?1:0,isNew:input.isNew?1:0,
    status:['active','draft','archived'].includes(input.status)?input.status:'active',showWhenOutOfStock:input.showWhenOutOfStock===false?0:1,
    tags:Array.isArray(input.tags)?input.tags.map(x=>String(x).trim().slice(0,50)).filter(Boolean).slice(0,30):[],
    badges:cleanBadges(input.badges),seoTitle:String(input.seoTitle||name).trim().slice(0,180),seoDescription:String(input.seoDescription||input.description||'').trim().slice(0,300)
  };
}

export async function saveProduct(input,{actorUserId,ip=''}){
  const clean=await cleanProductInput(input); const now=nowIso(); const existing=input.id?await getProductById(input.id,true,true):null; const id=existing?.id||makeId('prod_');
  const variants=Array.isArray(input.variants)?input.variants:[]; if(!variants.length) throw Object.assign(new Error('Cadastre ao menos uma variação.'),{status:400});
  await transaction(async()=>{
    if(existing){
      await dbRun(`UPDATE products SET slug=?,name=?,product_code=?,category_id=?,subcategory=?,description=?,material=?,brand=?,featured=?,is_new=?,status=?,tags_json=?,badges_json=?,show_when_out_of_stock=?,seo_title=?,seo_description=?,updated_at=? WHERE id=?`,[clean.slug,clean.name,clean.code,clean.categoryId,clean.subcategory,clean.description,clean.material,clean.brand,clean.featured,clean.isNew,clean.status,JSON.stringify(clean.tags),JSON.stringify(clean.badges),clean.showWhenOutOfStock,clean.seoTitle,clean.seoDescription,now,id]);
    }else{
      await dbRun(`INSERT INTO products (id,slug,name,product_code,category_id,subcategory,description,material,brand,featured,is_new,status,tags_json,badges_json,show_when_out_of_stock,seo_title,seo_description,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[id,clean.slug,clean.name,clean.code,clean.categoryId,clean.subcategory,clean.description,clean.material,clean.brand,clean.featured,clean.isNew,clean.status,JSON.stringify(clean.tags),JSON.stringify(clean.badges),clean.showWhenOutOfStock,clean.seoTitle,clean.seoDescription,now,now]);
    }
    const seen=[];
    for(const v of variants){
      const validExisting=v.id?await dbGet('SELECT * FROM product_variants WHERE id=? AND product_id=?',[v.id,id]):null;
      const vid=validExisting?v.id:makeId('var_');seen.push(vid);
      const sku=String(v.sku||'').trim().toUpperCase().slice(0,80); if(!sku) throw Object.assign(new Error('Toda variação precisa de SKU.'),{status:400});
      const skuDuplicate=await dbGet('SELECT id FROM product_variants WHERE UPPER(sku)=? AND id<>?',[sku,vid]);if(skuDuplicate)throw Object.assign(new Error(`O SKU ${sku} já está em uso.`),{status:409});
      const price=Math.max(0,Math.round(Number(v.priceCents)||0));if(price<=0)throw Object.assign(new Error('O preço da variação deve ser maior que zero.'),{status:400});
      const sale=v.salePriceCents===null||v.salePriceCents===''?null:Math.max(0,Math.round(Number(v.salePriceCents)||0));
      if(sale!=null&&sale>=price)throw Object.assign(new Error('O preço promocional precisa ser menor que o preço original.'),{status:400});
      const nextStock=Math.max(0,Math.floor(Number(v.stock)||0));
      if(validExisting && nextStock<Number(validExisting.reserved||0)) throw Object.assign(new Error(`O estoque do SKU ${sku} não pode ficar abaixo das ${validExisting.reserved} unidade(s) reservadas.`),{status:409});
      const finiteOr=(value,fallback)=>Number.isFinite(Number(value))?Number(value):Number(fallback);
      const lowStockThreshold=Math.max(0,Math.floor(finiteOr(v.lowStockThreshold,validExisting?.low_stock_threshold??3)));
      const weightGrams=Math.max(1,Math.floor(finiteOr(v.weightGrams,validExisting?.weight_grams??300)));
      const lengthCm=Math.max(0.1,finiteOr(v.lengthCm,validExisting?.length_cm??20));
      const widthCm=Math.max(0.1,finiteOr(v.widthCm,validExisting?.width_cm??15));
      const heightCm=Math.max(0.1,finiteOr(v.heightCm,validExisting?.height_cm??5));
      const color=String(v.color||'Único').trim().slice(0,60);
      const size=String(v.size||'Único').trim().slice(0,30);
      const imageUrl=sanitizePublicUrl(v.imageUrl)||'/assets/images/demo/placeholder.svg';
      const active=v.active===false?0:1;
      if(validExisting) {
        await dbRun(`UPDATE product_variants SET sku=?,color=?,size=?,price_cents=?,sale_price_cents=?,stock=?,low_stock_threshold=?,weight_grams=?,length_cm=?,width_cm=?,height_cm=?,image_url=?,active=?,updated_at=? WHERE id=?`,[sku,color,size,price,sale,nextStock,lowStockThreshold,weightGrams,lengthCm,widthCm,heightCm,imageUrl,active,now,vid]);
        if(Number(validExisting.stock)!==nextStock) await dbRun('INSERT INTO inventory_movements (id,variant_id,type,quantity,stock_before,stock_after,note,actor_user_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)',[makeId('mov_'),vid,'PRODUCT_EDIT',nextStock-Number(validExisting.stock),Number(validExisting.stock),nextStock,'Estoque alterado pelo editor de produto',actorUserId,now]);
      } else await dbRun(`INSERT INTO product_variants (id,product_id,sku,color,size,price_cents,sale_price_cents,stock,reserved,low_stock_threshold,weight_grams,length_cm,width_cm,height_cm,image_url,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,0,?,?,?,?,?,?,?,?,?)`,[vid,id,sku,color,size,price,sale,nextStock,lowStockThreshold,weightGrams,lengthCm,widthCm,heightCm,imageUrl,active,now,now]);
    }
    const existingVariants=await dbAll('SELECT id FROM product_variants WHERE product_id=?',[id]);
    for(const v of existingVariants) if(!seen.includes(v.id)) await dbRun('UPDATE product_variants SET active=0,updated_at=? WHERE id=?',[now,v.id]);
  });
  const after=await getProductById(id,true,true); await audit({actorUserId,action:existing?'product.update':'product.create',entityType:'product',entityId:id,before:existing,after,ip}); return after;
}

export async function archiveProduct(id,ctx){const before=await getProductById(id,true,true);if(!before)throw Object.assign(new Error('Produto não encontrado.'),{status:404});await dbRun("UPDATE products SET status='archived',updated_at=? WHERE id=?",[nowIso(),id]);await audit({...ctx,action:'product.archive',entityType:'product',entityId:id,before,after:await getProductById(id,true,true)});return {ok:true};}

export async function adjustStock({variantId,delta,note=''},{actorUserId,ip=''}){
  const row=await dbGet('SELECT * FROM product_variants WHERE id=?',[variantId]);if(!row)throw Object.assign(new Error('Variação não encontrada.'),{status:404});
  const change=Math.trunc(Number(delta)||0); if(!change)throw Object.assign(new Error('Informe uma quantidade diferente de zero.'),{status:400});
  const next=Number(row.stock)+change; if(next<Number(row.reserved))throw Object.assign(new Error('O estoque não pode ficar abaixo da quantidade já reservada.'),{status:409});
  await dbRun('UPDATE product_variants SET stock=?,updated_at=? WHERE id=?',[next,nowIso(),variantId]);
  await dbRun('INSERT INTO inventory_movements (id,variant_id,type,quantity,stock_before,stock_after,note,actor_user_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)',[makeId('mov_'),variantId,'MANUAL_ADJUST',change,row.stock,next,String(note).slice(0,500),actorUserId,nowIso()]);
  await audit({actorUserId,action:'inventory.adjust',entityType:'variant',entityId:variantId,before:{stock:row.stock},after:{stock:next},ip});return {variantId,stock:next,reserved:Number(row.reserved),available:next-Number(row.reserved)};
}

export async function listCoupons(){return (await dbAll('SELECT * FROM coupons ORDER BY created_at DESC')).map(c=>({...c,active:Boolean(c.active),firstPurchaseOnly:Boolean(c.first_purchase_only)}));}
export async function saveCoupon(input,{actorUserId,ip=''}){
  const now=nowIso();const id=input.id||makeId('cpn_');const before=input.id?await dbGet('SELECT * FROM coupons WHERE id=?',[id]):null;
  const values={code:String(input.code||'').trim().toUpperCase().slice(0,40),type:['percent','fixed','free_shipping'].includes(input.type)?input.type:'percent',value:Math.max(0,Math.round(Number(input.value)||0)),startsAt:input.startsAt||null,expiresAt:input.expiresAt||null,maxUses:input.maxUses===''||input.maxUses==null?null:Math.max(1,Math.floor(Number(input.maxUses))),perCustomer:Math.max(1,Math.floor(Number(input.maxUsesPerCustomer)||1)),min:Math.max(0,Math.round(Number(input.minSubtotalCents)||0)),first:input.firstPurchaseOnly?1:0,active:input.active===false?0:1};
  if(!values.code)throw Object.assign(new Error('Código do cupom é obrigatório.'),{status:400});
  if(values.type==='percent'&&(values.value<=0||values.value>100))throw Object.assign(new Error('Percentual do cupom deve ficar entre 1 e 100.'),{status:400});
  if(before)await dbRun(`UPDATE coupons SET code=?,type=?,value=?,starts_at=?,expires_at=?,max_uses=?,max_uses_per_customer=?,min_subtotal_cents=?,first_purchase_only=?,active=?,updated_at=? WHERE id=?`,[values.code,values.type,values.value,values.startsAt,values.expiresAt,values.maxUses,values.perCustomer,values.min,values.first,values.active,now,id]);
  else await dbRun(`INSERT INTO coupons (id,code,type,value,starts_at,expires_at,max_uses,max_uses_per_customer,min_subtotal_cents,first_purchase_only,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,[id,values.code,values.type,values.value,values.startsAt,values.expiresAt,values.maxUses,values.perCustomer,values.min,values.first,values.active,now,now]);
  const after=await dbGet('SELECT * FROM coupons WHERE id=?',[id]);await audit({actorUserId,action:before?'coupon.update':'coupon.create',entityType:'coupon',entityId:id,before,after,ip});return after;
}

export async function listBadgeTemplates(){return (await dbAll('SELECT * FROM badge_templates ORDER BY priority DESC,name')).map(x=>({...x,active:Boolean(x.active)}));}
export async function saveBadgeTemplate(input,{actorUserId,ip=''}){
  const now=nowIso(),id=input.id||makeId('bdg_');const before=input.id?await dbGet('SELECT * FROM badge_templates WHERE id=?',[id]):null;
  const data={name:String(input.name||input.label||'Selo').trim().slice(0,80),label:String(input.label||'').trim().slice(0,40),background:safeHex(input.background,'#92278f'),foreground:safeHex(input.foreground,'#ffffff'),borderColor:safeHex(input.borderColor,'')||null,icon:String(input.icon||'').trim().slice(0,30),animation:['none','pulse','glow','shimmer','float','zoom','slide','gradient'].includes(input.animation)?input.animation:'none',position:['top-left','top-right','bottom-left','bottom-right','name'].includes(input.position)?input.position:'top-left',priority:Math.max(-100,Math.min(100,Math.trunc(Number(input.priority)||0))),active:input.active===false?0:1};
  if(!data.label)throw Object.assign(new Error('Texto do selo é obrigatório.'),{status:400});
  if(before)await dbRun('UPDATE badge_templates SET name=?,label=?,background=?,foreground=?,border_color=?,icon=?,animation=?,position=?,priority=?,active=?,updated_at=? WHERE id=?',[data.name,data.label,data.background,data.foreground,data.borderColor,data.icon,data.animation,data.position,data.priority,data.active,now,id]);
  else await dbRun('INSERT INTO badge_templates (id,name,label,background,foreground,border_color,icon,animation,position,priority,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?, ?,?)',[id,data.name,data.label,data.background,data.foreground,data.borderColor,data.icon,data.animation,data.position,data.priority,data.active,now,now]);
  const after=await dbGet('SELECT * FROM badge_templates WHERE id=?',[id]);await audit({actorUserId,action:before?'badge.update':'badge.create',entityType:'badge_template',entityId:id,before,after,ip});return after;
}

export async function listCustomers(){return dbAll(`SELECT u.id,u.name,CASE WHEN u.email LIKE '%@cliente.lojageise.invalid' THEN '' ELSE u.email END email,u.phone,u.created_at,COUNT(o.id) orders_count,COALESCE(SUM(CASE WHEN o.payment_status='paid' THEN o.total_cents ELSE 0 END),0) lifetime_value_cents FROM users u LEFT JOIN orders o ON o.user_id=u.id WHERE u.role='customer' GROUP BY u.id,u.name,u.email,u.phone,u.created_at ORDER BY u.created_at DESC LIMIT 500`);}
export async function listInventory(){return dbAll(`SELECT v.id variant_id,p.name product_name,p.product_code,p.slug,v.sku,v.color,v.size,v.stock,v.reserved,(v.stock-v.reserved) available,v.low_stock_threshold FROM product_variants v JOIN products p ON p.id=v.product_id WHERE p.status!='archived' ORDER BY available ASC,p.name`);}
export async function listAudit(){return dbAll(`SELECT a.*,u.name actor_name,u.email actor_email FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_user_id ORDER BY a.created_at DESC LIMIT 300`);}
export async function listProductsAdmin(){return (await listProducts({limit:500},{includeInactive:true,allBadges:true})).items;}
export async function listReviewsAdmin(){return dbAll(`SELECT r.*,p.name product_name,u.name customer_name FROM reviews r JOIN products p ON p.id=r.product_id LEFT JOIN users u ON u.id=r.user_id ORDER BY r.created_at DESC LIMIT 300`);}
export async function moderateReview(id,status,{actorUserId,ip=''}){if(!['approved','rejected'].includes(status))throw Object.assign(new Error('Status de avaliação inválido.'),{status:400});const before=await dbGet('SELECT * FROM reviews WHERE id=?',[id]);if(!before)throw Object.assign(new Error('Avaliação não encontrada.'),{status:404});await dbRun('UPDATE reviews SET status=?,updated_at=? WHERE id=?',[status,nowIso(),id]);await recomputeRating(before.product_id);await audit({actorUserId,action:'review.moderate',entityType:'review',entityId:id,before,after:{...before,status},ip});return {ok:true};}
async function recomputeRating(productId){const r=await dbGet("SELECT AVG(rating) avg,COUNT(*) n FROM reviews WHERE product_id=? AND status='approved'",[productId]);await dbRun('UPDATE products SET rating_avg=?,review_count=?,updated_at=? WHERE id=?',[Number(r?.avg||0),Number(r?.n||0),nowIso(),productId]);}

export async function getSettings(){const rows=await dbAll('SELECT key,value_json FROM settings');return Object.fromEntries(rows.map(r=>{try{return [r.key,JSON.parse(r.value_json)];}catch{return [r.key,{}];}}));}
function cleanStoreSettings(value={}){
  const text=(v,max=250)=>String(v||'').trim().slice(0,max);
  const email=text(value.email,200).toLowerCase();
  return {
    name:text(value.name,120)||'Geise Confecções',monogram:text(value.monogram,8)||'GC',tagline:text(value.tagline,220),
    logoUrl:sanitizePublicUrl(value.logoUrl),whatsapp:text(value.whatsapp,40),phone:text(value.phone,40),email:isValidEmail(email)?email:'',
    hours:text(value.hours,240),address:text(value.address,400),mapUrl:sanitizePublicUrl(value.mapUrl,{allowRelative:false}),
    instagram:sanitizePublicUrl(value.instagram,{allowRelative:false}),facebook:sanitizePublicUrl(value.facebook,{allowRelative:false}),tiktok:sanitizePublicUrl(value.tiktok,{allowRelative:false}),
    legalName:text(value.legalName,180),cnpj:text(value.cnpj,30),domain:sanitizePublicUrl(value.domain,{allowRelative:false}),
    primary:safeHex(value.primary,'#7a294c'),accent:safeHex(value.accent,'#c46b8f')
  };
}
export async function saveSettings(key,value,{actorUserId,ip=''}){
  const normalizedKey=String(key||'').trim();if(!['store','commerce','features','ai'].includes(normalizedKey))throw Object.assign(new Error('Grupo de configurações inválido.'),{status:400});
  const before=await dbGet('SELECT value_json FROM settings WHERE key=?',[normalizedKey]);
  const safeValue=normalizedKey==='store'?cleanStoreSettings(value):value;
  const serialized=JSON.stringify(safeValue);if(serialized.length>50000)throw Object.assign(new Error('Configuração muito grande.'),{status:413});
  await dbRun(`INSERT INTO settings (key,value_json,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at`,[normalizedKey,serialized,nowIso()]);
  let beforeValue=null;try{beforeValue=before?JSON.parse(before.value_json):null;}catch{}
  await audit({actorUserId,action:'settings.update',entityType:'settings',entityId:normalizedKey,before:beforeValue,after:safeValue,ip});return {ok:true};
}

export const __adminTest = Object.freeze({ cleanProductCode, cleanBadges, cleanStoreSettings });
