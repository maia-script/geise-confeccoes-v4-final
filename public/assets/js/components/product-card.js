import { esc,money,percentDiscount } from '../core/utils.js';
import { state } from '../core/store.js';
import { icon } from '../core/icons.js';

function badgeHtml(b){
  const style=`--badge-bg:${esc(b.background||'#92278f')};--badge-fg:${esc(b.foreground||'#fff')};--badge-border:${esc(b.borderColor||'transparent')}`;
  const glyph=b.icon?icon(b.icon==='sparkles'?'spark':b.icon):'';
  return `<span class="badge custom-badge badge-anim-${esc(b.animation||'none')}" style="${style}" title="${esc(b.label)}">${glyph}${esc(b.label)}</span>`;
}
function badgesFor(p){
  const discount=percentDiscount(p);const list=[...(p.badges||[])];
  if(discount)list.push({label:`-${discount}%`,background:'#b43755',foreground:'#fff',animation:'none',position:'top-right',priority:90});
  if(p.isNew)list.push({label:'NOVO',background:'#92278f',foreground:'#fff',animation:'shimmer',position:'top-left',priority:70});
  if(p.stock>0&&p.stock<=4)list.push({label:'ÚLTIMAS UNIDADES',background:'#4f3a55',foreground:'#fff',animation:'pulse',position:'top-right',priority:100});
  if(p.stock<=0)list.push({label:'ESGOTADO',background:'#6a6266',foreground:'#fff',animation:'none',position:'top-left',priority:110});
  const seen=new Set();
  return list.sort((a,b)=>(b.priority||0)-(a.priority||0)).filter(b=>{const k=`${b.position||'top-left'}:${String(b.label||'').toUpperCase()}`;if(seen.has(k))return false;seen.add(k);return true;}).slice(0,3);
}
function positionedBadges(badges){
  const positions=['top-left','top-right','bottom-left','bottom-right'];
  return positions.map(pos=>{const list=badges.filter(b=>(b.position||'top-left')===pos);return list.length?`<div class="badges badge-pos-${pos}">${list.map(badgeHtml).join('')}</div>`:''}).join('');
}

export function productCard(p){
  const fav=state.favorites.includes(p.id);const badges=badgesFor(p);const mediaBadges=badges.filter(b=>b.position!=='name');const nameBadges=badges.filter(b=>b.position==='name');
  const installments=Math.max(1,Number(state.config?.commerce?.maxInstallments||6));
  const rating=p.reviewCount>0?`<div class="rating">★ ${Number(p.rating||0).toFixed(1)} <span class="muted">(${p.reviewCount})</span></div>`:'<div class="rating muted">Ainda sem avaliações</div>';
  return `<article class="product-card" data-product="${esc(p.id)}"><div class="product-media"><a href="/produto/${encodeURIComponent(p.slug)}" data-link><img src="${esc(p.imageUrl)}" alt="${esc(p.name)}" width="800" height="1000" loading="lazy" decoding="async"></a>${positionedBadges(mediaBadges)}<button class="icon-btn fav-btn" data-favorite="${esc(p.id)}" aria-label="${fav?'Remover dos favoritos':'Adicionar aos favoritos'}">${icon('heart')}</button></div><div class="product-info"><div class="product-meta-line"><span class="category">${esc(p.category?.name||'')}</span>${p.code?`<span class="product-code">#${esc(p.code)}</span>`:''}</div><h3><a href="/produto/${encodeURIComponent(p.slug)}" data-link>${esc(p.name)}</a>${nameBadges.map(badgeHtml).join('')}</h3>${rating}<div class="price-line">${p.originalPriceCents>p.priceCents?`<span class="old-price">${money(p.originalPriceCents)}</span>`:''}<span class="price">${money(p.priceCents)}</span></div><div class="installments">parcelamento em até ${installments}x conforme a forma de pagamento</div></div></article>`;
}
