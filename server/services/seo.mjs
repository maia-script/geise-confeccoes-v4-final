import { config } from '../config.mjs';
import { listCategories, listProducts } from './catalog.mjs';
import { listPublishedPosts } from './content.mjs';

function xml(value=''){return String(value).replace(/[<>&'\"]/g,ch=>({"<":'&lt;',">":'&gt;',"&":'&amp;',"'":'&apos;',"\"":'&quot;'}[ch]));}
function base(){return String(config.baseUrl||'').replace(/\/$/,'');}

export function robotsText(){
  return [
    'User-agent: *','Allow: /','Disallow: /admin','Disallow: /checkout','Disallow: /minha-conta','Disallow: /pedidos',`Sitemap: ${base()}/sitemap.xml`,''
  ].join('\n');
}

export async function sitemapXml(){
  const [catalog,categories,posts]=await Promise.all([
    listProducts({limit:60}),listCategories(),listPublishedPosts()
  ]);
  // O catálogo atual é limitado a 60 por página; percorre páginas adicionais para sitemap completo.
  let products=[...catalog.items];
  for(let page=2;page<=catalog.pagination.pages;page++){
    const more=await listProducts({limit:60,page});
    products.push(...more.items);
  }
  const fixed=['/','/catalogo','/promocoes','/novidades','/inspire-se','/blog','/sobre','/contato','/politicas'];
  const urls=[
    ...fixed.map(path=>({loc:`${base()}${path}`,changefreq:'weekly',priority:path==='/'?'1.0':'0.7'})),
    ...categories.map(c=>({loc:`${base()}/categoria/${encodeURIComponent(c.slug)}`,changefreq:'weekly',priority:'0.8'})),
    ...products.map(p=>({loc:`${base()}/produto/${encodeURIComponent(p.slug)}`,lastmod:p.updatedAt,changefreq:'weekly',priority:'0.9'})),
    ...posts.map(p=>({loc:`${base()}/blog/${encodeURIComponent(p.slug)}`,lastmod:p.updatedAt||p.publishedAt,changefreq:'monthly',priority:'0.6'}))
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u=>`  <url><loc>${xml(u.loc)}</loc>${u.lastmod?`<lastmod>${xml(String(u.lastmod).slice(0,10))}</lastmod>`:''}<changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`).join('\n')}\n</urlset>\n`;
}
