import { onlyDigits } from '../lib/security.mjs';

export async function lookupCep(input){
  const cep=onlyDigits(input);
  if(cep.length!==8) throw Object.assign(new Error('Informe um CEP com 8 dígitos.'),{status:400});
  let response;
  try{response=await fetch(`https://viacep.com.br/ws/${cep}/json/`,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(5000)});}catch{
    throw Object.assign(new Error('Não foi possível consultar o CEP agora. Você pode preencher o endereço manualmente.'),{status:503});
  }
  if(!response.ok) throw Object.assign(new Error('Não foi possível consultar o CEP.'),{status:502});
  const data=await response.json();
  if(data.erro) throw Object.assign(new Error('CEP não encontrado.'),{status:404});
  return {zip:cep,street:data.logradouro||'',district:data.bairro||'',city:data.localidade||'',state:data.uf||'',complement:data.complemento||''};
}
