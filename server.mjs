import http from 'node:http';
import { config } from './server/config.mjs';
import { initDb, closeDb, databaseEngine } from './server/db/index.mjs';
import { handleApi } from './server/routes/api.mjs';
import { hasPathTraversal, json, securityHeaders, serveSpa, serveStatic, text } from './server/lib/http.mjs';
import { runJobs } from './server/services/jobs.mjs';
import { robotsText, sitemapXml } from './server/services/seo.mjs';

await initDb();

const jobTimer=setInterval(()=>runJobs().catch(error=>console.error('[Geise Jobs]',error)),60_000);
jobTimer.unref();

export const server=http.createServer(async(req,res)=>{
  securityHeaders(res);
  const rawUrl=req.url||'/';
  if(hasPathTraversal(rawUrl)) return json(res,404,{error:'Caminho inválido.'});
  const url=new URL(rawUrl,`http://${req.headers.host||'localhost'}`);
  try{
    if(url.pathname.startsWith('/api/')){
      const handled=await handleApi(req,res,url);
      if(!handled) json(res,404,{error:'Endpoint não encontrado.'});
      return;
    }
    if(req.method==='GET'&&url.pathname==='/robots.txt') return text(res,200,robotsText(),'text/plain; charset=utf-8');
    if(req.method==='GET'&&url.pathname==='/sitemap.xml') return text(res,200,await sitemapXml(),'application/xml; charset=utf-8');
    if(serveStatic(req,res,url.pathname)) return;
    if(req.method==='GET' && !url.pathname.includes('.')) return serveSpa(res);
    json(res,404,{error:'Arquivo não encontrado.'});
  }catch(error){
    const status=Number(error.status)||500;
    if(status>=500) console.error('[Geise V4]',error);
    if(!res.headersSent) json(res,status,{error:status>=500&&config.isProd?'Erro interno do servidor.':error.message||'Erro interno.',...(config.isProd?{}:{details:error.details||undefined})});
    else res.end();
  }
});

if(import.meta.url===`file://${process.argv[1]}`){
  server.listen(config.port,config.host,()=>{
    console.log(`[Geise V4] http://${config.host}:${config.port}`);
    console.log(`[Geise V4] Ambiente: ${config.env} | Banco: ${databaseEngine} | Pagamentos: ${config.paymentProvider} | IA: ${config.aiProvider}`);
  });
}

for (const signal of ['SIGTERM','SIGINT']) process.once(signal, async()=>{try{await closeDb();}finally{if(server.listening)server.close(()=>process.exit(0));else process.exit(0);}});
