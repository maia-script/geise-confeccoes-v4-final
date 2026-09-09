export const $=(selector,root=document)=>root.querySelector(selector);
export const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
export const esc=(value='')=>String(value).replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
export const money=cents=>(Number(cents||0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export const dateBR=value=>value?new Intl.DateTimeFormat('pt-BR',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)):'—';
export const slugify=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
export const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
export const debounce=(fn,wait=220)=>{let t;return(...args)=>{clearTimeout(t);t=setTimeout(()=>fn(...args),wait);};};
export const uid=()=>crypto.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function safeUrl(value,{allowRelative=true}={}){const raw=String(value||'').trim();if(!raw)return '';if(allowRelative&&raw.startsWith('/')&&!raw.startsWith('//'))return raw;try{const u=new URL(raw,location.origin);if(u.protocol==='https:'&&(u.origin!==location.origin||raw.startsWith('https://')))return u.href;if(allowRelative&&u.origin===location.origin)return u.pathname+u.search+u.hash;}catch{}return '';}

export function toast(message,type=''){const region=$('#toastRegion');if(!region)return;const el=document.createElement('div');el.className=`toast ${type}`;el.textContent=message;region.appendChild(el);setTimeout(()=>el.remove(),3200);}
export function percentDiscount(product){const values=(product.variants||[]).map(v=>v.salePriceCents!=null&&v.salePriceCents<v.priceCents?Math.round((1-v.salePriceCents/v.priceCents)*100):0);return values.length?Math.max(...values):0;}
export function statusLabel(status){return ({PENDING_PAYMENT:'Aguardando pagamento',PAID:'Pago',PREPARING:'Em preparação',READY_PICKUP:'Pronto para retirada',SHIPPED:'Enviado',DELIVERED:'Entregue',CANCELLED:'Cancelado',REFUNDED:'Reembolsado'})[status]||status;}
export function onlyDigits(v){return String(v||'').replace(/\D/g,'');}
export function maskCep(v){const d=onlyDigits(v).slice(0,8);return d.length>5?`${d.slice(0,5)}-${d.slice(5)}`:d;}
export function maskPhone(v){const d=onlyDigits(v).slice(0,11);if(d.length<=2)return d;if(d.length<=7)return `(${d.slice(0,2)}) ${d.slice(2)}`;return `(${d.slice(0,2)}) ${d.slice(2,d.length-4)}-${d.slice(-4)}`;}
export function maskCpf(v){const d=onlyDigits(v).slice(0,11);return d.replace(/^(\d{3})(\d)/,'$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/,'$1.$2.$3').replace(/\.(\d{3})(\d)/,'.$1-$2');}
export function setSeo({title='Geise Confecções',description='Moda, acessórios e variedades.',image='',canonical=location.pathname,schema=null}={}){document.title=title.includes('Geise')?title:`${title} | Geise Confecções`;let meta=document.querySelector('meta[name="description"]');if(meta)meta.content=description;let link=document.querySelector('link[rel="canonical"]');if(!link){link=document.createElement('link');link.rel='canonical';document.head.appendChild(link);}link.href=new URL(canonical,location.origin).href;for(const [prop,val] of [['og:title',document.title],['og:description',description],['og:url',link.href],['og:image',image?new URL(image,location.origin).href:'']]){let el=document.querySelector(`meta[property="${prop}"]`);if(!el){el=document.createElement('meta');el.setAttribute('property',prop);document.head.appendChild(el);}el.content=val;}document.querySelector('#pageSchema')?.remove();if(schema){const script=document.createElement('script');script.type='application/ld+json';script.id='pageSchema';script.textContent=JSON.stringify(schema);document.head.appendChild(script);}}
export function pageHero(title,subtitle='',eyebrow='Geise Confecções'){return `<section class="page-hero"><div class="container"><div class="eyebrow">${esc(eyebrow)}</div><h1>${esc(title)}</h1>${subtitle?`<p class="muted">${esc(subtitle)}</p>`:''}</div></section>`;}
export function emptyState(title,text,href='/catalogo',cta='Ver catálogo'){return `<div class="empty-state"><span data-icon="bag"></span><h2>${esc(title)}</h2><p class="muted">${esc(text)}</p><a class="btn btn-primary" href="${href}" data-link>${esc(cta)}</a></div>`;}
