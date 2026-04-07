import { GoogleGenAI, Type } from "@google/genai";
import { BrandContext, Campaign, Mission, MissionType, ContentGoal } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function generateStrategicPlan(brand: BrandContext): Promise<{ campaign: Partial<Campaign>, missions: Partial<Mission>[] }> {
  const prompt = `
    Você é um Coordenador Estratégico de Marketing Digital de Elite.
    Seu objetivo é criar um plano de conteúdo coordenado para a marca "${brand.name}".
    
    Contexto da Marca:
    ${brand.description}
    Público-alvo: ${brand.targetAudience}
    Tom de voz: ${brand.toneOfVoice}
    Benefícios: ${brand.mainBenefits.join(", ")}
    Preço: ${brand.pricing}

    Use o Google Search para identificar tendências atuais relacionadas a este nicho.
    Crie uma campanha estratégica de 7 dias com o objetivo de crescer a marca e vender assinaturas.
    
    O plano deve incluir:
    1. Uma Campanha com título e objetivo claro (growth, retention ou sales).
    2. Uma lista de 7 Missões Diárias (uma por dia).
    Cada missão deve ter:
    - Título
    - Descrição detalhada da estratégia
    - Tipo (reel, story, feed ou engagement)
    - Data (relativa a hoje, formato YYYY-MM-DD)
    
    Garanta que as postagens sejam interligadas e sigam um funil de vendas lógico.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          campaign: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              goal: { type: Type.STRING, description: "growth, retention or sales" }
            },
            required: ["title", "goal"]
          },
          missions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                description: { type: Type.STRING },
                type: { type: Type.STRING, description: "reel, story, feed or engagement" },
                date: { type: Type.STRING, description: "YYYY-MM-DD" }
              },
              required: ["title", "description", "type", "date"]
            }
          }
        },
        required: ["campaign", "missions"]
      }
    }
  });

  return JSON.parse(response.text);
}

export async function generateContentForMission(mission: Mission, brand: BrandContext): Promise<string> {
  const prompt = `
    Gere o conteúdo detalhado para a seguinte missão de marketing:
    Título: ${mission.title}
    Descrição: ${mission.description}
    Tipo: ${mission.type}
    
    Marca: ${brand.name}
    Contexto: ${brand.description}
    Tom de voz: ${brand.toneOfVoice}
    
    Se for um Reel/Shorts, forneça o roteiro completo com ganchos de retenção.
    Se for um Story, forneça uma sequência de 3-5 frames.
    Se for um Feed, forneça a legenda e a ideia visual.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt
  });

  return response.text;
}
