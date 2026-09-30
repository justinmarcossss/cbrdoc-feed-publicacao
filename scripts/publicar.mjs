// Publica o post do dia (agenda.json) no Instagram (carrossel) e no LinkedIn (documento PDF).
// Roda no GitHub Actions. Sem as chaves configuradas, apenas simula (modo teste).
//
// Segredos (Settings → Secrets and variables → Actions):
//   IG_USER_ID, IG_ACCESS_TOKEN              → Instagram (Graph API da Meta)
//   LINKEDIN_ORG_ID, LINKEDIN_ACCESS_TOKEN   → LinkedIn (página da empresa)
// Variáveis opcionais: GRAPH_VERSION (ex.: v23.0), LINKEDIN_VERSION (ex.: 202608)
// Entrada opcional: DATA=AAAA-MM-DD para publicar/simular um dia específico.
import fs from 'node:fs';

const AGENDA = 'agenda.json';
const REGISTRO = 'publicados.json';
const GRAPH = `https://graph.facebook.com/${process.env.GRAPH_VERSION || 'v23.0'}`;
const LI_VERSION = process.env.LINKEDIN_VERSION || '202608';
const RAW = 'https://raw.githubusercontent.com/justinmarcossss/cbrdoc-feed-publicacao/main/';

// Sem IG_USER_ID, descobre a conta do Instagram a partir do token (só precisa do token).
if (process.env.IG_ACCESS_TOKEN && !process.env.IG_USER_ID) {
  const r = await fetch(`${GRAPH}/me/accounts?fields=name,instagram_business_account{username}&access_token=${process.env.IG_ACCESS_TOKEN}`);
  const j = await r.json();
  if (j.error) console.error('Instagram: não consegui listar as páginas do token:', j.error.message);
  const contas = (j.data || []).filter(p => p.instagram_business_account);
  const conta = contas.find(p => /cbr/i.test(p.instagram_business_account.username || p.name)) || contas[0];
  if (conta) {
    process.env.IG_USER_ID = conta.instagram_business_account.id;
    console.log(`Conta do Instagram encontrada: @${conta.instagram_business_account.username} (página ${conta.name}).`);
  }
}

// Modo verificar: só confere se as chaves funcionam, sem publicar nada.
if (process.env.MODO === 'verificar') {
  const { IG_USER_ID: id, IG_ACCESS_TOKEN: token } = process.env;
  if (!id || !token) { console.log('Instagram: chaves ainda não configuradas.'); process.exit(1); }
  const r = await fetch(`${GRAPH}/${id}?fields=username,name,media_count&access_token=${token}`);
  const j = await r.json();
  if (!r.ok) { console.error('Instagram: ERRO', JSON.stringify(j.error || j)); process.exit(1); }
  const lim = await (await fetch(`${GRAPH}/${id}/content_publishing_limit?fields=quota_usage,config&access_token=${token}`)).json();
  const dbg = await (await fetch(`${GRAPH}/debug_token?input_token=${token}&access_token=${token}`)).json();
  const t = dbg.data || {};
  const venc = t.expires_at ? (t.expires_at === 0 ? 'nunca' : new Date(t.expires_at * 1000).toISOString().slice(0, 10)) : 'nunca';
  console.log(`Token: tipo ${t.type}, válido ${t.is_valid}, vence ${venc}, app ${t.application} (${t.app_id}), permissões ${(t.scopes || []).join(', ')}`);
  if (t.app_id) {
    const app = await (await fetch(`${GRAPH}/${t.app_id}?fields=name,link&access_token=${token}`)).json();
    console.log('App:', JSON.stringify(app.error ? app.error.message : app));
  }
  console.log(`Instagram OK: @${j.username} (${j.media_count} posts). Limite de publicação: ${JSON.stringify(lim.data?.[0] || lim.error?.message || lim)}`);
  process.exit(0);
}

const hoje = process.env.DATA ||
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const agenda = JSON.parse(fs.readFileSync(AGENDA, 'utf8'));
const registro = fs.existsSync(REGISTRO) ? JSON.parse(fs.readFileSync(REGISTRO, 'utf8')) : {};
const post = agenda.find(p => p.data === hoje);

if (!post) { console.log(`Nenhum post agendado para ${hoje}.`); process.exit(0); }
console.log(`Post de ${hoje}: ${post.titulo}`);
const antes = JSON.stringify(registro);
registro[post.slug] ||= {};

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function req(url, opts = {}) {
  const r = await fetch(url, opts);
  const txt = await r.text();
  if (!r.ok) throw new Error(`${opts.method || 'GET'} ${url.split('?')[0]} → ${r.status}: ${txt.slice(0, 500)}`);
  return { res: r, body: txt ? (() => { try { return JSON.parse(txt); } catch { return txt; } })() : null };
}

// ---------- Instagram: carrossel ----------
async function instagram() {
  const { IG_USER_ID: id, IG_ACCESS_TOKEN: token } = process.env;
  if (registro[post.slug].instagram) return console.log('Instagram: já publicado, pulando.');
  if (!id || !token) return console.log(`Instagram (simulação): ${post.imagens.length} imagens + legenda de ${post.legenda.length} caracteres.`);
  const form = o => ({ method: 'POST', body: new URLSearchParams({ ...o, access_token: token }) });
  const filhos = [];
  for (const url of post.imagens) {
    const { body } = await req(`${GRAPH}/${id}/media`, form({ image_url: url, is_carousel_item: 'true' }));
    filhos.push(body.id);
  }
  const { body: carrossel } = await req(`${GRAPH}/${id}/media`, form({ media_type: 'CAROUSEL', children: filhos.join(','), caption: post.legenda }));
  for (let i = 0; i < 20; i++) {
    const { body } = await req(`${GRAPH}/${carrossel.id}?fields=status_code&access_token=${token}`);
    if (body.status_code === 'FINISHED') break;
    if (body.status_code === 'ERROR') throw new Error('Instagram recusou o carrossel (status ERROR).');
    await sleep(5000);
  }
  if (process.env.MODO === 'ensaio') return console.log(`Instagram (ensaio): carrossel ${carrossel.id} montado e aceito pela Meta, NÃO publicado.`);
  const { body: pub } = await req(`${GRAPH}/${id}/media_publish`, form({ creation_id: carrossel.id }));
  registro[post.slug].instagram = { id: pub.id, em: new Date().toISOString() };
  console.log(`Instagram: publicado (${pub.id}).`);
}

// ---------- LinkedIn: documento PDF na página da empresa ----------
// O texto do LinkedIn exige escapar caracteres reservados.
// Título do documento no LinkedIn: no máximo 50 caracteres, cortando numa palavra inteira.
const tituloDoc = t => t.length <= 50 ? t : t.slice(0, 50).replace(/\s+\S*$/, '').replace(/[,.;:]$/, '');
const liEscape = s => s.replace(/[\\|{}@\[\]()<>#*_~]/g, c => '\\' + c);
async function linkedin() {
  const { LINKEDIN_ORG_ID: org, LINKEDIN_ACCESS_TOKEN: token } = process.env;
  if (registro[post.slug].linkedin) return console.log('LinkedIn: já publicado, pulando.');
  const pdf = `pdf/${post.slug}.pdf`;
  if (!org || !token) return console.log(`LinkedIn (simulação): documento ${pdf} + legenda.`);
  const owner = `urn:li:organization:${org}`;
  const h = { Authorization: `Bearer ${token}`, 'LinkedIn-Version': LI_VERSION, 'X-Restli-Protocol-Version': '2.0.0', 'Content-Type': 'application/json' };
  const { body: init } = await req('https://api.linkedin.com/rest/documents?action=initializeUpload',
    { method: 'POST', headers: h, body: JSON.stringify({ initializeUploadRequest: { owner } }) });
  const { uploadUrl, document } = init.value;
  if (process.env.MODO === 'ensaio') return console.log(`LinkedIn (ensaio): token e página OK, upload do documento liberado (${document}). Nada publicado.`);
  await req(uploadUrl, { method: 'PUT', headers: { Authorization: `Bearer ${token}` }, body: fs.readFileSync(pdf) });
  await sleep(8000);
  const { res } = await req('https://api.linkedin.com/rest/posts', {
    method: 'POST', headers: h, body: JSON.stringify({
      author: owner, commentary: liEscape(post.legenda), visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      content: { media: { title: tituloDoc(post.titulo), id: document } },
      lifecycleState: 'PUBLISHED', isReshareDisabledByAuthor: false
    })
  });
  const postId = res.headers.get('x-restli-id');
  registro[post.slug].linkedin = { id: postId, em: new Date().toISOString() };
  console.log(`LinkedIn: publicado (${postId}).`);
}

let falhou = false;
for (const [rede, fn] of [['Instagram', instagram], ['LinkedIn', linkedin]]) {
  try { await fn(); } catch (e) { falhou = true; console.error(`${rede}: ERRO ${e.message}`); }
}
for (const k in registro) if (!Object.keys(registro[k]).length) delete registro[k];
if (JSON.stringify(registro) !== antes) fs.writeFileSync(REGISTRO, JSON.stringify(registro, null, 2));
process.exit(falhou ? 1 : 0);
