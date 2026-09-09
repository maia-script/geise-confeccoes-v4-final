import { api } from '../core/api.js';
import { $, esc, maskPhone, pageHero, setSeo, toast } from '../core/utils.js';
import { setSession } from '../core/store.js';
import { navigate } from '../core/router.js';

export function authPage(mode='login'){
  const login=mode==='login';
  setSeo({title:login?'Entrar':'Criar conta',description:'Acesse sua conta Geise Confecções.'});
  return `${pageHero(login?'Entrar':'Criar sua conta',login?'Use seu telefone e senha para acessar pedidos e favoritos.':'Seu telefone será o identificador principal da conta.')}<section class="section-sm"><div class="container" style="max-width:620px"><form class="form-card" id="authForm">${!login?`<div class="field"><label>Nome completo</label><input class="input" name="name" required maxlength="120" autocomplete="name"></div>`:''}<div class="field" style="margin-top:12px"><label>${login?'Telefone ou e-mail administrativo':'Telefone com DDD'}</label><input class="input" name="identifier" id="authIdentifier" required autocomplete="${login?'username':'tel'}" inputmode="${login?'text':'tel'}" placeholder="${login?'(66) 99999-9999':'(66) 99999-9999'}"></div>${!login?`<div class="field" style="margin-top:12px"><label>E-mail (opcional)</label><input class="input" type="email" name="email" autocomplete="email" placeholder="Opcional"></div>`:''}<div class="field" style="margin-top:12px"><label>Senha</label><input class="input" type="password" name="password" minlength="8" required autocomplete="${login?'current-password':'new-password'}"></div>${!login?`<label style="display:flex;gap:8px;margin-top:12px"><input type="checkbox" name="marketing"> <span class="small">Quero receber novidades e promoções. Posso retirar o consentimento depois.</span></label>`:''}<button class="btn btn-primary btn-wide" style="margin-top:18px">${login?'Entrar':'Criar conta'}</button><p class="small" style="text-align:center;margin-top:16px">${login?`Não tem conta? <a class="text-link" href="/cadastro" data-link>Cadastre-se</a>`:`Já tem conta? <a class="text-link" href="/login" data-link>Entrar</a>`}</p>${login?'<p class="small" style="text-align:center"><a class="text-link" href="/recuperar-senha" data-link>Esqueci minha senha</a></p>':''}<div id="authError" class="field-error" aria-live="polite"></div></form></div></section>`;
}

export function resetRequestPage(){
  setSeo({title:'Recuperar senha'});
  return `${pageHero('Recuperar senha','Clientes por telefone podem solicitar ajuda pelo WhatsApp; contas administrativas com e-mail usam recuperação por e-mail.')}<section class="section-sm"><div class="container" style="max-width:620px"><form class="form-card" id="resetRequest"><div class="field"><label>Telefone ou e-mail</label><input class="input" name="identifier" required></div><button class="btn btn-primary btn-wide" style="margin-top:16px">Continuar</button><div id="resetOutput" style="margin-top:12px"></div></form></div></section>`;
}
export function resetPasswordPage(token=''){return `${pageHero('Definir nova senha','O token expira automaticamente.')}<section class="section-sm"><div class="container" style="max-width:620px"><form class="form-card" id="resetPassword"><div class="field"><label>Token</label><input class="input" name="token" value="${esc(token)}" required></div><div class="field" style="margin-top:12px"><label>Nova senha</label><input class="input" name="password" type="password" minlength="8" required></div><button class="btn btn-primary btn-wide" style="margin-top:16px">Alterar senha</button></form></div></section>`;}

export function mountAuth(mode){
  const form=$('#authForm');
  if(form){
    if(mode!=='login')$('#authIdentifier')?.addEventListener('input',e=>e.target.value=maskPhone(e.target.value));
    form.onsubmit=async e=>{
      e.preventDefault();const data=Object.fromEntries(new FormData(form));const button=form.querySelector('button');button.disabled=true;
      try{
        const body=mode==='login'?{identifier:data.identifier,password:data.password}:{name:data.name,phone:data.identifier,email:data.email||'',password:data.password,marketingOptIn:data.marketing==='on'};
        const result=await api(mode==='login'?'/api/auth/login':'/api/auth/register',{method:'POST',body});
        await setSession(result);toast(mode==='login'?'Bem-vindo de volta.':'Conta criada com sucesso.');navigate('/minha-conta');
      }catch(error){$('#authError').textContent=error.message;button.disabled=false;}
    };
  }
  const req=$('#resetRequest');
  if(req)req.onsubmit=async e=>{e.preventDefault();try{const r=await api('/api/auth/password/request-reset',{method:'POST',body:{identifier:new FormData(req).get('identifier')}});if(r.channel==='whatsapp'){$('#resetOutput').innerHTML=`<div class="success-box">Para contas por telefone, recupere o acesso com a equipe da Geise pelo WhatsApp. Nenhuma senha será solicitada pelo chat.</div>`;}else{$('#resetOutput').innerHTML=`<div class="success-box">Se a conta existir, a recuperação foi iniciada.${r.developmentToken?`<br><strong>Modo local:</strong> token <code>${esc(r.developmentToken)}</code><br><a class="text-link" href="/nova-senha?token=${encodeURIComponent(r.developmentToken)}" data-link>Usar token local →</a>`:''}</div>`;}}catch(error){toast(error.message)}};
  const reset=$('#resetPassword');if(reset)reset.onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(reset));try{await api('/api/auth/password/reset',{method:'POST',body:d});toast('Senha alterada. Faça login novamente.');navigate('/login');}catch(error){toast(error.message)}};
}
