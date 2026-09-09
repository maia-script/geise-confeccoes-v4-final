let csrfToken=null;
export function setCsrf(token){csrfToken=token||null;}
export async function api(path,{method='GET',body,headers={},signal}={}){
  const options={method,headers:{Accept:'application/json',...headers},credentials:'same-origin',signal};
  if(body!==undefined){options.headers['Content-Type']='application/json';options.body=JSON.stringify(body);}
  if(!['GET','HEAD','OPTIONS'].includes(method.toUpperCase())&&csrfToken)options.headers['X-CSRF-Token']=csrfToken;
  const response=await fetch(path,options);const text=await response.text();let data={};try{data=text?JSON.parse(text):{};}catch{data={error:text||`HTTP ${response.status}`};}
  if(!response.ok){const error=new Error(data.error||`HTTP ${response.status}`);error.status=response.status;error.data=data;throw error;}return data;
}
