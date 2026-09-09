import { api } from '../core/api.js';
import { $, $$, debounce, esc, money, safeUrl, toast } from '../core/utils.js';
import { hydrateIcons } from '../core/icons.js';
import { navigate } from '../core/router.js';
import { cartCount, state } from '../core/store.js';

export async function renderShell(){
  $('#year').textContent=new Date().getFullYear();
  const cats=(await api('/api/catalog/categories')).items;
  const links=[...cats.map(c=>({href:`/categoria/${encodeURIComponent(c.slug)}`,label:c.name})),{href:'/promocoes',label:'Promoções'},{href:'/novidades',label:'Novidades'}];
  $('#categoryNav').innerHTML=links.map(x=>`<a href="${x.href}" data-link>${esc(x.label)}</a>`).join('');
  $('#mobileMenuLinks').innerHTML=[{href:'/',label:'Início'},{href:'/catalogo',label:'Catálogo'},...links,{href:'/minha-conta',label:'Minha conta'},{href:'/pedidos',label:'Pedidos'},{href:'/contato',label:'Contato'}].map(x=>`<a href="${x.href}" data-link>${esc(x.label)}</a>`).join('');
  applyStoreConfig();hydrateIcons();bindShell();updateCounts();
}

function applyStoreConfig(){
  const s=state.config?.store||{};
  const name=s.name||'Geise Confecções';
  document.querySelectorAll('.brand').forEach(el=>el.setAttribute('aria-label',`${name} — início`));
  document.querySelectorAll('.brand-mark').forEach(mark=>{
    if(safeUrl(s.logoUrl)){mark.innerHTML=`<img src="${esc(safeUrl(s.logoUrl))}" alt="" style="width:100%;height:100%;object-fit:contain;border-radius:inherit">`;}
    else mark.textContent=s.monogram||'GC';
  });
  const tagline=$('#footerTagline');if(tagline)tagline.textContent=s.tagline||'Moda, variedades e atendimento feito para você.';
  const contact=$('#footerContact');if(contact){const parts=[];if(s.whatsapp)parts.push(`<a href="https://wa.me/${String(s.whatsapp).replace(/\D/g,'')}" target="_blank" rel="noopener">WhatsApp</a>`);if(s.phone)parts.push(`<a href="tel:${String(s.phone).replace(/[^+\d]/g,'')}">${esc(s.phone)}</a>`);if(s.email)parts.push(`<a href="mailto:${esc(s.email)}">${esc(s.email)}</a>`);contact.innerHTML=parts.join(' · ');}
  const social=$('#footerSocial');if(social){const links=[['Instagram',s.instagram],['Facebook',s.facebook],['TikTok',s.tiktok]].map(([label,url])=>[label,safeUrl(url,{allowRelative:false})]).filter(([,url])=>url);social.innerHTML=links.map(([label,url])=>`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`).join(' · ');}
}

function bindShell(){
  const menu=$('#mobileMenu'),backdrop=$('#backdrop');const setMenu=open=>{menu.classList.toggle('open',open);menu.setAttribute('aria-hidden',String(!open));$('#menuButton').setAttribute('aria-expanded',String(open));backdrop.hidden=!open;};
  $('#menuButton').onclick=()=>setMenu(true);$('#menuClose').onclick=()=>setMenu(false);backdrop.onclick=()=>setMenu(false);menu.addEventListener('click',e=>{if(e.target.closest('a'))setMenu(false)});
  const search=$('#globalSearch'),input=$('input',search),suggest=$('#searchSuggestions');
  search.addEventListener('submit',e=>{e.preventDefault();const q=input.value.trim();suggest.hidden=true;if(q)navigate(`/catalogo?q=${encodeURIComponent(q)}`);});
  const searchFn=debounce(async()=>{const q=input.value.trim();if(q.length<2){suggest.hidden=true;return}try{const r=await api(`/api/search/suggestions?q=${encodeURIComponent(q)}`);suggest.innerHTML=r.items.length?r.items.map(x=>`<a class="suggestion" href="/produto/${encodeURIComponent(x.slug)}" data-link><img src="${esc(x.imageUrl)}" alt=""><span><strong>${esc(x.name)}</strong><small class="muted">${x.code?`#${esc(x.code)} · `:''}${esc(x.category)}</small></span><strong>${money(x.priceCents)}</strong></a>`).join(''):`<div class="suggestion"><span>Nenhum produto encontrado.</span></div>`;suggest.hidden=false;}catch{suggest.hidden=true;}},180);input.addEventListener('input',searchFn);
  document.addEventListener('click',e=>{if(!search.contains(e.target))suggest.hidden=true;});
  $('#mobileSearchButton').onclick=()=>{search.classList.toggle('mobile-open');if(search.classList.contains('mobile-open'))input.focus();};
  window.addEventListener('geise:navigate',()=>{search.classList.remove('mobile-open');suggest.hidden=true;updateActiveNav();});
  document.addEventListener('geise:state',updateCounts);updateActiveNav();bindChat();
}
function updateCounts(){const n=cartCount(),f=state.favorites.length;for(const id of ['#cartCount','#mobileCartCount']){const el=$(id);if(el){el.textContent=n;el.hidden=!n;}}const fav=$('#favCount');if(fav){fav.textContent=f;fav.hidden=!f;}}
function updateActiveNav(){const path=location.pathname;$$('.bottom-nav [data-nav]').forEach(a=>a.classList.toggle('active',a.dataset.nav==='home'?path==='/':path.includes(a.dataset.nav==='catalog'?'catalogo':a.dataset.nav)));}
function bindChat(){const panel=$('#chatPanel'),messages=$('#chatMessages'),form=$('#chatForm'),replies=$('#quickReplies');const setOpen=open=>{panel.classList.toggle('open',open);panel.setAttribute('aria-hidden',String(!open));if(open&&messages.children.length===0){add('assistant','Olá! Sou a Gê, assistente virtual da Geise Confecções. Posso buscar por nome, categoria, tamanho, preço ou código como #147. 😊');}};$('#chatLauncher').onclick=()=>setOpen(true);$('#chatClose').onclick=()=>setOpen(false);const prompts=['Buscar #001','Promoções','Presente até R$ 150','Falar com atendimento'];replies.innerHTML=prompts.map(p=>`<button type="button">${esc(p)}</button>`).join('');replies.addEventListener('click',e=>{const b=e.target.closest('button');if(b)send(b.textContent)});form.addEventListener('submit',e=>{e.preventDefault();const input=$('input',form),text=input.value.trim();if(text){input.value='';send(text)}});function add(role,text,products=[]){const div=document.createElement('div');div.className=`message ${role}`;div.innerHTML=`<div>${esc(text)}</div>${products.slice(0,3).map(p=>`<a class="chat-product" href="/produto/${encodeURIComponent(p.slug)}" data-link><img src="${esc(p.imageUrl)}" alt=""><span>${esc(p.name)}<br><small>${money(p.priceCents)}</small></span></a>`).join('')}`;messages.appendChild(div);messages.scrollTop=messages.scrollHeight;}async function send(text){add('user',text);const loading=document.createElement('div');loading.className='message assistant';loading.textContent='Pensando…';messages.appendChild(loading);messages.scrollTop=messages.scrollHeight;try{if(text.toLowerCase().includes('atendimento')&&state.config?.store?.whatsapp){loading.remove();add('assistant','Posso te encaminhar para o WhatsApp da loja.');window.open(`https://wa.me/${String(state.config.store.whatsapp).replace(/\D/g,'')}`,'_blank');return;}const r=await api('/api/ai/chat',{method:'POST',body:{message:text,context:{path:location.pathname}}});loading.remove();add('assistant',r.text,r.products||[]);}catch(error){loading.remove();add('assistant','Não consegui consultar o catálogo agora. Tente novamente em instantes.');toast(error.message,'error');}}}
