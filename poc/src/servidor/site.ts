// Lê o site da marca num Chrome sem janela (DevTools Protocol, sem dependência nova) e mede o que
// a página MOSTRA: fundo por área visível, tipografia por volume de texto, botões e logo. Um site
// carrega CSS de framework com dezenas de cores que ninguém vê; contar o CSS escrito erra a marca.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { lookup } from 'node:dns/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { guardarArquivo } from './armazenamento';
import { catalogoGoogle } from './googleFonts';
import { enderecoPublico, type FichaDaMarca, fichaDaMarca, type MedidasDoSite, urlPermitida } from './marca';
import { importarSvg } from './svg';

const CHROME = process.env.OTTO_CHROME ?? ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((c) => existsSync(c));
const LARGURA = 1366;
const ALTURA = 900;
const CAPTURA = 900;
/** telas lidas de cima para baixo (a primeira é a que mais diz da marca) */
const TELAS = 3;

export interface SiteLido {
  ficha: FichaDaMarca;
  /** captura do topo da página (jpeg), para o diretor de arte e o revisor verem a marca */
  captura: { hash: string; largura: number; altura: number };
  logo?: { no: { tipo: 'vetor'; moldura: [number, number]; caminhos: unknown[]; origem: { arquivo: string; nome: string } }; avisos: string[] } | { imagem: { hash: string; largura: number; altura: number }; avisos: string[] };
  avisos: string[];
}

export async function lerSite(entrada: string, sinal?: AbortSignal): Promise<SiteLido> {
  const url = urlPermitida(entrada);
  if (!url) throw new Error('endereço inválido: use o site público da marca (ex.: marca.com.br)');
  const ips = await lookup(url.hostname, { all: true }).catch(() => []);
  if (!ips.length) throw new Error(`não achei o site ${url.hostname}`);
  if (ips.some((ip) => !enderecoPublico(ip.address))) throw new Error('o endereço aponta para uma rede interna; o Otto só lê site público');
  if (!CHROME) throw new Error('Chrome não encontrado nesta máquina (defina OTTO_CHROME)');

  const avisos: string[] = [];
  const nav = await abrirNavegador(sinal);
  try {
    const aba = await nav.novaAba();
    await aba.enviar('Emulation.setDeviceMetricsOverride', { width: LARGURA, height: ALTURA, deviceScaleFactor: 1, mobile: false });
    await aba.enviar('Page.enable');
    const carregou = aba.esperar('Page.loadEventFired', 25_000);
    const nav1 = (await aba.enviar('Page.navigate', { url: url.href })) as { errorText?: string };
    if (nav1.errorText) throw new Error(`o site não abriu (${nav1.errorText})`);
    if (!(await carregou)) avisos.push('a página demorou a carregar; li o que já estava na tela');
    await espera(2000); // fontes, animações de entrada e carrosséis

    // site que navega de novo depois de carregar (redirecionamento por script, troca de idioma): mede de novo
    let medidas: (MedidasDoSite & { logo?: LogoMedido }) | undefined;
    for (let tentativa = 0; !medidas; tentativa++) {
      try {
        medidas = (await aba.avaliar(SCRIPT_DE_MEDIDA)) as MedidasDoSite & { logo?: LogoMedido };
      } catch (e) {
        if (tentativa >= 2 || !/navigated|closed|context/i.test(e instanceof Error ? e.message : '')) throw e;
        await aba.esperar('Page.loadEventFired', 10_000);
        await espera(2000);
      }
    }
    const u = urlPermitida(medidas.url);
    if (!u) throw new Error('o site redirecionou para um endereço que o Otto não lê');
    if (/n[ãa]o encontrad|not found|\b404\b|erro|error/i.test(medidas.titulo)) avisos.push(`o site abriu numa página de erro ("${medidas.titulo}"): a leitura pode não representar a marca; tente o endereço da página inicial`);
    const ficha = fichaDaMarca(medidas, await catalogoGoogle());

    const { data } = (await aba.enviar('Page.captureScreenshot', { format: 'jpeg', quality: 82, clip: { x: 0, y: 0, width: LARGURA, height: CAPTURA, scale: 1 } })) as { data: string };
    const meta = await guardarArquivo(Buffer.from(data, 'base64'), { tipo: 'image/jpeg', largura: LARGURA, altura: CAPTURA, origem: { banco: 'Site da marca', autor: u.hostname, licenca: 'referência, não entra na peça', url: u.href } });

    const logo = await logoDoSite(medidas.logo, aba, u, avisos);
    if (!ficha.tipografia.titulo) avisos.push('não achei título na página para ler a fonte de título');
    for (const papel of ['titulo', 'texto'] as const) {
      const t = ficha.tipografia[papel];
      if (t && !t.noGoogleFonts) avisos.push(`a fonte ${papel === 'titulo' ? 'de título' : 'de texto'} do site (${t.familia}) não está no Google Fonts${t.substituta ? `; sugiro ${t.substituta}` : ''}`);
    }
    return { ficha, captura: { hash: meta.hash, largura: LARGURA, altura: CAPTURA }, ...(logo ? { logo } : {}), avisos };
  } finally {
    await nav.fechar();
  }
}

interface LogoMedido {
  svg?: string;
  src?: string;
  caixa: [number, number, number, number];
  nome: string;
}

async function logoDoSite(l: LogoMedido | undefined, aba: Aba, base: URL, avisos: string[]): Promise<SiteLido['logo']> {
  if (!l) {
    avisos.push('não achei o logo no topo do site; envie o SVG no campo Logo');
    return undefined;
  }
  let svg = l.svg;
  if (!svg && l.src && /\.svg(\?|#|$)/i.test(l.src)) {
    const alvo = urlPermitida(new URL(l.src, base).href);
    if (alvo) {
      const r = await fetch(alvo, { signal: AbortSignal.timeout(10_000) }).catch(() => undefined);
      if (r?.ok) svg = (await r.text()).slice(0, 2_000_000);
    }
  }
  if (svg) {
    try {
      const v = importarSvg(svg);
      const meta = await guardarArquivo(Buffer.from(svg, 'utf8'), { tipo: 'image/svg+xml', largura: v.moldura[0], altura: v.moldura[1] });
      return { no: { tipo: 'vetor', moldura: v.moldura, caminhos: v.caminhos, origem: { arquivo: meta.hash, nome: `logo de ${base.hostname}.svg` } }, avisos: v.avisos };
    } catch (e) {
      avisos.push(`o logo do site é SVG, mas não consegui importar (${e instanceof Error ? e.message : String(e)}); uso a imagem`);
    }
  }
  // logo em pixel: recorte da página, só como referência (não recolore nem escala bem)
  const [x, y, w, h] = l.caixa;
  if (w < 8 || h < 8) return undefined;
  const { data } = (await aba.enviar('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, clip: { x, y, width: w, height: h, scale: 2 } })) as { data: string };
  const meta = await guardarArquivo(Buffer.from(data, 'base64'), { tipo: 'image/png', largura: Math.round(w * 2), altura: Math.round(h * 2), origem: { banco: 'Site da marca', autor: base.hostname, licenca: 'da conta', url: base.href } });
  return { imagem: { hash: meta.hash, largura: meta.largura, altura: meta.altura }, avisos: ['o logo do site está em imagem, não em vetor: peça o SVG ao cliente para usar na peça'] };
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- Chrome pelo DevTools Protocol ----------

interface Aba {
  enviar(metodo: string, params?: Record<string, unknown>): Promise<unknown>;
  esperar(evento: string, ms: number): Promise<boolean>;
  avaliar(expressao: string): Promise<unknown>;
}

export async function abrirNavegador(sinal?: AbortSignal): Promise<{ novaAba(): Promise<Aba>; fechar(): Promise<void> }> {
  const perfil = await mkdtemp(path.join(tmpdir(), 'otto-chrome-'));
  const proc = spawn(CHROME!, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${perfil}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars', '--mute-audio', '--disable-extensions', '--disable-sync', '--lang=pt-BR', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const fechar = async () => {
    proc.kill('SIGKILL');
    await rm(perfil, { recursive: true, force: true }).catch(() => undefined);
  };
  sinal?.addEventListener('abort', () => void fechar(), { once: true });

  const endereco = await new Promise<string>((resolve, reject) => {
    let saida = '';
    const t = setTimeout(() => reject(new Error('o Chrome não abriu a tempo')), 15_000);
    proc.stderr.on('data', (b: Buffer) => {
      saida += b.toString();
      const m = /DevTools listening on (ws:\/\/\S+)/.exec(saida);
      if (m) {
        clearTimeout(t);
        resolve(m[1]!);
      }
    });
    proc.on('exit', () => reject(new Error('o Chrome fechou antes de abrir')));
  }).catch(async (e: unknown) => {
    await fechar();
    throw e;
  });

  const ws = new WebSocket(endereco);
  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = () => reject(new Error('não conectei ao Chrome'));
  });
  let seq = 0;
  const pendentes = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  const ouvintes = new Set<(m: { method?: string; sessionId?: string }) => void>();
  ws.onmessage = (ev) => {
    const m = JSON.parse(String(ev.data)) as { id?: number; result?: unknown; error?: { message: string }; method?: string; sessionId?: string };
    if (m.id !== undefined) {
      const p = pendentes.get(m.id);
      pendentes.delete(m.id);
      if (m.error) p?.reject(new Error(m.error.message));
      else p?.resolve(m.result);
    } else for (const o of ouvintes) o(m);
  };
  const enviar = (metodo: string, params: Record<string, unknown> = {}, sessionId?: string, ms = 30_000) =>
    new Promise<unknown>((resolve, reject) => {
      const id = ++seq;
      const t = setTimeout(() => {
        pendentes.delete(id);
        reject(new Error(`o site não respondeu (${metodo})`));
      }, ms);
      pendentes.set(id, { resolve: (v) => (clearTimeout(t), resolve(v)), reject: (e) => (clearTimeout(t), reject(e)) });
      ws.send(JSON.stringify({ id, method: metodo, params, ...(sessionId ? { sessionId } : {}) }));
    });

  return {
    async novaAba() {
      const { targetId } = (await enviar('Target.createTarget', { url: 'about:blank' })) as { targetId: string };
      const { sessionId } = (await enviar('Target.attachToTarget', { targetId, flatten: true })) as { sessionId: string };
      return {
        enviar: (metodo, params) => enviar(metodo, params, sessionId),
        esperar: (evento, ms) =>
          new Promise<boolean>((resolve) => {
            const t = setTimeout(() => (ouvintes.delete(o), resolve(false)), ms);
            const o = (m: { method?: string; sessionId?: string }) => {
              if (m.method === evento && m.sessionId === sessionId) {
                clearTimeout(t);
                ouvintes.delete(o);
                resolve(true);
              }
            };
            ouvintes.add(o);
          }),
        async avaliar(expressao) {
          const r = (await enviar('Runtime.evaluate', { expression: expressao, awaitPromise: true, returnByValue: true }, sessionId)) as { result: { value?: unknown }; exceptionDetails?: { text: string; exception?: { description?: string } } };
          if (r.exceptionDetails) throw new Error(`erro ao medir a página: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
          return r.result.value;
        },
      };
    },
    async fechar() {
      try {
        ws.close();
      } catch {
        // já fechado
      }
      await fechar();
    },
  };
}

// ---------- o que roda dentro da página ----------

/** Mede a página renderizada. Devolve MedidasDoSite + logo. Roda no Chrome, por isso é texto. */
const SCRIPT_DE_MEDIDA = String.raw`(async () => {
  await document.fonts.ready;
  // banners de cookie e de consentimento cobrem o rodapé da tela e não são a marca
  for (const el of document.querySelectorAll('body *')) {
    const s = getComputedStyle(el);
    if (s.position !== 'fixed' && s.position !== 'sticky') continue;
    const nome = el.id + ' ' + el.className;
    const embaixo = el.getBoundingClientRect().top > innerHeight * 0.3;
    if (/cookie|consent|lgpd|gdpr/i.test(nome) || (embaixo && /cookie|consent|privacidade|lgpd/i.test((el.textContent || '').slice(0, 300)))) el.style.display = 'none';
  }
  const tela = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const hex = (c) => {
    if (!c) return undefined;
    tela.clearRect(0, 0, 1, 1);
    tela.fillStyle = '#000'; tela.fillStyle = c;
    tela.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = tela.getImageData(0, 0, 1, 1).data;
    if (a < 128) return undefined;
    return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
  };
  const LIMITE = innerHeight * ${TELAS};
  // visível e nas primeiras telas; posição absoluta na página
  const visivel = (el) => {
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) < 0.1) return false;
    const r = el.getBoundingClientRect();
    return r.width > 2 && r.height > 2 && r.bottom + scrollY > 0 && r.top + scrollY < LIMITE;
  };
  scrollTo(0, 0);

  // 1. fundo visível: grade de pontos em cada tela; em cada ponto, de cima para baixo na pilha,
  // a primeira coisa opaca (foto ou cor)
  const fundos = new Map(); let fotos = 0, total = 0;
  const corDaPagina = hex(getComputedStyle(document.body).backgroundColor) || hex(getComputedStyle(document.documentElement).backgroundColor) || '#ffffff';
  const alfa = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return 1; const p = m[1].split(/[ ,/]+/).filter(Boolean); return p.length > 3 ? Number(p[3]) : 1; };
  const altura = Math.min(document.documentElement.scrollHeight, LIMITE);
  for (let tela = 0; tela * innerHeight < altura; tela++) {
    scrollTo(0, tela * innerHeight);
    await new Promise((r) => setTimeout(r, 350));
    const ate = Math.min(innerHeight, altura - tela * innerHeight);
    for (let y = 6; y < ate; y += 24) for (let x = 6; x < innerWidth; x += 24) {
      total++;
      let cor;
      for (const el of document.elementsFromPoint(x, y)) {
        const tag = el.tagName;
        if (tag === 'IMG' || tag === 'VIDEO' || tag === 'CANVAS' || tag === 'PICTURE' || tag === 'IFRAME') { cor = 'foto'; break; }
        const s = getComputedStyle(el);
        if (s.backgroundImage && s.backgroundImage.includes('url(')) { cor = 'foto'; break; }
        const c = hex(s.backgroundColor);
        if (c && alfa(s.backgroundColor) > 0.5) { cor = c; break; }
        if (s.backgroundImage && s.backgroundImage.includes('gradient')) {
          const m = s.backgroundImage.match(/rgba?\([^)]+\)|#[0-9a-f]{3,8}/i); const g = m && hex(m[0]);
          if (g) { cor = g; break; }
        }
      }
      cor = cor || corDaPagina;
      if (cor === 'foto') fotos++; else fundos.set(cor, (fundos.get(cor) || 0) + 1);
    }
  }
  scrollTo(0, 0);
  await new Promise((r) => setTimeout(r, 350));

  // 2. texto: cada elemento com texto próprio, pesado pelo número de caracteres
  const textos = []; const frases = [];
  const ehTitulo = (el, s) => /^H[1-3]$/.test(el.tagName) || parseFloat(s.fontSize) >= 28;
  for (const el of document.querySelectorAll('body *')) {
    if (!visivel(el) || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'svg'].includes(el.tagName)) continue;
    let proprio = '';
    for (const n of el.childNodes) if (n.nodeType === 3) proprio += n.textContent;
    proprio = proprio.replace(/\s+/g, ' ').trim();
    if (proprio.length < 2) continue;
    const s = getComputedStyle(el);
    const cor = hex(s.color); if (!cor) continue;
    const tamanho = parseFloat(s.fontSize);
    const titulo = ehTitulo(el, s);
    textos.push({ cor, familia: s.fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, ''), pilha: s.fontFamily, peso: Number(s.fontWeight) || 400, tamanho, caixaAlta: s.textTransform === 'uppercase' || (proprio === proprio.toUpperCase() && /[A-ZÀ-Ý]/.test(proprio) && proprio.length > 3), espacamento: s.letterSpacing === 'normal' ? 0 : (parseFloat(s.letterSpacing) / tamanho) * 1000, caracteres: Math.min(proprio.length, 400), papel: titulo ? 'titulo' : 'texto' });
    if (titulo && frases.length < 8 && proprio.length <= 140) frases.push(proprio);
  }

  // 3. botões e chamadas
  const botoes = [];
  for (const el of document.querySelectorAll('button, [role=button], a, input[type=submit]')) {
    if (!visivel(el) || botoes.length >= 20) continue;
    const s = getComputedStyle(el); const fundo = hex(s.backgroundColor);
    const r = el.getBoundingClientRect();
    if (!fundo || fundo === corDaPagina || r.height < 28 || r.height > 90 || r.width < 60 || r.width > 520) continue;
    botoes.push({ fundo, texto: hex(s.color) || '#000000', raio: parseFloat(s.borderTopLeftRadius) || 0, altura: r.height, caixaAlta: s.textTransform === 'uppercase' });
  }

  // 4. logo: no alto da página, dentro do cabeçalho ou com nome de logo, ou o link para a página inicial
  const candidatos = [];
  for (const el of document.querySelectorAll('svg, img, [class*=logo] , [id*=logo]')) {
    if (!visivel(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.top > 260 || r.width < 24 || r.height < 12 || r.width > 700 || r.height > 260) continue;
    const alvo = el.tagName === 'svg' || el.tagName === 'IMG' ? el : el.querySelector('svg, img');
    if (!alvo) continue;
    const texto = (el.id + ' ' + el.className?.baseVal + ' ' + el.className + ' ' + (el.getAttribute('alt') || '') + ' ' + (el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('src') || '')).toLowerCase();
    let pontos = 0;
    if (/logo|brand|marca/.test(texto)) pontos += 3;
    if (el.closest('header, nav, [class*=header], [class*=navbar]')) pontos += 2;
    const link = el.closest('a');
    if (link && (link.getAttribute('href') === '/' || link.href === location.origin + '/' || link.href === location.href)) pontos += 3;
    pontos -= r.top / 200 + r.left / 1400;
    if (alvo.tagName === 'svg' && alvo.querySelectorAll('path, circle, rect, polygon, ellipse').length === 1 && r.width < 40) pontos -= 3; // ícone de menu
    candidatos.push({ alvo, pontos, r });
  }
  candidatos.sort((a, b) => b.pontos - a.pontos);
  let logo;
  const escolhido = candidatos[0];
  if (escolhido && escolhido.pontos > 1) {
    const { alvo, r } = escolhido;
    const caixa = [r.left + scrollX, r.top + scrollY, r.width, r.height];
    if (alvo.tagName === 'svg') {
      // leva a cor calculada pelo CSS para dentro do SVG, e resolve <use> apontando para símbolos da página
      const copia = alvo.cloneNode(true);
      const origem = [alvo, ...alvo.querySelectorAll('*')]; const destino = [copia, ...copia.querySelectorAll('*')];
      origem.forEach((o, i) => {
        const d = destino[i]; if (!d || !d.setAttribute) return;
        const s = getComputedStyle(o);
        if (['path', 'circle', 'rect', 'polygon', 'ellipse', 'line', 'polyline'].includes(o.tagName)) {
          const f = hex(s.fill); d.setAttribute('fill', s.fill === 'none' || !f ? 'none' : f);
          const t = hex(s.stroke); if (t && s.stroke !== 'none') { d.setAttribute('stroke', t); d.setAttribute('stroke-width', s.strokeWidth); }
          if (s.fillRule === 'evenodd') d.setAttribute('fill-rule', 'evenodd');
        }
      });
      for (const u of copia.querySelectorAll('use')) {
        const id = (u.getAttribute('href') || u.getAttribute('xlink:href') || '').replace(/^#/, '');
        const alvoUse = id && document.getElementById(id);
        if (alvoUse) { const g = document.createElementNS('http://www.w3.org/2000/svg', 'g'); for (const c of alvoUse.childNodes) g.appendChild(c.cloneNode(true)); u.replaceWith(g); if (!copia.getAttribute('viewBox') && alvoUse.getAttribute('viewBox')) copia.setAttribute('viewBox', alvoUse.getAttribute('viewBox')); }
      }
      if (!copia.getAttribute('viewBox')) copia.setAttribute('viewBox', '0 0 ' + r.width + ' ' + r.height);
      copia.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      logo = { svg: copia.outerHTML, caixa, nome: 'logo' };
    } else logo = { src: alvo.currentSrc || alvo.src, caixa, nome: 'logo' };
  }

  const areaTotal = total || 1;
  return {
    url: location.href,
    titulo: document.title.slice(0, 160),
    descricao: (document.querySelector('meta[name=description], meta[property="og:description"]')?.getAttribute('content') || '').slice(0, 300),
    corDoTema: hex(document.querySelector('meta[name=theme-color]')?.getAttribute('content') || ''),
    fundos: [...fundos.entries()].map(([cor, n]) => ({ cor, area: n / areaTotal })).filter((f) => f.area >= 0.005),
    fotos: fotos / areaTotal,
    textos,
    botoes,
    frases,
    logo,
  };
})()`;
