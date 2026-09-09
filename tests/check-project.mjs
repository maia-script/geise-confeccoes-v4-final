import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const required=[
  'package.json','server.mjs','README.md','.env.example','render.yaml','Dockerfile','.github/workflows/ci.yml','docs/DEPLOY-RENDER.md','docs/O-QUE-VOCE-PRECISA-PREENCHER.md','docs/GO-LIVE-CHECKLIST.md','docs/TESTE-3-DIAS.md',
  'public/index.html','public/manifest.webmanifest','public/sw.js','public/offline.html',
  'public/assets/js/app.js','public/assets/js/pages/home.js','public/assets/js/pages/catalog.js','public/assets/js/pages/product.js','public/assets/js/pages/cart.js','public/assets/js/pages/checkout.js','public/assets/js/pages/account.js','public/assets/js/pages/admin.js',
  'server/routes/api.mjs','server/services/auth.mjs','server/services/commerce.mjs','server/services/orders.mjs','server/services/payment.mjs','server/services/notifications.mjs','server/db/schema.mjs','server/db/seed.mjs',
  'tests/unit.mjs','tests/smoke.mjs','tests/deep-audit.mjs'
];
for(const file of required) assert.ok(fs.existsSync(path.resolve(file)),`arquivo obrigatório ausente: ${file}`);

const scripts=[];
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);if(entry.isDirectory())walk(p);else if(/\.(?:js|mjs)$/.test(entry.name))scripts.push(p);}}
walk('server');walk('public/assets/js');scripts.push('server.mjs');
for(const file of scripts) execFileSync(process.execPath,['--check',file],{stdio:'pipe'});

const frontend=fs.readFileSync('public/assets/js/app.js','utf8')+scripts.filter(f=>f.startsWith('public/')).map(f=>fs.readFileSync(f,'utf8')).join('\n');
assert.ok(!/MERCADOPAGO_ACCESS_TOKEN\s*=|AI_API_KEY\s*=|ADMIN_PASSWORD\s*=/.test(frontend),'segredo/configuração privada não deve estar hardcoded no frontend');
const serverCode=scripts.filter(f=>f.startsWith('server/')&&!f.endsWith('schema.mjs')).map(f=>fs.readFileSync(f,'utf8')).join('\n');
assert.ok(!/INSERT\s+OR\s+IGNORE|COLLATE\s+NOCASE|\browid\b/i.test(serverCode),'SQL de runtime não deve depender de extensões exclusivas do SQLite');
console.log(`✓ check: ${required.length} arquivos obrigatórios e ${scripts.length} módulos validados`);
