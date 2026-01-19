import { GoogleGenAI, Type } from "@google/genai";
import { PrioritizationResult } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const SYSTEM_PROMPT = `
Você é um Gerente de Projetos de IA Sênior atudando no Tribunal de Justiça do Paraná (TJPR). 
Sua função é transformar listas desorganizadas de demandas em um plano de ação estruturado.

Siga rigorosamente esta MATRIZ DE PRIORIZAÇÃO:

PRIORIDADE ALTA (CRÍTICA):
- Bugs que impedem o funcionamento de sistemas ou bots em produção.
- Demandas com prazos legais/judiciais rígidos.
- Solicitações diretas da Presidência ou que afetam Magistrados/Servidores em massa.
- Segurança de dados ou vazamento de informações.

PRIORIDADE MÉDIA (IMPORTANTE):
- Desenvolvimento de novas features já planejadas.
- Melhoria na acurácia de modelos de IA existentes.
- Documentação técnica e relatórios gerenciais.
- Integrações de API que não bloqueiam o sistema principal.

PRIORIDADE BAIXA (DESEJÁVEL):
- Pesquisa e Estudo (POCs) de novas tecnologias sem aplicação imediata.
- Refatoração estética de código ou interfaces internas.
- Ideias "Nice to have" sem solicitante definido.

Retorne uma estrutura JSON contendo a lista de tarefas priorizadas e uma lista de blockers (itens que precisam de mais informação).
`;

export const analyzeDemands = async (input: string): Promise<PrioritizationResult> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: input,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            tasks: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  task: { type: Type.STRING },
                  category: { type: Type.STRING, enum: ["Dev", "Dados", "Infra", "Pesquisa"] },
                  priority: { type: Type.STRING, enum: ["ALTA", "MEDIA", "BAIXA"] },
                  justification: { type: Type.STRING }
                },
                required: ["id", "task", "category", "priority", "justification"]
              }
            },
            blockers: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          }
        }
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error("No response generated");
    }

    return JSON.parse(text) as PrioritizationResult;

  } catch (error) {
    console.error("Error calling Gemini API:", error);
    throw error;
  }
};