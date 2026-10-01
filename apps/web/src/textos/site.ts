// RASCUNHO: texto público ainda sem revisão do guardião da marca. Não é texto final.
// Fonte: docs/marca/identidade.md. O slogan foi aceito pelo Felipe em 2026-09-26; o resto é proposta.
// A afirmar com cuidado: nenhum PSD exportado pelo Otto foi aberto no Photoshop ainda (ADR 035, portão
// da fatia de exportação). Por isso o ponto sobre PSD fala do arquivo, não do que o Photoshop faz com ele.

export const site = {
  tituloDaPagina: 'Otto',
  descricaoDaPagina: 'Editor de design em camadas com um agente dentro. O agente faz a produção, você faz o design.',
  marca: 'Otto',
  slogan: { producao: 'O agente faz a produção,', design: 'você faz o design.' },
  apoio: 'O Otto é um editor em camadas com um colega de estúdio dentro. Você passa o briefing, ele monta a peça, confere o que fez e entrega as alterações para você revisar.',
  pontos: [
    { rotulo: '01', titulo: 'Sai em camadas', texto: 'Texto continua texto, forma continua forma. O resultado é um documento editável, nunca uma imagem chapada.' },
    { rotulo: '02', titulo: 'Você revisa antes', texto: 'As alterações do Otto chegam marcadas. Você aceita, ajusta à mão ou desfaz tudo em um passo.' },
    { rotulo: '03', titulo: 'Exporta para PSD', texto: 'O arquivo leva as camadas, as fontes e um relatório do que foi em pixel. Você termina onde quiser.' },
  ],
  abrirOEditor: 'Abrir o editor',
  ilustracao: 'Três pranchetas sobrepostas; a do meio tem o contorno tracejado em âmbar das alterações do Otto',
  legendaDaIlustracao: 'alterada pelo Otto',
  rodape: 'ottobr.ai',
} as const;
