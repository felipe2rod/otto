// Teste de pacote por sentinela (ADR 019, guarda 2): o visitante do site público não baixa o código
// do editor nem um .wasm.
//
// Em vez de ler o manifesto do Next (o formato muda com o empacotador), olha o que o build gerou:
// abre o HTML de cada página pública, pega os scripts que ele cita, segue os scripts que esses
// citam, e procura em todos eles as sequências proibidas.
//
// Este arquivo roda no Node sem empacotador (só apaga os tipos): nada de enum nem de import sem extensão.

export interface LeitorDoBuild {
  /** Conteúdo de um arquivo, com o caminho relativo à pasta do build (.next). Ausente: undefined. */
  ler(caminho: string): string | undefined;
  /** Arquivos de uma pasta, em profundidade, com o caminho relativo à pasta do build. */
  listar(pasta: string): string[];
}

export interface Conferencia {
  violacoes: string[];
  conferido: { paginas: number; scripts: number };
}

const SCRIPT_CITADO = /static\/[A-Za-z0-9_.~/-]+?\.js\b/g;
const WASM = /\.wasm\b/i;

/** Rota pública → arquivo HTML que o build gera para ela. */
const htmlDaRota = (rota: string): string => `server/app/${rota === '/' ? 'index' : rota.replace(/^\//, '')}.html`;

const scriptsCitados = (texto: string): string[] => [...new Set(texto.match(SCRIPT_CITADO) ?? [])];

/**
 * @param opcoes.rotas rotas públicas (a lista de src/site/rotas.ts)
 * @param opcoes.proibidos sentinelas que não podem aparecer em script público. Cada uma TEM de
 *   existir em algum script do build: é a prova de que a procura funciona depois da minificação.
 */
export function conferirPacotePublico(
  build: LeitorDoBuild,
  opcoes: {
    rotas: readonly string[];
    proibidos: readonly string[];
    /** Rotas só de desenvolvimento: se alguma aparecer no build, ele falha. */
    rotasQueNaoPodemExistir?: readonly string[];
  },
): Conferencia {
  const violacoes: string[] = [];
  const proibidos = opcoes.proibidos.map((p) => p.toLowerCase());
  const todosOsScripts = new Set<string>();
  let paginas = 0;

  for (const rota of opcoes.rotas) {
    const arquivoHtml = htmlDaRota(rota);
    const html = build.ler(arquivoHtml);
    if (html === undefined) {
      violacoes.push(`${rota} não foi gerada como página estática (falta ${arquivoHtml})`);
      continue;
    }
    paginas++;
    const procurar = (texto: string, onde: string) => {
      const minusculas = texto.toLowerCase();
      for (let i = 0; i < proibidos.length; i++) {
        if (minusculas.includes(proibidos[i] as string)) violacoes.push(`${rota} carrega código do editor: "${opcoes.proibidos[i]}" em ${onde}`);
      }
      if (WASM.test(texto)) violacoes.push(`${rota} cita um .wasm em ${onde}`);
    };
    // o próprio HTML: componente de servidor que importou do editor deixa a marca aqui, não em script
    procurar(html, arquivoHtml);

    // os scripts que a página cita, e os que eles citam, até não aparecer nenhum novo
    const alcancados = new Set<string>();
    const fila = scriptsCitados(html);
    if (fila.length === 0) {
      violacoes.push(`${rota} não cita nenhum script de static/: o formato do build mudou?`);
      continue;
    }
    while (fila.length > 0) {
      const script = fila.shift() as string;
      if (alcancados.has(script)) continue;
      const texto = build.ler(script);
      if (texto === undefined) continue;
      alcancados.add(script);
      todosOsScripts.add(script);

      procurar(texto, script);
      fila.push(...scriptsCitados(texto));
    }
  }

  for (const rota of opcoes.rotasQueNaoPodemExistir ?? []) {
    const pasta = `server/app${rota}`;
    const achado = build.listar(pasta)[0] ?? (build.ler(`${pasta}.html`) !== undefined ? `${pasta}.html` : undefined);
    if (achado) violacoes.push(`${rota} é rota só de desenvolvimento e está no build (${achado})`);
  }

  // Controle: cada sentinela precisa estar em ALGUM script do build. Se não estiver (foi renomeada,
  // o empacotador a removeu), não achá-la nas páginas públicas não quer dizer nada.
  if (violacoes.length === 0) {
    const scripts = build
      .listar('static')
      .filter((a) => a.endsWith('.js'))
      .map((a) => build.ler(a)?.toLowerCase() ?? '');
    for (const sentinela of opcoes.proibidos) {
      if (!scripts.some((texto) => texto.includes(sentinela.toLowerCase()))) violacoes.push(`a sentinela "${sentinela}" não está em nenhum script do build: o teste não prova nada`);
    }
  }

  return { violacoes, conferido: { paginas, scripts: todosOsScripts.size } };
}
