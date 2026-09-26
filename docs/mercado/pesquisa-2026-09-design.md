# Pesquisa de mercado — editor de design com agente (setembro de 2026)

Levantamento feito em 2026-09-26 por pesquisa aberta na web (desk research), depois do pivô do ADR 026. Substitui, para o produto atual, a pesquisa de 2026-09-08, que era do Otto Atendente e foi arquivada em `docs/arquivo/whatsapp/mercado/`.

**Aviso de método.** Isto é pesquisa de escritório, não de campo. Pela skill `behavioral-evidence`, quase tudo aqui é grau **COMPARÁVEL** (dado de terceiro) ou **RELATADO** (reclamação pública, amostra enviesada por construção: quem escreve em fórum é quem está com raiva). Serve para achar padrão, não para medir. Três ressalvas específicas:

- **Muita fonte é secundária.** Várias páginas oficiais (adobe.com/helpx, canva.com, dpreview) devolveram 403 para a ferramenta de leitura. Onde o número veio de site agregador de preço ou de review, a tabela diz "secundária". Número de fonte secundária é para ordem de grandeza, não para contrato.
- **Quase tudo que importa está em beta.** Assistente do Photoshop, Firefly AI Assistant, Canva AI 2.0, agente do Figma, `use_figma`, Claude Design. Beta muda de preço e de escopo sem aviso. Datas estão em cada linha.
- **Nenhuma conversa com designer brasileiro.** O que falta é isso, e a pesquisa não substitui.

---

## 1. Resumo executivo — o que muda o plano

1. **A Adobe já faz o caso de uso nº 1 do Otto, dentro do PSD nativo, em beta.** O AI Assistant do Photoshop para desktop entrou em beta em 19/06/2026 e faz, entre outras coisas, "smart resizing": ajusta layout e posição dos objetos para outros formatos (pôster, anúncio, rede social), apaga camadas vazias e renomeia camadas ([Adobe Community](https://community.adobe.com/announcements-698/photoshop-desktop-ai-assistant-early-beta-1628556)). Na web e no celular está em beta público desde 11/03/2026 ([WinBuzzer](https://winbuzzer.com/2026/03/11/adobe-photoshop-ai-assistant-public-beta-web-mobile-xcxwbn/)). "Adaptar formatos" não é espaço vazio; é corrida contra o dono do formato.
2. **Agente operando editor profissional em camadas já existe de graça.** O Affinity virou gratuito em 29/10/2025 ([Canva Newsroom](https://www.canva.com/newsroom/news/affinity-free/), [Wikipedia](https://en.wikipedia.org/wiki/Affinity_(software))) e desde 28/04/2026 tem conector oficial com o Claude, com leitura e escrita no documento aberto, edição em lote, renomear camadas e scripts persistentes ([Anthropic](https://www.anthropic.com/news/claude-for-creative-work), [XDA](https://www.xda-developers.com/connected-claude-to-affinity-batch-edit-designs-write-scripts/)).
3. **"IA que entrega PSD em camadas" também não é exclusividade.** A Lovart exporta PSD multicamada a partir do que gera e separa pôster pronto em texto, objeto e fundo editáveis ([Lovart no X](https://x.com/lovart_ai/status/2044418662124470690), [AIbase, 12/11/2025](https://news.aibase.com/news/22743)). O Canva lançou o Magic Layers (imagem chapada vira design editável) em março de 2026 ([Business Wire](https://secure.businesswire.com/news/home/20260311951174/en/Canva-Introduces-Magic-Layers-Turning-Static-AI-Outputs-Into-Editable-Designs)).
4. **O que ninguém faz bem, pelo que foi possível verificar: PSD de volta com texto vivo, fora da Adobe.** O Canva importa PSD mas **não exporta** PSD ([Canva Help](https://www.canva.com/help/ai-import/), via busca). Figma Buzz exporta PNG, JPG e PDF ([Designforce, 22/06/2026](https://designforce.co/blog/what-is-figma-buzz/)). O Affinity (versão antiga) rasteriza texto ao exportar PSD ([XDA, 2024](https://www.xda-developers.com/switch-from-photoshop-to-affinity/)). A exceção é o Photopea, que lê e grava PSD e custa US$ 5/mês ([Builtplain](https://www.builtplain.com/photopea-free-app-ad-revenue/)).
5. **O Photopea é o concorrente estrutural mais perigoso para o formato do Otto.** Editor de PSD no navegador, gratuito com anúncio, API de script gratuita ([Photopea API](https://www.photopea.com/api/)) e já tem MCP da comunidade que exporta PSD ([GitHub attalla1](https://github.com/attalla1/photopea-mcp-server)). Qualquer um monta "agente + PSD no navegador" em cima dele.
6. **Preço de âncora no Brasil caiu.** A Adobe cortou 37% a 39% no Brasil em novembro de 2025, citando concorrência: Photoshop foi para R$ 65/mês no plano anual ([Hardware.com.br, 19/11/2025](https://www.hardware.com.br/noticias/photoshop-illustrator-premiere-pro-mais-barato-brasil/)). Canva Pro está em R$ 290/ano ([Darlan Evandro, 08/01/2026](https://www.darlanevandro.com.br/canva-pro-valor-quanto-custa/)). O Otto vai ser comparado com isso.
7. **Créditos de IA são a reclamação da categoria.** Plano só de Photoshop novo traz 25 créditos generativos por mês ([adobe.com/br](https://www.adobe.com/br/products/photoshop/plans.html)); fórum da Adobe reclama ([PhotoshopCAFE](https://photoshopcafe.com/generative-credits-to-be-enforced-adobe-cc-plans-change/)); o fórum do Figma também, por crédito queimado em erro da própria IA ([Figma Forum](https://forum.figma.com/report-a-problem-6/complaints-about-ai-credit-usage-52869)). Preço previsível é diferencial possível.

---

## 2. Mapa competitivo

| Grupo | Quem | Preço típico | Para quem | Exporta PSD editável? |
|---|---|---|---|---|
| **A. Dona do formato** | Adobe Photoshop + AI Assistant + Firefly AI Assistant | R$ 65/mês (Photoshop, anual) | Designer profissional | Sim, é o formato nativo |
| **B. Plataforma de massa** | Canva (AI 2.0, Magic Layers), Affinity grátis | US$ 15/mês Pro; Affinity grátis | Do leigo ao designer | Canva: não. Affinity: exporta, texto rasterizado (versão antiga) |
| **C. Design de produto** | Figma (agente, Buzz, Weave, Make) | US$ 16/mês assento Full, anual | Time de produto e marketing | Não verificado; Buzz exporta PNG/JPG/PDF |
| **D. Editor de PSD no navegador** | Photopea, Pixlr | US$ 5/mês; US$ 2,49 a 49,99/mês | Quem não paga Adobe | Photopea sim; Pixlr não |
| **E. Agente/gerador de design** | Lovart, Recraft, Kittl, Krea, Claude Design, Google Pomelli/Stitch/Mixboard, Microsoft Designer | Grátis a ~US$ 160/mês | Criador, marketing, designer em exploração | Lovart sim; Recraft SVG; demais não verificado ou não |
| **F. Automação criativa para anúncio** | Creatopy (The Brief), Bannerflow, Celtra, Marpipe, AdCreative, Pencil, Adobe GenStudio | US$ 29/mês a contrato enterprise | Agência e time de performance | Importam PSD (Creatopy); exportar PSD não verificado |
| **G. SDK de editor** | Polotno | US$ 899/mês | Quem quer embutir editor | Importa PSD; não exporta PSD |
| **H. Agente de uso geral com conector** | Claude, ChatGPT, Gemini + conectores Adobe/Canva/Figma/Affinity; MCPs da comunidade | Assinatura do chat | Qualquer um | Depende do app conectado |

**Leitura:** o Otto nasce entre A e D (editor profissional, PSD, navegador) com o agente de E. A briga real é contra **A** (a Adobe fazendo o mesmo dentro do Photoshop) e contra **H** (o agente morando no chat e o editor virando commodity).

---

## 3. Incumbentes

### 3.1 Adobe

| Item | Estado em 2026-09-26 | Fonte |
|---|---|---|
| AI Assistant no Photoshop web e celular | Beta público desde 11/03/2026. Modo automático e modo guiado; "AI Markup" (desenhar sobre a imagem + prompt). Pagantes com geração ilimitada até 09/04/2026; preço pós-beta não anunciado | [WinBuzzer](https://winbuzzer.com/2026/03/11/adobe-photoshop-ai-assistant-public-beta-web-mobile-xcxwbn/) |
| AI Assistant no Photoshop desktop | Beta desde 19/06/2026. Edições em várias etapas no composto inteiro; **smart resizing** de layout para outros formatos; apagar camadas vazias e renomear | [Adobe Community](https://community.adobe.com/announcements-698/photoshop-desktop-ai-assistant-early-beta-1628556) |
| Limites do assistente no desktop | Só inglês no beta; exige internet (nuvem); ações generativas gastam créditos; "80% do caminho", ajuste fino continua manual | [PhotoWorkout, 22/06/2026](https://www.photoworkout.com/photoshop-ai-assistant-desktop-beta/) |
| Firefly AI Assistant (ex-Project Moonlight) | Agente que orquestra Photoshop, Premiere, Lightroom, Illustrator, Express e Frame.io. Exemplo dado pela Adobe: redimensionar um conjunto de imagens para redes sociais. Beta público anunciado "nas próximas semanas" em 15/04/2026 | [The Next Web](https://thenextweb.com/news/adobe-firefly-ai-assistant-creative-cloud-agentic-workflows) |
| "Adobe Creative Agent" | Citado na teleconferência do 3º trimestre de 2026 como orquestrador de fluxos complexos no Photoshop e Premiere | [Motley Fool, transcrição 11/09/2026](https://www.fool.com/earnings/call-transcripts/2026/09/11/adobe-adbe-q3-2026-earnings-call-transcript/) |
| Modelos de terceiros | Photoshop aceita modelos de parceiros (Google, Black Forest Labs); Firefly Image Editor com mais de 25 modelos de terceiros | [OpusClip](https://www.opus.pro/blog/adobe-photoshop-ai-assistant-agentic-ai-future-content-creation), [WinBuzzer](https://winbuzzer.com/2026/03/11/adobe-photoshop-ai-assistant-public-beta-web-mobile-xcxwbn/) |
| Firefly Image 5 com edição em camadas | Modelo trata objetos como camadas editáveis por prompt; em prévia | [TechCrunch, 28/10/2025](https://techcrunch.com/2025/10/28/adobe-firefly-image-5-brings-support-for-layers-will-let-creators-make-custom-models/) |
| Adobe Express | Bulk Create até 99 variações a partir de CSV; redimensionar (Premium); kit de marca; **exporta design como PSD em camadas** | [Adobe Help — Bulk create](https://helpx.adobe.com/express/web/bulk-create-and-automate/bulk-create.html), [Adobe Help — export PSD](https://helpx.adobe.com/il_en/express/web/print-and-export/export-to-photoshop.html) (via busca) |
| Adobe dentro de LLMs de terceiros | Photoshop, Express e Acrobat no ChatGPT; "Adobe for Claude" com 50+ ferramentas; Photoshop, Lightroom, Express e Firefly no Gemini desde 24/09/2026 | [The Decoder](https://the-decoder.com/adobe-brings-photoshop-acrobat-and-express-directly-to-chatgpt/), [9to5Mac, 24/09/2026](https://9to5mac.com/2026/09/24/adobe-expands-creative-tool-access-to-google-gemini-brings-acrobat-to-claude/) |
| Limite do conector Adobe no Claude | Opera no nível do Express; "não iguala a profundidade do Photoshop desktop"; sem gatilho por evento. Edição por camadas no Express via Claude anunciada em 09/2026 | [Carly (secundária)](https://www.usecarly.com/blog/claude-adobe-integration/), [The AI Economy](https://theaieconomy.substack.com/p/adobe-ai-chatbot-gemini-acrobat-claude) |
| GenStudio for Performance Marketing | Variações de tamanho, idioma e formato para anúncio, em escala; preço só sob consulta | [Adobe](https://business.adobe.com/products/genstudio/performance-marketing.html), [TrustRadius](https://www.trustradius.com/products/adobe-genstudio-for-performance-marketing/pricing) |
| Contexto financeiro | Receita de assinatura para profissionais criativos e de marketing US$ 4,65 bi no trimestre (+13%); MAU freemium criativo passou de 100 milhões; ações ~43% abaixo (em abril de 2026) | [Yahoo Finance](https://finance.yahoo.com/markets/stocks/articles/adobe-inc-adbe-q3-2026-090037567.html) (via busca), [The Next Web](https://thenextweb.com/news/adobe-firefly-ai-assistant-creative-cloud-agentic-workflows) |

**Preços Adobe no Brasil**

| Plano | Preço | Créditos generativos/mês | Fonte |
|---|---|---|---|
| Photoshop (anual, cobrança mensal) | R$ 65/mês | 25 | [adobe.com/br](https://www.adobe.com/br/products/photoshop/plans.html) |
| Photoshop (mensal, sem fidelidade) | R$ 98/mês | não verificado | [Hardware.com.br](https://www.hardware.com.br/noticias/photoshop-illustrator-premiere-pro-mais-barato-brasil/) |
| Antes do corte de nov/2025 | R$ 104/mês (anual); R$ 160/mês (mensal) | — | [Hardware.com.br](https://www.hardware.com.br/noticias/photoshop-illustrator-premiere-pro-mais-barato-brasil/) |
| Fotografia (Photoshop + Lightroom) | R$ 55/mês | 1.000 | [adobe.com/br](https://www.adobe.com/br/products/photoshop/plans.html) |
| Firefly Pro (inclui Photoshop web e celular) | R$ 95/mês | 4.000 | [adobe.com/br](https://www.adobe.com/br/products/photoshop/plans.html) |
| Creative Cloud Pro | R$ 214/mês cheio; R$ 99/mês no 1º ano (promoção) | 4.000 | [adobe.com/br](https://www.adobe.com/br/products/photoshop/plans.html) |
| Photoshop para equipes | R$ 169/mês por licença | não verificado | [adobe.com/br](https://www.adobe.com/br/products/photoshop/plans.html) |
| Creative Cloud Pro para equipes | R$ 480/mês por licença (R$ 383,95 no 1º ano) | não verificado | [adobe.com/br](https://www.adobe.com/br/products/photoshop/plans.html) |
| Créditos avulsos (USD) | 2.000 por US$ 9,99/mês; 7.000 por US$ 29,99; 10.000 por US$ 49,99; 50.000 por US$ 199 | — | [Fstoppers](https://fstoppers.com/education/adobes-new-ai-credit-cost-preview-photoshop-what-need-know-902663) |
| Custo por uso | Preenchimento generativo ~10 créditos com Firefly Image 5; até 40 com modelo de parceiro | — | [Fstoppers](https://fstoppers.com/education/adobes-new-ai-credit-cost-preview-photoshop-what-need-know-902663) |

Os preços da página da Adobe foram lidos em 2026-09-26; a Adobe roda promoção com frequência.

### 3.2 Canva (e Affinity)

| Item | Estado | Fonte |
|---|---|---|
| Canva AI 2.0 | Anunciado em 16/04/2026, prévia de pesquisa para o primeiro milhão de usuários. Design conversacional que gera objetos editáveis, edição agêntica iterativa, "layered object intelligence", memória, conectores, agendamento, "brand intelligence" | [Canva Newsroom](https://www.canva.com/newsroom/news/canva-create-2026-ai/) (via busca), [Fortune, 16/04/2026](https://fortune.com/2026/04/16/canva-ai-agentic-design-suite-coo-cliff-obrecht/) |
| Escala | 265 milhões de MAU; US$ 4 bi de receita em 2025 | [Fortune](https://fortune.com/2026/04/16/canva-ai-agentic-design-suite-coo-cliff-obrecht/) |
| Brasil | Segundo maior mercado em usuários, entre os cinco maiores em receita; 3,9 milhões de designs por dia no Brasil | [Voxnews](https://voxnews.com.br/canva-revela-tendencias-criativas-para-2026-e-destaca-protagonismo-do-brasil-no-uso-de-ia/) (via busca; secundária) |
| Magic Layers | Imagem chapada vira design editável, texto vivo. Lançado em 11/03/2026; mais de 9 milhões de usos no primeiro mês e pouco | [Business Wire](https://secure.businesswire.com/news/home/20260311951174/en/Canva-Introduces-Magic-Layers-Turning-Static-AI-Outputs-Into-Editable-Designs), [Canva Newsroom](https://www.canva.com/newsroom/news/canva-claude-design/) (via busca) |
| PSD | Importa PSD até 300 MB; parte pode ser rasterizada; **não exporta PSD** | [Canva Help](https://www.canva.com/help/ai-import/), [Layersmith](https://layersmith.app/export-canva-to-psd) (via busca) |
| Preço (USD) | Free; Pro US$ 15/mês (US$ 180/ano); Business US$ 20/mês por pessoa (US$ 250/ano); AI Pass de US$ 100/pessoa/mês com 40× o uso de IA do Pro | [Aiproductivity](https://aiproductivity.ai/blog/canva-pricing/), [Costbench](https://costbench.com/software/design/canva/) (secundárias); o valor do AI Pass diverge: a [eesel](https://www.eesel.ai/blog/canva-ai-pricing) diz que o preço só aparece no checkout. **Não verificado na página oficial (403)** |
| Preço (BRL) | Pro R$ 290/ano ou ~R$ 35/mês; Teams R$ 470/ano até 5 pessoas | [Darlan Evandro, 08/01/2026](https://www.darlanevandro.com.br/canva-pro-valor-quanto-custa/) (secundária) |
| Affinity | Grátis desde 29/10/2025, com conta Canva; IA do Canva dentro do Affinity exige plano pago | [Canva Newsroom](https://www.canva.com/newsroom/news/affinity-free/), [Quark](https://www.quark.com/about/blog/affinity-by-canva-pricing-the-professional-cost-of-free) |
| Affinity + Claude | Conector oficial desde 28/04/2026: leitura e escrita no documento ativo, ajuste em lote, renomear camadas, cor, gradiente, modo de mesclagem, opacidade e texto em várias camadas, scripts persistentes; beta; exige Claude pago no desktop | [Anthropic](https://www.anthropic.com/news/claude-for-creative-work), [XDA, 14/05/2026](https://www.xda-developers.com/connected-claude-to-affinity-batch-edit-designs-write-scripts/) |
| Affinity e PSD | Na versão antiga (Affinity Photo), exportar PSD rasteriza texto e objeto inteligente vira camada chapada. **Não verificado para o Affinity unificado de 2025** | [XDA, 21/09/2024](https://www.xda-developers.com/switch-from-photoshop-to-affinity/) |
| Canva + Anthropic | Claude Design (Anthropic Labs, 17/04/2026) exporta para Canva, PDF, PPTX e HTML; não exporta PSD | [Anthropic](https://www.anthropic.com/news/claude-design-anthropic-labs) |

### 3.3 Figma

| Item | Estado | Fonte |
|---|---|---|
| Agente do Figma | Atualizado no Config (24/06/2026): skills reutilizáveis, conectores (Notion, Slack, GitHub, Atlassian etc.), conversa visível para o time; disponível para todos | [Figma Blog](https://www.figma.com/blog/config-2026-recap/) |
| Escrita no canvas por MCP (`use_figma`) | Desde fevereiro/março de 2026 agentes externos (Claude Code, Codex, Cursor) escrevem no arquivo usando componentes e variáveis. Grátis no beta; "vai virar recurso pago por uso". Exige assento Full | [Figma Developers](https://developers.figma.com/docs/figma-mcp-server/write-to-canvas), [Bitovi, 25/03/2026](https://www.bitovi.com/blog/figma-just-opened-the-canvas-to-agents.-heres-what-actually-happens) |
| Problemas observados no `use_figma` | Ignora o design system se não for lembrado toda vez; fixa cor e espaçamento em vez de usar variável; resultado muda entre execuções | [Bitovi](https://www.bitovi.com/blog/figma-just-opened-the-canvas-to-agents.-heres-what-actually-happens) |
| Figma Buzz | Beta desde o Config 2025. Peças de marketing a partir de modelo; criação em lote a partir de planilha; presets de tamanho para redes. Exporta PNG, JPG, PDF | [Designforce, 22/06/2026](https://designforce.co/blog/what-is-figma-buzz/) |
| Figma Weave | Canvas de nós para fluxos generativos (ex-Weavy). Free 150 créditos/mês; Starter 1.500 créditos; recarga US$ 10 por 1.000; até US$ 48/usuário/mês para times | [Figma Weave Help](https://help.weavy.ai/en/articles/12267070-figma-weave-s-subscription-plans) (via busca), [Luma](https://lumalabs.ai/news/weave-pricing) (secundária) |
| Preço | Starter grátis (150 créditos/dia, até 500/mês); Professional US$ 16/mês assento Full (anual), 3.000 créditos; Organization US$ 55; Enterprise US$ 90. Créditos não acumulam | [UX Magic, 09/2026](https://uxmagic.ai/blog/figma-pricing) (secundária) |
| Figma Make | 30 a 100+ créditos por pedido | [UX Magic](https://uxmagic.ai/blog/figma-pricing) (secundária) |
| PSD | Não encontrado suporte a exportar PSD | não verificado |

---

## 4. Editores no navegador com PSD

| Ferramenta | Modelo de negócio | Preço | PSD | IA / agente | Fonte |
|---|---|---|---|---|---|
| **Photopea** | Grátis com anúncio (~90% da receita); Premium; licença de auto-hospedagem | Premium US$ 5/mês; auto-hospedagem US$ 500 a 2.000/mês | Lê e grava, com camadas, estilos, máscaras, objetos inteligentes, texto. Qualidade relatada boa, mas "sem paridade" em alguns comportamentos de objeto inteligente; lento em imagem grande | Remover fundo, trocar e gerar imagem (Stable Diffusion); grátis 1 uso/dia, Premium 3.000 créditos/mês. API de script grátis; MCP da comunidade | [Builtplain, 04/08/2026](https://www.builtplain.com/photopea-free-app-ad-revenue/), [Wikipedia](https://en.wikipedia.org/wiki/Photopea), [Photopea API](https://www.photopea.com/api/), [Digi-tools](https://digi-tools.info/articles/photopea-review) |
| Photopea — números | Receita ~US$ 3 mi em 2024; ~1 milhão de usuários por dia (maio de 2025); custo anual ~US$ 12.600; um funcionário | — | — | — | [Builtplain](https://www.builtplain.com/photopea-free-app-ad-revenue/), [GetLatka](https://getlatka.com/companies/photopea) |
| **Pixlr** | Freemium com anúncio | US$ 2,49 a 49,99/mês | Abre PSD simples; complexo com máscara falha; **não exporta PSD** | 15+ modelos (Flux, Recraft, Kling etc.) | [Fastlancer](https://www.fastlancer.org/en/fastlancer-blog/pixlr-review/) (secundária) |
| **Photoroom** | Freemium, foco e-commerce | Pro US$ 7,50/mês; Max US$ 20,99; Ultra desde US$ 82,50 | não verificado | Fundo, lote (Pro 500 exportações/mês; Max 5.000) | [eesel](https://www.eesel.ai/blog/photoroom-pricing) (secundária) |
| **Kittl** | Freemium | Pro US$ 12/mês anual (US$ 19 mensal); Expert US$ 26 anual (US$ 49 mensal); Max US$ 48 anual | Não mencionado | "Agentic AI" que escreve prompt e escolhe modelo; 12+ modelos | [iTechGuides](https://www.itechguides.com/products/kittl/) (secundária), [Kittl](https://www.kittl.com/pricing) |
| **Polotno** (SDK) | Licença para embutir | US$ 899/mês ou US$ 9.990/ano por domínio | Importa PSD (máscara e efeito não suportado viram bitmap); **não exporta PSD** | — | [Polotno](https://polotno.com/sdk/resources/build-vs-buy), [Polotno docs](https://polotno.com/docs/psd-import) |
| **Adobe Photoshop web** | Incluso nos planos Adobe | ver 3.1 | Nativo | AI Assistant beta | ver 3.1 |

---

## 5. Agentes de design e automação criativa

| Ferramenta | O que faz | Preço | Exporta PSD? | Fonte |
|---|---|---|---|---|
| **Lovart** | "Agente de design": logo, kit de marca, pôster, post, anúncio, vídeo em canvas infinito; "Edit Elements" separa pôster pronto em camadas (5 créditos). Erra em texto pequeno, ícones densos; perde contorno e gradiente de fonte | Planos Starter a Ultimate por crédito; **valores não verificados** (página não exibiu) | **Sim, PSD multicamada** | [Lovart no X](https://x.com/lovart_ai/status/2044418662124470690), [AIbase](https://news.aibase.com/news/22743), [Toolworthy](https://www.toolworthy.ai/tool/lovart) |
| **Recraft** | Gerador raster e vetorial (SVG real), "Agentic Mode" em canvas | Basic US$ 10 a 12/mês (1.000 créditos); Pro US$ 20 a 160/mês; grátis sem direito comercial | SVG (Pro/Team); PSD não verificado | [Flowith](https://flowith.io/blog/recraft-pricing-2026-free-vs-pro-vs-team/) (secundária) |
| **Kittl** | Ver seção 4 | — | não | — |
| **Krea** | Geração e edição de imagem e vídeo | Free; Basic US$ 9; Pro US$ 35; Max US$ 70; Business US$ 200 (até 50 assentos) | não verificado | [Costbench](https://costbench.com/software/ai-image-generators/krea/) (secundária) |
| **Claude Design** (Anthropic Labs) | Designs, protótipos, slides; cria design system a partir do código e arquivos | Incluso nos planos pagos do Claude, prévia | Não (Canva, PDF, PPTX, HTML) | [Anthropic](https://www.anthropic.com/news/claude-design-anthropic-labs) |
| **Google Pomelli** | Lê o site, monta "Business DNA" (tom, fonte, cor), gera posts e anúncios da marca | Grátis (Labs) | não verificado | [Digital Trends](https://www.digitaltrends.com/computing/google-pomelli-can-now-build-your-entire-brand-from-scratch/) (via busca) |
| **Google Stitch / Mixboard** | Stitch: interface a partir de descrição. Mixboard: moodboard com IA | Grátis (Labs) | não | [Substack AI Blew My Mind](https://aiblewmymind.substack.com/p/google-ai-tools-2026-guide) (via busca) |
| **Microsoft Designer** | Design com IA embutido no Microsoft 365 | Grátis com 15 créditos/mês; 60 com Microsoft 365 | não verificado | [Tooljunction](https://www.tooljunction.io/ai-tools/microsoft-designer) (secundária) |
| **Pencil** (Brandtech) | Anúncio gerado por IA; agentes para imagem, vídeo, ideação | Core US$ 14/mês (50 gerações); Growth US$ 55; Pro sob consulta | não verificado | [Toolsforhumans](https://www.toolsforhumans.ai/ai-tools/pencil-ai) (secundária) |
| **AdCreative.ai** | Criativo de anúncio por IA | US$ 29/mês (10 créditos) a US$ 399+/mês; crédito só gasta no download | não verificado | [Atria](https://www.tryatria.com/blog/adcreative-ai-pricing) (secundária) |
| **Creatopy** (agora "The Brief") | Conjuntos de anúncio multiformato, redimensionador automático, editor multitamanho | Pro US$ 29/mês; Ultra US$ 79; Team US$ 49/assento | **Importa** PSD e Figma; exportar não verificado | [Toolradar](https://toolradar.com/tools/creatopy) (secundária) |
| **Bannerflow / Celtra** | Plataforma de gestão criativa: uma peça-mestre em milhares de versões; DCO | Contrato enterprise, sem tabela; muitas vezes ligado a impressão ou mídia | não verificado | [Abyssale](https://www.abyssale.com/blog/agency-profitability-creative-automation-roi-2026), [Bannerflow](https://www.bannerflow.com/blog/best-creative-automation-platforms-2026) |
| **Marpipe** | Criativo a partir de catálogo de produto (SKU) | Startup US$ 199/mês (500 SKUs); Enterprise desde US$ 999/mês | não | [busca: Marpipe pricing](https://www.marpipe.com/pricing) (via busca) |

**Leitura:** o grupo F (automação criativa) já resolve "lote" e "adaptar formatos" para anúncio, mas mora no marketing e na agência grande, com contrato. O grupo E resolve "montar a partir de briefing", mas gera imagem e, com exceção da Lovart, não devolve PSD.

---

## 6. MCPs e conectores de IA para ferramentas de design

| Conector | Oficial? | O que faz | Limites relatados | Fonte |
|---|---|---|---|---|
| Adobe for Claude / ChatGPT / Gemini | Sim (Adobe) | 50+ ferramentas: editar imagem, gerar peças de marketing, PDF; edição por camadas em designs do Express | Nível Express, não o Photoshop completo; sem gatilho por evento; uso maior exige conta Adobe | [Carly](https://www.usecarly.com/blog/claude-adobe-integration/), [9to5Mac](https://9to5mac.com/2026/09/24/adobe-expands-creative-tool-access-to-google-gemini-brings-acrobat-to-claude/) |
| Canva MCP / AI Connector | Sim (Canva) | Gerar design, editar elemento por elemento, autopreencher modelo, redimensionar, exportar | Redimensionar, kit de marca e autopreenchimento só em Pro/Enterprise; só funciona durante a conversa; admin pode desligar | [Canva Help](https://www.canva.com/help/mcp-canva-usage/), [Doop Design](https://doop.design/blog/canva-mcp-claude-code) (via busca) |
| Affinity + Claude | Sim (Canva/Anthropic) | Leitura e escrita no documento, lote, scripts | Beta; desktop; exige Claude pago | [XDA](https://www.xda-developers.com/connected-claude-to-affinity-batch-edit-designs-write-scripts/) |
| Figma MCP (`use_figma`) | Sim (Figma) | Escreve frames, componentes, variáveis, auto layout | Não usa o design system sem ser mandado; não determinístico; vai ser pago por uso | [Bitovi](https://www.bitovi.com/blog/figma-just-opened-the-canvas-to-agents.-heres-what-actually-happens) |
| adb-mcp (Mike Chambers) | **Não** ("não endossado nem suportado pela Adobe") | Photoshop e Premiere por plugin UXP + proxy WebSocket | Prova de conceito; "a IA tem problema para dimensionar e posicionar texto corretamente" | [GitHub](https://github.com/mikechambers/adb-mcp) |
| photoshop-mcp (alisaitteke, scort1213) | Não | 118 ferramentas; controle do Photoshop desktop | Qualidade não verificada | [GitHub](https://github.com/alisaitteke/photoshop-mcp) |
| PhotoshopMcpServer (airtaxi) | Não | Photoshop por automação COM, só Windows | — | [GitHub](https://github.com/airtaxi/PhotoshopMcpServer) |
| photopea-mcp-server (attalla1) | Não | Documento, camadas, texto, forma, ajuste, seleção; exporta PNG, JPG, WebP, **PSD**, SVG; abre janela do navegador por WebSocket | — | [GitHub](https://github.com/attalla1/photopea-mcp-server) |

**Padrão comum (grau RELATADO):** o conector põe o agente no chat, mas o agente não vê o resultado do jeito que o designer vê, e erra em posição e tamanho de texto (adb-mcp) e em aderência ao design system (`use_figma`). É consistente com o que o Felipe relatou ao testar esse caminho (ADR 026), mas é amostra pequena.

---

## 7. Público-alvo

| Dado | Valor | Fonte | Grau |
|---|---|---|---|
| Designers gráficos empregados nos EUA | 253.100 (2025); projeção −2% de 2025 a 2035; 20% autônomos; mediana US$ 62.960/ano. A própria BLS cita IA como motivo da queda | [BLS](https://www.bls.gov/ooh/arts-and-design/graphic-designers.htm) | COMPARÁVEL |
| Designer gráfico CLT no Brasil (CBO 2624-10) | 30.800 admissões e desligamentos em 12 meses (ago/2025 a jul/2026); salário médio R$ 3.818,97; saldo negativo de 516 vagas; "baixa demanda" | [Salario.com.br / CAGED](https://www.salario.com.br/profissao/desenhista-industrial-grafico-designer-grafico-cbo-262410/) | COMPARÁVEL (movimentação, **não é o estoque**) |
| Estoque de designers no Brasil | **não verificado.** Firjan conta 1,26 milhão de empregados formais na indústria criativa inteira em 2023 (design é um dos 13 segmentos) | [Firjan](https://www.firjan.com.br/noticias/mapeamento-da-industria-criativa-2025-8AE4828D96AAF437019783E8CFE02F31-00.htm) | — |
| Freelancer de design no Brasil | Faturamento R$ 8.000 a 20.000/mês para quem tem carteira | [Quero Bolsa](https://querobolsa.com.br/cursos-e-faculdades/design-grafico/quanto-ganha-designer-grafico-salario) (via busca; secundária, sem método) | fraco |
| Assinantes pagos do Creative Cloud | ~41 milhões (estimativa de terceiro, fim de 2025; a Adobe não divulga) | [ProDesignTools](https://prodesigntools.com/number-of-creative-cloud-subscribers.html) (via busca) | fraco |
| Canva no Brasil | 2º maior mercado em usuários | ver 3.2 | COMPARÁVEL |
| Quanto o designer brasileiro paga por ferramenta | Photoshop R$ 65/mês; CC Pro R$ 214/mês cheio; Canva Pro R$ 290/ano | ver 3.1 e 3.2 | COMPARÁVEL (preço de lista, não gasto real) |
| Designers satisfeitos com IA | 69% (desenvolvedores: 82%); 54% dizem que melhora a qualidade; 31% usam IA em trabalho central de design | [Figma, AI report 2025](https://www.figma.com/blog/figma-2025-ai-report-perspectives/) (via busca) | COMPARÁVEL (pesquisa da Figma, público da Figma) |

**Leitura:** o dado brasileiro de CAGED mede só CLT e é de rotatividade, não de tamanho. O designer que o Otto quer (freelancer, estúdio pequeno) é justamente o que não aparece na RAIS nem no CAGED. **O tamanho do público brasileiro é pendência aberta.**

---

## 8. Reclamações recorrentes

| Reclamação | Onde aparece | Fonte | Grau |
|---|---|---|---|
| **Créditos de IA poucos e caros.** 25/mês no plano novo de Photoshop; "restringir assinante antigo a 100 e novo a 25 é irrazoável"; preferem pagar mais caro no plano a comprar pacote | Adobe | [PhotoshopCAFE](https://photoshopcafe.com/generative-credits-to-be-enforced-adobe-cc-plans-change/), [Adobe Community](https://community.adobe.com/questions-712/p-you-don-t-have-enough-credits-1179669) | RELATADO |
| **Custo da mesma ação varia 4× conforme o modelo**, e o aviso de custo fica escondido | Adobe | [Fstoppers](https://fstoppers.com/education/adobes-new-ai-credit-cost-preview-photoshop-what-need-know-902663) | COMPARÁVEL |
| **Crédito gasto quando a IA erra ou desfaz**; "queimamos 3.000+ créditos em menos de uma hora brigando com a IA"; crédito não acumula | Figma | [Figma Forum](https://forum.figma.com/report-a-problem-6/complaints-about-ai-credit-usage-52869), [Figma Forum — Make](https://forum.figma.com/share-your-feedback-26/figma-make-ai-credit-limits-not-feasible-51713/index4.html) | RELATADO |
| **Tentativa falha conta no limite** | Canva | [eesel](https://www.eesel.ai/blog/canva-ai-pricing) | RELATADO |
| **Saída chapada, sem camada**: banner gerado vem como JPEG sem camada; pequena mudança obriga a gerar de novo e altera o resto | Adobe Stock, categoria inteira | [Adobe Community](https://community.adobe.com/bug-reports-157/adobe-stock-images-ai-generated-be-aware-1486744) (via busca), [Business Wire / Canva](https://secure.businesswire.com/news/home/20260311951174/en/Canva-Introduces-Magic-Layers-Turning-Static-AI-Outputs-Into-Editable-Designs) | RELATADO |
| **Separação em camadas imperfeita**: texto pequeno, ícone denso, contorno e gradiente de fonte se perdem | Lovart | [AIbase](https://news.aibase.com/news/22743) | RELATADO |
| **Texto mal dimensionado e mal posicionado pelo agente** | adb-mcp (Photoshop) | [GitHub](https://github.com/mikechambers/adb-mcp) | RELATADO |
| **Agente ignora design system e fixa valores** | Figma `use_figma` | [Bitovi](https://www.bitovi.com/blog/figma-just-opened-the-canvas-to-agents.-heres-what-actually-happens) | RELATADO |
| **PSD que não volta**: Canva não exporta PSD; Pixlr não exporta; Affinity rasteriza texto (versão antiga) | Canva, Pixlr, Affinity | ver seções 3 e 4 | COMPARÁVEL |
| **Nuvem e confidencialidade**: prompt e imagem processados na nuvem, ruim para trabalho sob NDA | Adobe AI Assistant | [PhotoshopNews](https://www.photoshopnews.com/2026/03/12/adobe-photoshop-ai-assistant-public-beta), [PhotoWorkout](https://www.photoworkout.com/photoshop-ai-assistant-desktop-beta/) | COMPARÁVEL |
| **Direitos e confiança**: termo de uso da Adobe de junho de 2024 foi lido como acesso a conteúdo sob NDA; Adobe corrigiu, desconfiança ficou | Adobe | [Malwarebytes](https://www.malwarebytes.com/blog/news/2024/06/no-ai-training-in-newly-distrusted-terms-of-service-adobe-says), [AppleInsider](https://appleinsider.com/articles/24/06/06/adobes-new-terms-of-service-unacceptably-gives-them-access-to-all-of-your-projects-for-free) | RELATADO |
| **Cliente desestimula IA generativa** por direito autoral, qualidade e reputação (pesquisa com 378 artistas visuais) | Categoria | [ACM CHI 2026](https://dl.acm.org/doi/10.1145/3772363.3799003) (via busca) | COMPARÁVEL |
| **Só inglês** no beta do assistente do Photoshop desktop | Adobe | [PhotoWorkout](https://www.photoworkout.com/photoshop-ai-assistant-desktop-beta/) | COMPARÁVEL |

**Padrão:** a reclamação não é "a IA é fraca". É **imprevisibilidade** (quanto custa, o que ela vai mexer, se o arquivo volta editável) e **confiança** (direitos, NDA). As duas estão perto do que os ADRs 026 a 029 já escolheram: não gerar imagem por difusão na v1, conjunto de alterações revisável, PSD como saída.

---

## 9. Síntese

### 9.1 Onde o Otto tem espaço (hipóteses)

| Hipótese | Por quê | O que a mata |
|---|---|---|
| **H1. PSD editável de ida e volta, com texto vivo, fora da Adobe.** | Canva, Figma, Pixlr e Polotno não exportam PSD; Affinity rasterizava texto. Só Photopea e a própria Adobe fecham o ciclo | Affinity unificado exportar PSD com texto vivo; Canva lançar exportação PSD; Photopea ganhar agente |
| **H2. Agente que confere o próprio trabalho e entrega conjunto de alterações revisável.** | As reclamações de agente (texto mal posicionado, design system ignorado, resultado que muda entre execuções) são de agente sem verificação. O ADR 029 já pede isso | Photoshop AI Assistant sair do beta com revisão por etapa e verificação visual. O "modo guiado" da Adobe já aponta nessa direção |
| **H3. Preço previsível, sem crédito que some.** | Crédito é a queixa mais repetida em Adobe, Figma e Canva | O custo por tarefa medido no spike 3 não permitir franquia previsível com margem |
| **H4. Português do Brasil desde o dia 1.** | O assistente do Photoshop desktop é só inglês no beta | A Adobe localizar antes do lançamento do Otto (provável: o Photoshop já é localizado) |
| **H5. Produção para designer, não geração para leigo.** | Canva, Pomelli, Designer e Lovart falam com marketing e criador. A Adobe fala com o designer, mas o assistente é "melhor para iniciante e ocasional" segundo review | Adobe apontar o Creative Agent explicitamente para produção de designer |

### 9.2 Onde o Otto não tem espaço

| Território | Por quê |
|---|---|
| "IA que faz post pronto" para leigo | Canva (265 mi MAU, Magic Layers, AI 2.0), Google Pomelli grátis, Microsoft Designer grátis |
| Automação de anúncio em escala enterprise | Celtra, Bannerflow, GenStudio: contrato, DCO, integração com mídia |
| Design de interface | Figma com agente, `use_figma`, Make e code layers |
| Pincel, retoque, geração de imagem | Photoshop; e o próprio ADR 026 já tirou isso da v1 |
| Competir em preço com "grátis" | Affinity e Photopea são grátis; Canva Pro custa R$ 290/ano |

### 9.3 Três ameaças principais

1. **A Adobe terminar o que começou.** O AI Assistant do Photoshop desktop já faz smart resizing e organiza camadas (beta de 19/06/2026), o Firefly AI Assistant orquestra vários apps, e o "Creative Agent" apareceu no discurso de resultado. Se isso sair do beta localizado, com lote e revisão, o argumento "o agente faz a produção" passa a ser recurso do Photoshop que o designer já paga (R$ 65/mês). **É a ameaça que decide o produto.**
2. **Agente genérico + editor grátis.** Claude com conector do Affinity (grátis) ou MCP do Photopea (grátis, exporta PSD) já entrega "agente mexendo em documento em camadas" sem produto novo. Hoje é cru (beta, desktop, sem verificação visual), mas melhora a cada modelo novo, sem esforço do dono do editor.
3. **Canva subindo para o profissional.** Affinity grátis puxa o designer para dentro da conta Canva; Magic Layers resolve "chapado → editável"; AI 2.0 traz agente com memória e marca. Falta exportar PSD, que é decisão de produto e não de tecnologia.

### 9.4 O que os incumbentes copiam fácil

| Recurso do Otto (visão v1) | Já existe em | Dificuldade de copiar |
|---|---|---|
| Painel de conversa com agente no editor | Photoshop, Express, Canva, Figma | Já copiado |
| Adaptar para vários formatos | Photoshop (smart resizing, beta), Canva, Figma Buzz, Creatopy, GenStudio | Já copiado |
| Lote a partir de lista | Express Bulk Create (até 99), Figma Buzz, Canva autopreencher | Já copiado |
| Tokens de identidade visual | Canva kit de marca, Express brands, Figma variáveis, Pomelli "Business DNA" | Já copiado |
| Revisar (texto transbordando, contraste, fonte faltando, resolução) | Não encontrado como recurso nomeado em nenhum concorrente | Fácil de copiar, **não verificado** que alguém tenha |
| PSD de ida e volta no navegador fora da Adobe | Photopea | Difícil para Canva/Figma (formato e engenharia); trivial para a Adobe |
| Conjunto de alterações revisável antes de aplicar | Não encontrado em forma explícita; Adobe tem "modo guiado" | Médio |

**Leitura (hipótese):** nenhuma peça isolada do Otto é fosso. O que pode ser difícil de copiar é a **combinação** — PSD fiel fora da Adobe + agente que verifica o próprio render + revisão por conjunto de alterações + preço previsível + português — e a execução medida (spikes 1 a 3 da visão). Se os spikes provarem só uma dessas peças, o Otto é recurso, não produto.

---

## 10. O que não foi verificado

- **Preço da Lovart** (a página não exibiu valores) e se o PSD dela mantém texto como texto em todos os casos.
- **Preço oficial atual do Canva em USD e do AI Pass** (canva.com devolveu 403; fontes secundárias divergem).
- **Se o Affinity unificado (2025) ainda rasteriza texto ao exportar PSD.** A fonte é de 2024, da versão antiga.
- **Preço pós-beta do AI Assistant do Photoshop** e se ele terá português no lançamento.
- **Se Figma, Kittl, Recraft, Photoroom, Creatopy, Bannerflow, Celtra ou Pencil exportam PSD em camadas.**
- **Número de designers no Brasil** (estoque). Só há movimentação CLT no CAGED, que não pega freelancer.
- **Quanto o designer brasileiro gasta de fato** em ferramenta (só há preço de lista).
- **Número de assinantes do Creative Cloud** (a Adobe não divulga; 41 milhões é estimativa de terceiro).
- **Número de usuários do Canva no Brasil** (só a posição: 2º maior mercado).
- **Existência de qualquer ferramenta que faça "revisar" (lint de design) como recurso nomeado.** Não encontrei; ausência na busca não prova ausência.
- **Qualidade real dos MCPs de Photoshop da comunidade.** Só há o que os próprios repositórios dizem.

---

## Fontes

Todas acessadas em 2026-09-26. "Via busca" indica que o dado veio do resumo do mecanismo de busca porque a página devolveu 403 ou não foi aberta.

**Adobe**
- https://community.adobe.com/announcements-698/photoshop-desktop-ai-assistant-early-beta-1628556
- https://winbuzzer.com/2026/03/11/adobe-photoshop-ai-assistant-public-beta-web-mobile-xcxwbn/
- https://www.photoworkout.com/photoshop-ai-assistant-desktop-beta/
- https://www.photoshopnews.com/2026/03/12/adobe-photoshop-ai-assistant-public-beta
- https://tech.yahoo.com/ai/meta-ai/articles/photoshops-ai-assistant-rename-layers-160003579.html
- https://thenextweb.com/news/adobe-firefly-ai-assistant-creative-cloud-agentic-workflows
- https://www.opus.pro/blog/adobe-photoshop-ai-assistant-agentic-ai-future-content-creation
- https://techcrunch.com/2025/10/28/adobe-firefly-image-5-brings-support-for-layers-will-let-creators-make-custom-models/
- https://helpx.adobe.com/express/web/bulk-create-and-automate/bulk-create.html
- https://helpx.adobe.com/il_en/express/web/print-and-export/export-to-photoshop.html
- https://the-decoder.com/adobe-brings-photoshop-acrobat-and-express-directly-to-chatgpt/
- https://9to5mac.com/2026/09/24/adobe-expands-creative-tool-access-to-google-gemini-brings-acrobat-to-claude/
- https://theaieconomy.substack.com/p/adobe-ai-chatbot-gemini-acrobat-claude
- https://www.usecarly.com/blog/claude-adobe-integration/
- https://business.adobe.com/products/genstudio/performance-marketing.html
- https://www.trustradius.com/products/adobe-genstudio-for-performance-marketing/pricing
- https://www.fool.com/earnings/call-transcripts/2026/09/11/adobe-adbe-q3-2026-earnings-call-transcript/
- https://finance.yahoo.com/markets/stocks/articles/adobe-inc-adbe-q3-2026-090037567.html
- https://www.adobe.com/br/products/photoshop/plans.html
- https://www.hardware.com.br/noticias/photoshop-illustrator-premiere-pro-mais-barato-brasil/
- https://fstoppers.com/education/adobes-new-ai-credit-cost-preview-photoshop-what-need-know-902663
- https://photoshopcafe.com/generative-credits-to-be-enforced-adobe-cc-plans-change/
- https://community.adobe.com/questions-712/p-you-don-t-have-enough-credits-1179669
- https://community.adobe.com/bug-reports-157/adobe-stock-images-ai-generated-be-aware-1486744
- https://www.malwarebytes.com/blog/news/2024/06/no-ai-training-in-newly-distrusted-terms-of-service-adobe-says
- https://appleinsider.com/articles/24/06/06/adobes-new-terms-of-service-unacceptably-gives-them-access-to-all-of-your-projects-for-free
- https://prodesigntools.com/number-of-creative-cloud-subscribers.html

**Canva e Affinity**
- https://www.canva.com/newsroom/news/canva-create-2026-ai/
- https://fortune.com/2026/04/16/canva-ai-agentic-design-suite-coo-cliff-obrecht/
- https://secure.businesswire.com/news/home/20260311951174/en/Canva-Introduces-Magic-Layers-Turning-Static-AI-Outputs-Into-Editable-Designs
- https://www.canva.com/newsroom/news/canva-claude-design/
- https://www.canva.com/help/ai-import/
- https://layersmith.app/export-canva-to-psd
- https://www.canva.com/help/mcp-canva-usage/
- https://doop.design/blog/canva-mcp-claude-code
- https://aiproductivity.ai/blog/canva-pricing/
- https://costbench.com/software/design/canva/
- https://www.eesel.ai/blog/canva-ai-pricing
- https://www.darlanevandro.com.br/canva-pro-valor-quanto-custa/
- https://voxnews.com.br/canva-revela-tendencias-criativas-para-2026-e-destaca-protagonismo-do-brasil-no-uso-de-ia/
- https://www.canva.com/newsroom/news/affinity-free/
- https://en.wikipedia.org/wiki/Affinity_(software)
- https://www.quark.com/about/blog/affinity-by-canva-pricing-the-professional-cost-of-free
- https://www.xda-developers.com/connected-claude-to-affinity-batch-edit-designs-write-scripts/
- https://www.xda-developers.com/switch-from-photoshop-to-affinity/

**Figma**
- https://www.figma.com/blog/config-2026-recap/
- https://developers.figma.com/docs/figma-mcp-server/write-to-canvas
- https://www.bitovi.com/blog/figma-just-opened-the-canvas-to-agents.-heres-what-actually-happens
- https://designforce.co/blog/what-is-figma-buzz/
- https://help.weavy.ai/en/articles/12267070-figma-weave-s-subscription-plans
- https://lumalabs.ai/news/weave-pricing
- https://uxmagic.ai/blog/figma-pricing
- https://forum.figma.com/report-a-problem-6/complaints-about-ai-credit-usage-52869
- https://forum.figma.com/share-your-feedback-26/figma-make-ai-credit-limits-not-feasible-51713/index4.html
- https://www.figma.com/blog/figma-2025-ai-report-perspectives/

**Editores no navegador**
- https://www.builtplain.com/photopea-free-app-ad-revenue/
- https://en.wikipedia.org/wiki/Photopea
- https://www.photopea.com/api/
- https://getlatka.com/companies/photopea
- https://digi-tools.info/articles/photopea-review
- https://www.fastlancer.org/en/fastlancer-blog/pixlr-review/
- https://www.eesel.ai/blog/photoroom-pricing
- https://www.itechguides.com/products/kittl/
- https://www.kittl.com/pricing
- https://polotno.com/sdk/resources/build-vs-buy
- https://polotno.com/docs/psd-import

**Agentes e automação criativa**
- https://x.com/lovart_ai/status/2044418662124470690
- https://news.aibase.com/news/22743
- https://www.toolworthy.ai/tool/lovart
- https://flowith.io/blog/recraft-pricing-2026-free-vs-pro-vs-team/
- https://costbench.com/software/ai-image-generators/krea/
- https://www.anthropic.com/news/claude-design-anthropic-labs
- https://www.anthropic.com/news/claude-for-creative-work
- https://www.digitaltrends.com/computing/google-pomelli-can-now-build-your-entire-brand-from-scratch/
- https://aiblewmymind.substack.com/p/google-ai-tools-2026-guide
- https://www.tooljunction.io/ai-tools/microsoft-designer
- https://www.toolsforhumans.ai/ai-tools/pencil-ai
- https://www.tryatria.com/blog/adcreative-ai-pricing
- https://toolradar.com/tools/creatopy
- https://www.abyssale.com/blog/agency-profitability-creative-automation-roi-2026
- https://www.bannerflow.com/blog/best-creative-automation-platforms-2026
- https://www.marpipe.com/pricing

**MCPs da comunidade**
- https://github.com/mikechambers/adb-mcp
- https://github.com/alisaitteke/photoshop-mcp
- https://github.com/airtaxi/PhotoshopMcpServer
- https://github.com/attalla1/photopea-mcp-server

**Público e percepção**
- https://www.bls.gov/ooh/arts-and-design/graphic-designers.htm
- https://www.salario.com.br/profissao/desenhista-industrial-grafico-designer-grafico-cbo-262410/
- https://www.firjan.com.br/noticias/mapeamento-da-industria-criativa-2025-8AE4828D96AAF437019783E8CFE02F31-00.htm
- https://querobolsa.com.br/cursos-e-faculdades/design-grafico/quanto-ganha-designer-grafico-salario
- https://dl.acm.org/doi/10.1145/3772363.3799003
