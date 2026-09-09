import { dbAll, dbGet, dbRun } from '../db/index.mjs';
import { makeId, nowIso, sanitizePublicUrl, sanitizeText } from '../lib/security.mjs';
import { audit } from './admin.mjs';

function postDto(r){return r?{id:r.id,slug:r.slug,title:r.title,excerpt:r.excerpt,bodyHtml:r.body_html,category:r.category,author:r.author,coverUrl:r.cover_url||'',status:r.status,seoTitle:r.seo_title||r.title,seoDescription:r.seo_description||r.excerpt,publishedAt:r.published_at,createdAt:r.created_at,updatedAt:r.updated_at}:null;}
export async function listPublishedPosts(){return (await dbAll("SELECT * FROM content_posts WHERE status='published' ORDER BY COALESCE(published_at,created_at) DESC LIMIT 100")).map(postDto);}
export async function getPublishedPost(slug){return postDto(await dbGet("SELECT * FROM content_posts WHERE slug=? AND status='published'",[slug]));}
export async function listPostsAdmin(){return (await dbAll('SELECT * FROM content_posts ORDER BY updated_at DESC LIMIT 300')).map(postDto);}
export async function savePost(input,{actorUserId,ip=''}){
  const now=nowIso(),id=input.id||makeId('post_');
  const before=input.id?postDto(await dbGet('SELECT * FROM content_posts WHERE id=?',[id])):null;
  const slug=sanitizeText(input.slug,160).toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-+|-+$/g,'');
  const title=sanitizeText(input.title,180),excerpt=sanitizeText(input.excerpt,500),category=sanitizeText(input.category||'Geral',80),author=sanitizeText(input.author||'Equipe Geise',120),status=['draft','published','archived'].includes(input.status)?input.status:'draft';
  if(!slug||!title||!excerpt)throw Object.assign(new Error('Título, slug e resumo são obrigatórios.'),{status:400});
  const bodyHtml=sanitizeHtml(String(input.bodyHtml||'').slice(0,50000));
  const publishedAt=status==='published'?(before?.publishedAt||now):before?.publishedAt||null;
  if(before)await dbRun(`UPDATE content_posts SET slug=?,title=?,excerpt=?,body_html=?,category=?,author=?,cover_url=?,status=?,seo_title=?,seo_description=?,published_at=?,updated_at=? WHERE id=?`,[slug,title,excerpt,bodyHtml,category,author,sanitizePublicUrl(input.coverUrl),status,sanitizeText(input.seoTitle||title,180),sanitizeText(input.seoDescription||excerpt,300),publishedAt,now,id]);
  else await dbRun(`INSERT INTO content_posts (id,slug,title,excerpt,body_html,category,author,cover_url,status,seo_title,seo_description,published_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[id,slug,title,excerpt,bodyHtml,category,author,sanitizePublicUrl(input.coverUrl),status,sanitizeText(input.seoTitle||title,180),sanitizeText(input.seoDescription||excerpt,300),publishedAt,now,now]);
  const after=postDto(await dbGet('SELECT * FROM content_posts WHERE id=?',[id]));
  await audit({actorUserId,action:before?'content.update':'content.create',entityType:'content_post',entityId:id,before,after,ip});
  return after;
}
export async function listCampaigns({admin=false}={}){
  const now=nowIso();
  const rows=admin?await dbAll('SELECT * FROM campaigns ORDER BY updated_at DESC'):await dbAll(`SELECT * FROM campaigns WHERE active=1 AND (starts_at IS NULL OR starts_at<=?) AND (ends_at IS NULL OR ends_at>=?) ORDER BY updated_at DESC`,[now,now]);
  return rows.map(r=>({id:r.id,name:r.name,slug:r.slug,headline:r.headline,subheadline:r.subheadline||'',ctaLabel:r.cta_label||'',ctaUrl:r.cta_url||'',startsAt:r.starts_at,endsAt:r.ends_at,active:Boolean(r.active),settings:JSON.parse(r.settings_json||'{}')}));
}
const ALLOWED_HTML_TAGS=new Set(['p','h2','h3','h4','strong','em','ul','ol','li','br','blockquote','a']);
function htmlEscape(value=''){return String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
function decodeHtmlAttr(value=''){
  return String(value)
    .replace(/&#(x?[0-9a-f]+);?/gi,(_,raw)=>{const hex=raw[0]?.toLowerCase()==='x';const n=parseInt(hex?raw.slice(1):raw,hex?16:10);return Number.isFinite(n)?String.fromCodePoint(n):'';})
    .replace(/&colon;/gi,':').replace(/&tab;/gi,'\t').replace(/&newline;/gi,'\n').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'");
}
function safeHref(raw=''){
  const decoded=decodeHtmlAttr(raw).replace(/[\u0000-\u001F\u007F\s]+/g,'').trim();
  if(!decoded)return '';
  if(decoded.startsWith('/')&&!decoded.startsWith('//'))return decoded;
  if(decoded.startsWith('#'))return decoded;
  if(/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(decoded))return decoded;
  try{const u=new URL(decoded);return ['http:','https:'].includes(u.protocol)?u.href:'';}catch{return '';}
}
function sanitizeHtml(html){
  const source=String(html||'').slice(0,50000).replace(/<!--[\s\S]*?-->/g,'').replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'');
  return source.replace(/<\/?[^>]+>/g,token=>{
    const closing=/^<\s*\//.test(token);const m=token.match(/^<\s*\/?\s*([a-z0-9]+)/i);if(!m)return '';
    const tag=m[1].toLowerCase();if(!ALLOWED_HTML_TAGS.has(tag))return '';
    if(closing)return tag==='br'?'':`</${tag}>`;
    if(tag==='br')return '<br>';
    if(tag!=='a')return `<${tag}>`;
    const hrefMatch=token.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);const href=safeHref(hrefMatch?.[1]??hrefMatch?.[2]??hrefMatch?.[3]??'');
    if(!href)return '<a>';
    const external=/^https?:/i.test(href);return `<a href="${htmlEscape(href)}"${external?' target="_blank" rel="noopener noreferrer"':''}>`;
  });
}
export const __contentTest=Object.freeze({sanitizeHtml,safeHref});
