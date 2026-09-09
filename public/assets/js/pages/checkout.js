import { api } from '../core/api.js';
import { $, $$, esc, maskCep, maskCpf, maskPhone, money, pageHero, setSeo, toast } from '../core/utils.js';
import { state, clearCart, rememberOrderToken } from '../core/store.js';
import { quoteCurrent, resolvedCart } from '../core/cart-data.js';
import { navigate } from '../core/router.js';
import { hydrateIcons } from '../core/icons.js';

const KEY='geise:v4:checkout-draft';let step=1,draft={},details=[],quote=null;
function load(){try{return JSON.parse(sessionStorage.getItem(KEY))||{}}catch{return{}}}
function save(){sessionStorage.setItem(KEY,JSON.stringify(draft))}

export async function checkoutPage(){
  setSeo({title:'Checkout seguro',description:'Finalize seu pedido na Geise Confecções.'});
  if(!sessionStorage.getItem(KEY)) step=1;
  if(!state.user)return `${pageHero('Entre para finalizar','Você pode navegar e montar o carrinho sem conta, mas a compra exige cadastro por telefone.')}<section class="section-sm"><div class="container" style="max-width:720px"><div class="form-card"><h2>Seu carrinho fica salvo neste aparelho</h2><p class="muted">Crie uma conta ou entre para informar CPF, endereço e pagamento com segurança.</p><div class="admin-actions"><a class="btn btn-primary" href="/login" data-link>Entrar</a><a class="btn" href="/cadastro" data-link>Criar conta</a></div></div></div></section>`;
  if(!state.cart.length)return `${pageHero('Checkout','Seu carrinho precisa ter produtos.')}<section class="section-sm"><div class="container"><div class="empty-state"><h2>Carrinho vazio</h2><a class="btn btn-primary" href="/catalogo" data-link>Ir ao catálogo</a></div></div></section>`;
  draft={...load(),couponCode:load().couponCode||sessionStorage.getItem('geise:v4:coupon')||''};
  details=await resolvedCart();
  try{quote=await quoteCurrent({couponCode:draft.couponCode,zip:draft.zip||'',shippingMethod:draft.shippingMethod||'local'})}
  catch(error){quote=null;draft.couponCode='';quote=await quoteCurrent({zip:draft.zip||'',shippingMethod:draft.shippingMethod||'local'});}
  return `${pageHero('Checkout','Preço, cupom e estoque são recalculados no servidor antes do pedido.')}<section class="section-sm"><div class="container checkout-layout"><div><div class="stepper">${['Identificação','Endereço','Entrega','Pagamento','Revisão'].map((x,i)=>`<span class="step ${step===i+1?'active':''}">${i+1}. ${x}</span>`).join('')}</div><div id="checkoutStep">${stepHtml()}</div></div><aside class="summary-card"><h3>Resumo</h3>${details.map(i=>`<div class="summary-line small"><span>${i.quantity}× ${esc(i.productName)}<br><small class="muted">${esc(i.color)} / ${esc(i.size)}</small></span><strong>${money((i.salePriceCents??i.priceCents)*i.quantity)}</strong></div>`).join('')}${quote?`<div class="summary-line"><span>Subtotal</span><strong>${money(quote.subtotalCents)}</strong></div><div class="summary-line"><span>Frete</span><strong>${quote.shippingCents?money(quote.shippingCents):'Grátis'}</strong></div><div class="summary-line"><span>Desconto</span><strong>− ${money(quote.discountCents)}</strong></div><div class="summary-total"><span>Total</span><span>${money(quote.totalCents)}</span></div>`:''}</aside></div></section>`;
}

function stepHtml(){
  if(step===1)return `<form class="form-card" id="stepForm"><h2>1. Identificação</h2><div class="form-grid"><div class="field full"><label>Nome completo</label><input class="input" name="name" value="${esc(draft.name||state.user?.name||'')}" required autocomplete="name"></div><div class="field"><label>CPF</label><input class="input" name="cpf" id="checkoutCpf" value="${esc(draft.cpf||'')}" inputmode="numeric" autocomplete="off" placeholder="000.000.000-00" required></div><div class="field"><label>Telefone</label><input class="input" name="phone" id="checkoutPhone" value="${esc(draft.phone||state.user?.phone||'')}" inputmode="tel" required></div><div class="field full"><label>E-mail (opcional)</label><input class="input" type="email" name="email" value="${esc(draft.email||state.user?.email||'')}" autocomplete="email" placeholder="Para receber comunicações por e-mail quando disponível"></div></div><button class="btn btn-primary" style="margin-top:18px">Continuar</button></form>`;
  if(step===2)return `<form class="form-card" id="stepForm"><h2>2. Endereço</h2><div class="form-grid"><div class="field"><label>CEP</label><div style="display:grid;grid-template-columns:1fr auto;gap:8px"><input class="input" name="zip" id="checkoutZip" value="${esc(draft.zip||'')}" inputmode="numeric" required><button type="button" class="btn" id="lookupCep">Buscar</button></div></div><div class="field"><label>Estado</label><input class="input" name="state" value="${esc(draft.state||'MT')}" maxlength="2" required></div><div class="field full"><label>Rua / avenida</label><input class="input" name="street" value="${esc(draft.street||'')}" required></div><div class="field"><label>Número</label><input class="input" name="number" value="${esc(draft.number||'')}" required></div><div class="field"><label>Complemento</label><input class="input" name="complement" value="${esc(draft.complement||'')}"></div><div class="field"><label>Bairro</label><input class="input" name="district" value="${esc(draft.district||'')}"></div><div class="field"><label>Cidade</label><input class="input" name="city" value="${esc(draft.city||'Rondonópolis')}" required></div></div><div class="admin-actions" style="margin-top:18px"><button type="button" class="btn" data-back>Voltar</button><button class="btn btn-primary">Continuar</button></div></form>`;
  if(step===3)return `<form class="form-card" id="stepForm"><h2>3. Entrega</h2><p class="muted">Entrega local por motoboy custa R$ 10 e fica grátis a partir de R$ 200. Retirada na loja é grátis.</p>${quote.shippingOptions.map(x=>`<label class="shipping-option"><input type="radio" name="shippingMethod" value="${x.id}" ${draft.shippingMethod===x.id||(!draft.shippingMethod&&x.id==='local')?'checked':''}><span><strong>${esc(x.label)}</strong><br><small class="muted">${esc(x.eta)} • ${x.priceCents?money(x.priceCents):'Grátis'}</small></span></label>`).join('')}<div class="admin-actions" style="margin-top:18px"><button type="button" class="btn" data-back>Voltar</button><button class="btn btn-primary">Continuar</button></div></form>`;
  if(step===4){
    const manual=state.config?.paymentProvider==='manual';
    return `<form class="form-card" id="stepForm"><h2>4. Pagamento</h2><div class="notice">A Geise nunca pede senha, CVV ou código bancário pelo chat. ${manual?'Nesta primeira versão, o pedido é criado no site e a conclusão do pagamento é combinada pelo WhatsApp.':'O pagamento será concluído no ambiente seguro do provedor.'}</div>${manual?`<label class="payment-option"><input type="radio" name="paymentMethod" value="pix" ${!draft.paymentMethod||draft.paymentMethod==='pix'?'checked':''}><span><strong>PIX</strong><br><small class="muted">Concluir pelo atendimento da Geise.</small></span></label><label class="payment-option"><input type="radio" name="paymentMethod" value="card" ${draft.paymentMethod==='card'?'checked':''}><span><strong>Cartão</strong><br><small class="muted">Condições e parcelamento até 6x são confirmados no atendimento.</small></span></label><label class="payment-option"><input type="radio" name="paymentMethod" value="cash" ${draft.paymentMethod==='cash'?'checked':''}><span><strong>Dinheiro / combinar</strong><br><small class="muted">Disponível conforme confirmação da equipe.</small></span></label>`:`<label class="payment-option"><input type="radio" name="paymentMethod" value="provider" checked><span><strong>PIX / cartão / opções do gateway</strong><br><small class="muted">O status final só é aceito pelo servidor/webhook.</small></span></label>`}<div class="admin-actions" style="margin-top:18px"><button type="button" class="btn" data-back>Voltar</button><button class="btn btn-primary">Revisar pedido</button></div></form>`;
  }
  return `<div class="form-card"><h2>5. Revisão</h2><div class="success-box"><strong>Confira antes de criar o pedido.</strong><br>O servidor verificará novamente preço, cupom, endereço e disponibilidade.</div><div style="margin-top:18px"><p><strong>Cliente:</strong> ${esc(draft.name)} • CPF ${esc(draft.cpf)}</p><p><strong>Telefone:</strong> ${esc(draft.phone)}</p><p><strong>Entrega:</strong> ${esc(draft.street)}, ${esc(draft.number)} — ${esc(draft.city)}/${esc(draft.state)} — CEP ${esc(draft.zip)}</p><p><strong>Método de entrega:</strong> ${esc(quote.shipping.label)} • ${esc(quote.shipping.eta)}</p></div><label style="display:flex;gap:8px;align-items:start;margin:16px 0"><input type="checkbox" id="acceptTerms"> <span class="small">Li e concordo com os termos de compra, política de trocas e política de privacidade.</span></label><div class="admin-actions"><button class="btn" data-back>Voltar</button><button class="btn btn-primary" id="placeOrder">Criar pedido</button></div></div>`;
}

function collect(form){const fd=new FormData(form);for(const [k,v] of fd.entries())draft[k]=String(v).trim();save();}
async function rerenderStep(){const el=$('#checkoutStep');el.innerHTML=stepHtml();mountCheckout();}

export function mountCheckout(){
  const form=$('#stepForm');
  if(form){
    $('#checkoutPhone')?.addEventListener('input',e=>e.target.value=maskPhone(e.target.value));
    $('#checkoutCpf')?.addEventListener('input',e=>e.target.value=maskCpf(e.target.value));
    $('#checkoutZip')?.addEventListener('input',e=>e.target.value=maskCep(e.target.value));
    $('#lookupCep')?.addEventListener('click',async()=>{const zip=$('#checkoutZip').value;try{const a=await api(`/api/shipping/cep/${encodeURIComponent(zip)}`);for(const [k,v] of Object.entries(a)){const input=form.elements[k];if(input&&v)input.value=v;}toast('Endereço preenchido.');}catch(error){toast(error.message)}});
    form.onsubmit=async e=>{
      e.preventDefault();if(!form.reportValidity())return;collect(form);
      if(step===2){try{quote=await quoteCurrent({couponCode:draft.couponCode,zip:draft.zip,shippingMethod:'local'});draft.shippingMethod=quote.shippingOptions.some(x=>x.id==='local')?'local':'pickup';quote=await quoteCurrent({couponCode:draft.couponCode,zip:draft.zip,shippingMethod:draft.shippingMethod});}catch(error){toast(error.message);return}}
      if(step===3){draft.shippingMethod=new FormData(form).get('shippingMethod')||'pickup';try{quote=await quoteCurrent({couponCode:draft.couponCode,zip:draft.zip,shippingMethod:draft.shippingMethod});}catch(error){toast(error.message);return}save();}
      if(step===4){draft.paymentMethod=new FormData(form).get('paymentMethod')||'pix';save();}
      step=Math.min(5,step+1);await rerenderStep();
    };
  }
  $$('[data-back]').forEach(b=>b.onclick=async()=>{step=Math.max(1,step-1);await rerenderStep()});
  $('#placeOrder')?.addEventListener('click',async()=>{
    if(!$('#acceptTerms').checked){toast('Confirme os termos para continuar.');return}
    const button=$('#placeOrder');button.disabled=true;button.textContent='Criando pedido…';
    try{
      const result=await api('/api/checkout/create',{method:'POST',body:{name:draft.name,email:draft.email||'',phone:draft.phone,cpf:draft.cpf,paymentMethod:draft.paymentMethod||'pix',items:state.cart.map(i=>({variantId:i.variantId,quantity:i.quantity})),couponCode:draft.couponCode||'',shippingMethod:draft.shippingMethod||'pickup',address:{zip:draft.zip,street:draft.street,number:draft.number,complement:draft.complement||'',district:draft.district||'',city:draft.city,state:draft.state}}});
      rememberOrderToken(result.order.orderNumber,result.accessToken);sessionStorage.removeItem(KEY);sessionStorage.removeItem('geise:v4:coupon');await clearCart();
      sessionStorage.setItem(`geise:v4:payment:${result.order.orderNumber}`,JSON.stringify(result.payment||{}));
      navigate(`/pedido/${result.order.orderNumber}`);
    }catch(error){toast(error.message);button.disabled=false;button.textContent='Criar pedido';}
  });
  hydrateIcons(document);
}
