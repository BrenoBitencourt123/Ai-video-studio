import { GoogleGenAI, Type } from "@google/genai";
import { VisualStyle, ChannelProfile, VideoFormat } from "../types";

export const STYLES: Record<VisualStyle, string> = {
  sketch: "Hand-drawn pencil sketch, charcoal lines, minimalist educational illustration style, clean white background, expressive strokes.",
  'pixel-art': "Vibrant digital painting with pixelated texture, retro game aesthetic, high contrast, expressive characters, 16-bit style.",
  cinematic: "High-quality cinematic digital art, dramatic lighting, epic composition, realistic textures, 4k resolution.",
  minimalist: "Clean minimalist vector art, flat colors, bold shapes, modern aesthetic, professional design.",
  custom: "Blue ink sketch on clean white paper background, architectural drawing style, blueprint aesthetic, educational diagram, high contrast blue and white."
};

export async function generateYouTubeImage(
  prompt: string,
  style: VisualStyle,
  customSuffix: string = "",
  aspectRatio: "9:16" | "16:9" | "1:1" = "9:16"
) {
  // @ts-ignore
  const apiKey = (typeof process !== 'undefined' && process.env?.API_KEY) || 
                 (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) || 
                 "";
  const ai = new GoogleGenAI({ apiKey });
  
  const stylePrompt = style === 'custom' ? STYLES.custom : STYLES[style];
  const fullPrompt = `${prompt}. Style: ${stylePrompt} ${customSuffix}. Optimized for vertical ${aspectRatio} video, high visual interest, clear focal point. IMPORTANT: All text labels, signs, blackboard writing, or any written elements within the image MUST be in Portuguese (Brazil).`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-image-preview',
      contents: {
        parts: [{ text: fullPrompt }],
      },
      config: {
        imageConfig: {
          aspectRatio: aspectRatio,
          imageSize: "1K"
        }
      },
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    throw new Error("No image generated in response");
  } catch (error) {
    console.error("Image generation failed:", error);
    throw error;
  }
}

export async function generateRetentionScript(
  idea: string, 
  profile: ChannelProfile, 
  format: VideoFormat = 'Geral',
  hook?: string
) {
  // @ts-ignore
  const apiKey = (typeof process !== 'undefined' && process.env?.API_KEY) || 
                 (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) || 
                 "";
  const ai = new GoogleGenAI({ apiKey });
  
  const prompt = `
    # SYSTEM PROMPT — Gerador de Roteiros Short-Form | @atlas.educa

    Você é o roteirista do canal @atlas.educa. Sua única função é gerar roteiros narrados para vídeos curtos (shorts/reels) de 55-65 segundos sobre temas do ENEM.

    ## REGRAS ABSOLUTAS DO FORMATO DE SAÍDA

    O output é APENAS o texto que será lido em voz alta por um narrador TTS. Nada mais.

    - SEM tags, headers, marcações, colchetes ou metadados
    - SEM descrições de imagem ou direção visual
    - SEM emojis
    - Números SEMPRE por extenso (cem reais, vinte por cento, dois mil e vinte e seis)
    - Siglas expandidas na primeira menção quando a pronúncia não é óbvia
    - O texto deve ter entre 140 e 180 palavras (equivale a ~55-65 segundos de fala)
    - Aspas só quando forem parte da narrativa falada (o narrador realmente falaria com entonação de citação)

    ## ESTRUTURA: 3-4 BLOCOS SEPARADOS POR LINHA EM BRANCO

    Cada bloco é separado do próximo por uma única linha em branco. Essa quebra gera uma micro-pausa natural no TTS. O roteiro SEMPRE segue essa estrutura:

    **BLOCO 1 — GANCHO + SETUP (0-15s)**
    Abre com uma frase que obriga a parar de scrollar: dado chocante, pergunta provocativa ou afirmação que parece errada. Logo em seguida, apresenta o problema/questão de forma concreta e visual. O ouvinte precisa sentir que é pessoal — que ELES errariam isso.

    **BLOCO 2 — REAÇÃO ERRADA (15-25s)**
    Mostra o que a maioria pensa/responde — e por que tá errado. Aqui é o momento de criar tensão. O ouvinte acabou de pensar a resposta errada e agora descobre que caiu na armadilha. Use personificação ("o avaliador do ENEM sorri", "a banca conta com esse erro") pra criar um inimigo.

    **BLOCO 3 — EXPLICAÇÃO (25-50s)**
    Explica a lógica correta de forma simples e progressiva. Cada frase constrói em cima da anterior. Sem pular etapas. O ouvinte precisa sentir que tá acompanhando e entendendo — não sendo bombardeado com informação. Use a palavra "agora" ou "só que" pra marcar a virada lógica.

    **BLOCO 4 — REVELAÇÃO + CTA (50-60s)**
    Fecha com a conclusão clara (a resposta certa, a regra que resume tudo) e um CTA curto. O CTA varia entre: "salva esse vídeo", "manda pra um amigo", "segue pra mais". Idealmente termina com uma frase incompleta ou suspense que incentive loop ("porque..." / "amanhã tem..." / "e o pior é que...").

    ## TOM DE VOZ

    - Professor particular jovem falando com um amigo
    - Direto, sem rodeios, sem formalidade
    - Usa "você" sempre (nunca "vocês" ou "pessoal")
    - Pode usar expressões coloquiais brasileiras naturais (nada forçado)
    - Nunca condescendente — explica como se o ouvinte fosse inteligente mas nunca tivesse ouvido aquilo daquele jeito
    - Frases curtas. Ritmo de conversa, não de aula
    - Pode usar humor leve, mas o foco é sempre a explicação

    ## O QUE NUNCA FAZER

    - Nunca começar com "Fala galera", "E aí pessoal", "Bem-vindos" ou qualquer saudação
    - Nunca dizer "nesse vídeo vamos aprender" ou qualquer variação
    - Nunca mencionar o Atlas, a plataforma ou qualquer produto
    - Nunca usar jargão didático ("vamos contextualizar", "é importante ressaltar")
    - Nunca terminar com "espero que tenham gostado" ou variações
    - Nunca usar a palavra "desbravando", "jornada", "mergulhar" ou clichês motivacionais
    - Nunca numerar os blocos ou indicar as fases no texto

    ## ADAPTAÇÃO POR FORMATO

    O roteiro se adapta ao formato solicitado, mas SEMPRE mantém a estrutura de 3-4 blocos:

    **Questão Armadilha:** Apresenta uma questão concreta, mostra a resposta errada que a maioria dá, explica por que tá errada e revela a certa.
    **Explicação 60s:** Pega UM micro-conceito e explica a lógica. O gancho é uma afirmação contraintuitiva sobre o conceito.
    **Ranking/Polêmica:** Lista 3-5 itens com mini-explicação de cada. O gancho é "o número X vai te surpreender".
    **Correção Relâmpago:** Mostra um erro comum (de redação, conta, interpretação) e corrige ao vivo. O gancho é "isso parece certo, mas tá errado".
    **Fato ENEM:** Abre com uma curiosidade surpreendente e conecta com como o ENEM cobra isso. O gancho é o fato em si.

    ## INPUT DO USUÁRIO
    - Formato: ${format}
    - Matéria: ${profile.niche}
    - Tema: ${idea}
    ${hook ? `- Gancho Sugerido: ${hook}` : ''}

    Responda APENAS com o texto narrado, seguindo estritamente as regras acima.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: [{ parts: [{ text: prompt }] }],
    });
    return response.text || "";
  } catch (error) {
    console.error("Script generation failed:", error);
    throw error;
  }
}

export async function breakdownScriptToStoryboard(script: string) {
  // @ts-ignore
  const apiKey = (typeof process !== 'undefined' && process.env?.API_KEY) || 
                 (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) || 
                 "";
  const ai = new GoogleGenAI({ apiKey });

  const prompt = `
    Analise o roteiro abaixo e divida-o em exatamente 10 segmentos lógicos para um vídeo de 60 segundos.
    Para cada segmento, extraia a narração exata do texto e crie um prompt de imagem detalhado (em INGLÊS).
    
    O roteiro está dividido em blocos de texto. Você deve fatiar esses blocos em 10 partes que façam sentido visualmente.
    
    ESTILO VISUAL: Blue ink sketch on clean white paper background, architectural drawing style, blueprint aesthetic, educational diagram, high contrast blue and white.
    
    ROTEIRO:
    ${script}

    Retorne um JSON no formato:
    {
      "storyboard": [
        {
          "id": "1",
          "narration": "Texto da fala deste segmento",
          "imagePrompt": "Detailed English prompt for the image following the blue ink sketch style",
          "duration": 6
        },
        ... (total 10 segmentos, a soma das durações deve ser ~60s)
      ]
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json"
      }
    });
    
    const result = JSON.parse(response.text);
    return result.storyboard;
  } catch (error) {
    console.error("Storyboard breakdown failed:", error);
    throw error;
  }
}
