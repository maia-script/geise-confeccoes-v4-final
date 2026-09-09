import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.mjs';
import { dbGet, dbRun } from './index.mjs';
import { hashPassword, isValidEmail, makeId, nowIso, randomToken } from '../lib/security.mjs';

const categories = [
  ['feminino','Feminino','Moda feminina para diferentes estilos e ocasiões.'],
  ['masculino','Masculino','Peças masculinas para o dia a dia e ocasiões especiais.'],
  ['plus-size','Plus Size','Moda com variedade de estilos e numerações.'],
  ['fitness','Academia / Fitness','Roupas e acessórios para treino e rotina ativa.'],
  ['infantil','Infantil','Opções para crianças e família.'],
  ['calcados','Calçados','Do casual ao elegante.'],
  ['bolsas','Bolsas','Praticidade, estilo e presentes.'],
  ['perfumes','Perfumes','Fragrâncias e opções para presentear.'],
  ['acessorios','Bijuterias / Acessórios','Detalhes que completam o look.'],
  ['variedades','Variedades','Achadinhos e itens diversos da Geise.']
];

const demoProducts = [
  {code:'001',slug:'vestido-midi-aurora',name:'Vestido Midi Aurora',cat:'feminino',sub:'Vestidos',price:15990,sale:12990,colors:['Vinho','Preto'],sizes:['P','M','G'],stock:12,featured:1,isNew:1,tags:['vestido','festa','elegante'],desc:'Produto demonstrativo para testar catálogo, busca por código e checkout. Substitua pelos produtos reais no painel.',material:'Tecido leve',badges:[{label:'NOVIDADE',background:'#8b2d8f',foreground:'#ffffff',animation:'shimmer',position:'top-left',priority:20},{label:'-19%',background:'#c9971a',foreground:'#241a12',animation:'pulse',position:'top-right',priority:10}]},
  {code:'002',slug:'camisa-masculina-essencial',name:'Camisa Masculina Essencial',cat:'masculino',sub:'Camisas',price:11990,sale:null,colors:['Preto','Branco','Azul'],sizes:['P','M','G','GG'],stock:18,featured:1,isNew:0,tags:['camisa','social','masculina'],desc:'Produto demonstrativo para validar o fluxo da loja. Cadastre o catálogo real antes da abertura comercial.',material:'Algodão misto',badges:[{label:'DESTAQUE',background:'#d6ad2b',foreground:'#2d2328',animation:'glow',position:'top-left',priority:10}]},
  {code:'003',slug:'legging-fit-move',name:'Legging Fit Move',cat:'fitness',sub:'Leggings',price:8990,sale:7490,colors:['Preto','Roxo'],sizes:['P','M','G','GG'],stock:15,featured:1,isNew:1,tags:['academia','fitness','legging'],desc:'Exemplo de produto fitness para testar filtros, variações e selos.',material:'Malha com elastano',badges:[{label:'FIT',background:'#6b3aa1',foreground:'#ffffff',animation:'float',position:'top-left',priority:8}]},
  {code:'004',slug:'blusa-plus-confort',name:'Blusa Plus Confort',cat:'plus-size',sub:'Blusas',price:9990,sale:null,colors:['Rosa','Preto'],sizes:['G1','G2','G3'],stock:9,featured:0,isNew:1,tags:['plus size','blusa','feminino'],desc:'Produto demonstrativo da categoria Plus Size.',material:'Malha macia',badges:[{label:'PLUS SIZE',background:'#aa4f8b',foreground:'#ffffff',animation:'none',position:'top-left',priority:10}]},
  {code:'005',slug:'bolsa-urbana-classic',name:'Bolsa Urbana Classic',cat:'bolsas',sub:'Bolsas',price:13990,sale:10990,colors:['Caramelo','Preto'],sizes:['Único'],stock:7,featured:1,isNew:0,tags:['bolsa','presente'],desc:'Produto demonstrativo de bolsa para testar busca, carrinho e recomendações.',material:'Material sintético',badges:[{label:'OFERTA',background:'#b43755',foreground:'#ffffff',animation:'pulse',position:'top-right',priority:15}]},
  {code:'006',slug:'perfume-demo-elegance',name:'Perfume Elegance Demo',cat:'perfumes',sub:'Perfumes',price:12990,sale:null,colors:['Único'],sizes:['100 ml'],stock:8,featured:0,isNew:1,tags:['perfume','presente'],desc:'Produto de demonstração. Substitua por fragrâncias reais e respectivas informações oficiais.',material:'',badges:[{label:'PRESENTE',background:'#d6ad2b',foreground:'#2d2328',animation:'shimmer',position:'top-left',priority:8}]},
  {code:'007',slug:'colar-luz-delicada',name:'Colar Luz Delicada',cat:'acessorios',sub:'Bijuterias',price:4990,sale:null,colors:['Dourado','Prateado'],sizes:['Único'],stock:24,featured:1,isNew:0,tags:['colar','bijuteria','presente'],desc:'Produto demonstrativo para categoria de bijuterias e acessórios.',material:'Liga metálica',badges:[]},
  {code:'008',slug:'tenis-casual-move',name:'Tênis Casual Move',cat:'calcados',sub:'Tênis',price:18990,sale:15990,colors:['Branco','Preto'],sizes:['34','35','36','37','38','39','40'],stock:14,featured:0,isNew:1,tags:['tenis','calçado','casual'],desc:'Produto demonstrativo de calçado com grade de tamanhos.',material:'Sintético',badges:[{label:'NOVO',background:'#8b2d8f',foreground:'#ffffff',animation:'shimmer',position:'top-left',priority:10}]},
  {code:'009',slug:'conjunto-infantil-diversao',name:'Conjunto Infantil Diversão',cat:'infantil',sub:'Conjuntos',price:7990,sale:6490,colors:['Azul','Rosa'],sizes:['2','4','6','8'],stock:9,featured:0,isNew:1,tags:['infantil','criança','conjunto'],desc:'Produto demonstrativo para a categoria infantil.',material:'Malha macia',badges:[]}
];

function ensureDemoSvg(slug, title, index) {
  const dir = path.join(config.publicDir, 'assets/images/demo');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${slug}.svg`);
  if (fs.existsSync(file)) return `/assets/images/demo/${slug}.svg`;
  const palettes = [['#f8e9f6','#8b2d8f','#d8ad2b'],['#f3edf7','#5b3f68','#a96da0'],['#fff6df','#6b4c2b','#d7aa27'],['#f3eef4','#6a3b6c','#bd7cae']];
  const [a,b,c] = palettes[index % palettes.length];
  const escaped = title.replace(/[&<>]/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1100" viewBox="0 0 900 1100"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="${a}"/><stop offset="1" stop-color="#fff"/></linearGradient></defs><rect width="900" height="1100" fill="url(#g)"/><circle cx="680" cy="250" r="190" fill="${c}" opacity=".22"/><circle cx="160" cy="880" r="230" fill="${b}" opacity=".10"/><path d="M310 365h280l72 180-93 45-22-62v285H353V528l-22 62-93-45 72-180z" fill="${b}" opacity=".72"/><text x="450" y="915" text-anchor="middle" font-family="Arial" font-size="34" font-weight="700" fill="${b}">GEISE CONFECÇÕES</text><text x="450" y="970" text-anchor="middle" font-family="Arial" font-size="28" fill="#4d4247">${escaped}</text></svg>`;
  fs.writeFileSync(file, svg);
  return `/assets/images/demo/${slug}.svg`;
}

async function upsertSetting(key, value, now) {
  await dbRun('INSERT INTO settings (key,value_json,updated_at) VALUES (?,?,?) ON CONFLICT (key) DO NOTHING', [key, JSON.stringify(value), now]);
}

export async function seedDatabase() {
  const now = nowIso();

  for (let i = 0; i < categories.length; i++) {
    const [slug,name,description] = categories[i];
    await dbRun('INSERT INTO categories (id,slug,name,description,sort_order,active,created_at,updated_at) VALUES (?,?,?,?,?,1,?,?) ON CONFLICT (slug) DO NOTHING', [`cat-${slug}`, slug, name, description, i, now, now]);
  }

  const productCount = Number((await dbGet('SELECT COUNT(*) AS n FROM products'))?.n || 0);
  if (productCount === 0) {
    for (let i = 0; i < demoProducts.length; i++) {
      const p = demoProducts[i];
      const productId = `prod-${p.slug}`;
      const image = ensureDemoSvg(p.slug, p.name, i);
      await dbRun(`INSERT INTO products (id,slug,name,product_code,category_id,subcategory,description,material,featured,is_new,status,rating_avg,review_count,tags_json,badges_json,show_when_out_of_stock,seo_title,seo_description,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,'active',0,0,?,?,1,?,?,?,?)`, [productId,p.slug,p.name,p.code,`cat-${p.cat}`,p.sub,p.desc,p.material,p.featured,p.isNew,JSON.stringify(p.tags),JSON.stringify(p.badges),`${p.name} | Geise Confecções`,`${p.desc} Consulte disponibilidade e compre na Geise Confecções.`,now,now]);
      const combinations = p.colors.flatMap(color => p.sizes.map(size => ({color,size})));
      for (let v = 0; v < combinations.length; v++) {
        const combo = combinations[v];
        const stock = Math.max(0, Math.floor(p.stock / combinations.length) + (v < p.stock % combinations.length ? 1 : 0));
        await dbRun(`INSERT INTO product_variants (id,product_id,sku,color,size,price_cents,sale_price_cents,stock,reserved,low_stock_threshold,weight_grams,image_url,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,0,3,350,?,1,?,?)`, [`var-${p.slug}-${v+1}`,productId,`GC-${p.code}-${String(v+1).padStart(2,'0')}`,combo.color,combo.size,p.price,p.sale,stock,image,now,now]);
      }
    }
  }

  if (Number((await dbGet('SELECT COUNT(*) AS n FROM coupons'))?.n || 0) === 0) {
    await dbRun(`INSERT INTO coupons (id,code,type,value,starts_at,expires_at,max_uses,max_uses_per_customer,min_subtotal_cents,first_purchase_only,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?)`, ['coupon-geise10','GEISE10','percent',10,null,null,1000,1,5000,1,now,now]);
  }

  if (Number((await dbGet('SELECT COUNT(*) AS n FROM badge_templates'))?.n || 0) === 0) {
    const badges = [
      ['badge-novo','Novo','NOVO','#8b2d8f','#ffffff',null,'sparkles','shimmer','top-left',30],
      ['badge-oferta','Oferta','OFERTA','#b43755','#ffffff',null,'tag','pulse','top-right',40],
      ['badge-destaque','Destaque','DESTAQUE','#d6ad2b','#2d2328',null,'star','glow','top-left',20],
      ['badge-ultimas','Últimas unidades','ÚLTIMAS UNIDADES','#4f3a55','#ffffff',null,'alert','pulse','top-right',50]
    ];
    for (const b of badges) await dbRun(`INSERT INTO badge_templates (id,name,label,background,foreground,border_color,icon,animation,position,priority,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?)`, [...b,now,now]);
  }

  const defaults = {
    store: {
      name:'Geise Confecções', descriptor:'Confecções e Bijuterias', monogram:'G', tagline:'Moda para toda a família, com atendimento que acolhe.',
      logoUrl:'/assets/brand/logo-original.jpg', primary:'#92278f', accent:'#d6ad2b', soft:'#f6eaf5',
      whatsapp:'5566996676270', phone:'(66) 99667-6270', email:'',
      address:'Rua Presidente Castelo Branco, 493 — Vila Operária — Rondonópolis/MT — CEP 78720-630',
      hours:'Segunda a sexta: 08:00–18:00 • Sábados e feriados: 08:00–14:00', mapUrl:'',
      instagram:'https://www.instagram.com/geise_lojas', facebook:'https://share.google/YV0f9YWlvi3ssFXZ4', tiktok:'',
      legalName:'Geisibel Lopes de Souza', cnpj:'19.618.264/0001-31', domain:'https://www.lojageise.com'
    },
    commerce: {
      freeShippingThresholdCents:20000, standardShippingPriceCents:1000, localDeliveryCity:'Rondonópolis', localDeliveryState:'MT', pickupEnabled:true,
      preparationDays:2, couponWelcome:'GEISE10', maxInstallments:6
    },
    features: { reviews:true, ai:true, pwa:true, abandonedCart:true, recommendations:true, productCodes:true, productBadges:true, wishlist:true },
    ai: { assistantName:'Gê', mode:'local-first', humanHandoff:true, defaultLanguage:'pt-BR' }
  };
  for (const [key,value] of Object.entries(defaults)) await upsertSetting(key,value,now);

  if (Number((await dbGet('SELECT COUNT(*) AS n FROM content_posts'))?.n || 0) === 0) {
    const posts=[
      ['como-escolher-presente','Como escolher um presente sem complicar','Um guia simples para encontrar uma opção que combine com a pessoa e com seu orçamento.','<p>Comece pensando na ocasião, no estilo da pessoa e no valor que deseja investir. A equipe Geise também pode ajudar pelo WhatsApp.</p>','Presentes'],
      ['como-cuidar-das-pecas','Cuidados simples para conservar suas peças','Pequenos hábitos que ajudam roupas e acessórios a manterem boa aparência por mais tempo.','<p>Sempre confira as orientações da etiqueta e as recomendações específicas do fabricante. Quando tiver dúvida, pergunte à equipe.</p>','Cuidados']
    ];
    for (let i=0;i<posts.length;i++) {
      const x=posts[i];
      await dbRun(`INSERT INTO content_posts (id,slug,title,excerpt,body_html,category,author,status,seo_title,seo_description,published_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'published',?,?,?,?,?)`, [`post-${i+1}`,x[0],x[1],x[2],x[3],x[4],'Equipe Geise',x[1],x[2],now,now,now]);
    }
  }

  if (Number((await dbGet('SELECT COUNT(*) AS n FROM campaigns'))?.n || 0) === 0) {
    await dbRun(`INSERT INTO campaigns (id,name,slug,headline,subheadline,cta_label,cta_url,active,settings_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,1,'{}',?,?)`, ['camp-welcome','Boas-vindas Geise','boas-vindas','Encontre seu próximo favorito.','Moda, acessórios, calçados, perfumes e variedades para toda a família.','Ver catálogo','/catalogo',now,now]);
  }

  if (Number((await dbGet("SELECT COUNT(*) AS n FROM users WHERE role='admin'"))?.n || 0) === 0) {
    if (config.isProd && !isValidEmail(config.adminEmail)) throw new Error('ADMIN_EMAIL válido é obrigatório no primeiro deploy de produção.');
    if (config.isProd && String(config.adminPassword).length < 12) throw new Error('ADMIN_PASSWORD deve ter pelo menos 12 caracteres no primeiro deploy de produção.');
    const password = config.adminPassword || `Geise-${randomToken(12)}`;
    await dbRun(`INSERT INTO users (id,name,email,password_hash,role,permissions_json,email_verified_at,phone,created_at,updated_at) VALUES (?,?,?,?, 'admin','["*"]',?,?,?,?)`, [makeId('usr_'),'Administrador Geise',config.adminEmail,hashPassword(password),now,'',now,now]);
    if (!config.adminPassword) {
      const message = `ADMIN LOCAL GERADO\nE-mail: ${config.adminEmail}\nSenha: ${password}\nGerado em: ${now}\nTroque esta senha antes de qualquer deploy.\n`;
      fs.mkdirSync(path.resolve('runtime'), { recursive: true });
      fs.writeFileSync(path.resolve('runtime/admin-bootstrap.txt'), message, { mode: 0o600 });
      console.log(`\n[Geise V4] Credencial administrativa local gerada em ${path.resolve('runtime/admin-bootstrap.txt')}\n`);
    }
  }
}
