import { dbAll, dbGet, jsonValue } from '../db/index.mjs';

function cleanCode(value) {
  return String(value || '').trim().replace(/^#+/, '').toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 40);
}

function variantDto(v) {
  return {
    id:v.id, sku:v.sku, color:v.color, size:v.size,
    priceCents:Number(v.price_cents), salePriceCents:v.sale_price_cents == null ? null : Number(v.sale_price_cents),
    stock:Number(v.stock), reserved:Number(v.reserved), available:Math.max(0, Number(v.stock) - Number(v.reserved)),
    lowStock:Number(v.stock) - Number(v.reserved) <= Number(v.low_stock_threshold) && Number(v.stock) - Number(v.reserved) > 0,
    lowStockThreshold:Number(v.low_stock_threshold), weightGrams:Number(v.weight_grams),
    dimensions:{ lengthCm:Number(v.length_cm), widthCm:Number(v.width_cm), heightCm:Number(v.height_cm) },
    imageUrl:v.image_url, active:Boolean(v.active)
  };
}

function normalizeBadge(raw) {
  const allowedAnimations = new Set(['none','pulse','glow','shimmer','float','zoom','slide','gradient']);
  const allowedPositions = new Set(['top-left','top-right','bottom-left','bottom-right','name']);
  const safeColor = (v, fallback) => /^#[0-9a-f]{3,8}$/i.test(String(v||'')) ? String(v) : fallback;
  return {
    label:String(raw?.label||'').trim().slice(0,40),
    icon:String(raw?.icon||'').trim().slice(0,30),
    background:safeColor(raw?.background,'#92278f'),
    foreground:safeColor(raw?.foreground,'#ffffff'),
    borderColor:safeColor(raw?.borderColor,'') || '',
    animation:allowedAnimations.has(raw?.animation) ? raw.animation : 'none',
    position:allowedPositions.has(raw?.position) ? raw.position : 'top-left',
    priority:Math.max(-100,Math.min(100,Math.trunc(Number(raw?.priority)||0))),
    startsAt:raw?.startsAt||null,
    endsAt:raw?.endsAt||null,
    enabled:raw?.enabled !== false
  };
}

function activeBadges(row) {
  const now = Date.now();
  return jsonValue(row.badges_json, [])
    .map(normalizeBadge)
    .filter(b => b.label && b.enabled && (!b.startsAt || Date.parse(b.startsAt) <= now) && (!b.endsAt || Date.parse(b.endsAt) >= now))
    .sort((a,b)=>b.priority-a.priority)
    .slice(0,8);
}

export async function productDto(row, variants = null, { allBadges = false } = {}) {
  if (!row) return null;
  const list = variants || await dbAll('SELECT * FROM product_variants WHERE product_id=? AND active=1 ORDER BY color,size',[row.id]);
  const available = list.reduce((sum, v) => sum + Math.max(0, Number(v.stock) - Number(v.reserved)), 0);
  const prices = list.filter(v=>v.active).map(v => Number(v.sale_price_cents ?? v.price_cents));
  const originalPrices = list.filter(v=>v.active).map(v => Number(v.price_cents));
  return {
    id:row.id, slug:row.slug, code:row.product_code || '', name:row.name,
    category:{ id:row.category_id, slug:row.category_slug, name:row.category_name }, subcategory:row.subcategory || '',
    description:row.description, material:row.material || '', brand:row.brand,
    featured:Boolean(row.featured), isNew:Boolean(row.is_new), status:row.status,
    rating:Number(row.rating_avg || 0), reviewCount:Number(row.review_count || 0), tags:jsonValue(row.tags_json, []),
    badges:allBadges ? jsonValue(row.badges_json, []).map(normalizeBadge).filter(b=>b.label) : activeBadges(row), showWhenOutOfStock:Boolean(row.show_when_out_of_stock),
    seo:{ title:row.seo_title || row.name, description:row.seo_description || row.description },
    priceCents:prices.length ? Math.min(...prices) : 0,
    originalPriceCents:originalPrices.length ? Math.min(...originalPrices) : 0,
    stock:available,
    colors:[...new Set(list.map(v=>v.color))], sizes:[...new Set(list.map(v=>v.size))],
    imageUrl:list.find(v=>v.image_url)?.image_url || '/assets/images/demo/placeholder.svg',
    variants:list.map(variantDto), createdAt:row.created_at, updatedAt:row.updated_at
  };
}

const baseSql = `SELECT p.*,c.slug AS category_slug,c.name AS category_name FROM products p LEFT JOIN categories c ON c.id=p.category_id`;

export async function getProductBySlug(slug, includeInactive = false) {
  const row = await dbGet(`${baseSql} WHERE p.slug=? ${includeInactive ? '' : "AND p.status='active'"}`,[slug]);
  return productDto(row);
}

export async function getProductById(id, includeInactive = false, allBadges = false) {
  const row = await dbGet(`${baseSql} WHERE p.id=? ${includeInactive ? '' : "AND p.status='active'"}`,[id]);
  return productDto(row,null,{allBadges});
}

export async function getProductByCode(code, includeInactive = false) {
  const normalized = cleanCode(code);
  if (!normalized) return null;
  const row = await dbGet(`${baseSql} WHERE UPPER(p.product_code)=? ${includeInactive ? '' : "AND p.status='active'"}`,[normalized]);
  return productDto(row);
}

export async function getVariant(id) {
  const v = await dbGet(`SELECT v.*,p.name AS product_name,p.slug AS product_slug,p.product_code,p.id AS product_id_real,p.status AS product_status FROM product_variants v JOIN products p ON p.id=v.product_id WHERE v.id=?`,[id]);
  return v ? { ...variantDto(v), productId:v.product_id_real, productName:v.product_name, productSlug:v.product_slug, productCode:v.product_code||'', productStatus:v.product_status } : null;
}

export async function listCategories() {
  const rows=await dbAll(`SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id=c.id AND p.status='active') product_count FROM categories c WHERE c.active=1 ORDER BY c.sort_order,c.name`);
  return rows.map(c=>({id:c.id,slug:c.slug,name:c.name,description:c.description||'',imageUrl:c.image_url||'',productCount:Number(c.product_count||0)}));
}

function fold(text) { return String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(); }

export async function listProducts(params = {}, { includeInactive = false, allBadges = false } = {}) {
  const rows = await dbAll(`${baseSql} ${includeInactive ? '' : "WHERE p.status='active'"} ORDER BY p.featured DESC,p.created_at DESC`);
  let items = await Promise.all(rows.map(row=>productDto(row,null,{allBadges})));
  const rawQ = String(params.q || '').trim();
  const codeQuery = rawQ.startsWith('#') ? cleanCode(rawQ) : '';
  const q = fold(rawQ);
  if (codeQuery) items = items.filter(p => cleanCode(p.code) === codeQuery);
  else if (q) items = items.filter(p => fold([p.code ? `#${p.code}` : '',p.name,p.description,p.category?.name,p.subcategory,p.brand,...p.tags].join(' ')).includes(q));
  if (params.code) items = items.filter(p=>cleanCode(p.code)===cleanCode(params.code));
  if (params.category) items = items.filter(p=>p.category?.slug===params.category);
  if (params.size) items = items.filter(p=>p.sizes.some(x=>fold(x)===fold(params.size)));
  if (params.color) items = items.filter(p=>fold(p.colors.join(' ')).includes(fold(params.color)));
  if (params.brand) items = items.filter(p=>fold(p.brand)===fold(params.brand));
  if (params.new === '1' || params.new === true) items = items.filter(p=>p.isNew);
  if (params.sale === '1' || params.sale === true) items = items.filter(p=>p.variants.some(v=>v.salePriceCents != null && v.salePriceCents < v.priceCents));
  if (params.available === '1' || params.available === true) items = items.filter(p=>p.stock>0);
  if (!includeInactive) items = items.filter(p=>p.stock>0 || p.showWhenOutOfStock);
  const min = Number(params.min); const max = Number(params.max);
  if (Number.isFinite(min) && min > 0) items = items.filter(p=>p.priceCents >= Math.round(min*100));
  if (Number.isFinite(max) && max > 0) items = items.filter(p=>p.priceCents <= Math.round(max*100));
  switch(params.sort){
    case 'price-asc':items.sort((a,b)=>a.priceCents-b.priceCents);break;
    case 'price-desc':items.sort((a,b)=>b.priceCents-a.priceCents);break;
    case 'rating':items.sort((a,b)=>b.rating-a.rating);break;
    case 'discount':items.sort((a,b)=>discountOf(b)-discountOf(a));break;
    case 'newest':items.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));break;
    case 'popular':items.sort((a,b)=>b.reviewCount-a.reviewCount);break;
    default:items.sort((a,b)=>(Number(b.featured)-Number(a.featured)) || b.rating-a.rating);
  }
  const total = items.length;
  const page = Math.max(1, Number(params.page)||1); const limit = Math.min(60, Math.max(1, Number(params.limit)||24));
  items = items.slice((page-1)*limit, page*limit);
  return { items, pagination:{page,limit,total,pages:Math.ceil(total/limit)} };
}

function discountOf(p){
  const best = p.variants.map(v=>v.salePriceCents!=null&&v.salePriceCents<v.priceCents ? 1-v.salePriceCents/v.priceCents : 0);
  return best.length ? Math.max(...best) : 0;
}

export async function suggestions(query) {
  const raw = String(query||'').trim();
  if(!raw) return [];
  const result=await listProducts({q:raw,limit:8});
  return result.items.slice(0,8).map(p=>({id:p.id,slug:p.slug,code:p.code,name:p.name,imageUrl:p.imageUrl,priceCents:p.priceCents,category:p.category?.name||''}));
}

export async function productReviews(productId) {
  const rows=await dbAll(`SELECT r.id,r.rating,r.title,r.body,r.image_urls_json,r.verified_purchase,r.created_at,u.name FROM reviews r LEFT JOIN users u ON u.id=r.user_id WHERE r.product_id=? AND r.status='approved' ORDER BY r.created_at DESC LIMIT 100`,[productId]);
  return rows.map(r=>({id:r.id,rating:r.rating,title:r.title||'',body:r.body,name:r.name||'Cliente',images:jsonValue(r.image_urls_json,[]),verifiedPurchase:Boolean(r.verified_purchase),createdAt:r.created_at}));
}

export const __catalogTest = Object.freeze({ cleanCode, normalizeBadge });
