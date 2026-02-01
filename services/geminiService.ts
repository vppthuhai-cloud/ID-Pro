import { GoogleGenAI, Type } from "@google/genai";
import { ProcessingOptions, OUTFIT_TYPES, OUTFIT_COLORS_DATA, BACKGROUNDS, HAIRSTYLES } from '../types';

const getGeminiClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key not found");
  }
  return new GoogleGenAI({ apiKey });
};

export interface FaceDetectionResult {
  box: { ymin: number, xmin: number, ymax: number, xmax: number };
  landmarks?: {
    leftEye: { x: number, y: number };
    rightEye: { x: number, y: number };
  };
}

export const detectFace = async (imageBase64: string): Promise<FaceDetectionResult | null> => {
  const ai = getGeminiClient();
  const cleanBase64 = imageBase64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');

  try {
    // Use gemini-3-flash-preview for vision-to-text (JSON) tasks
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: cleanBase64 } },
          { text: "Identify the bounding box for the main human face. Also identify the center coordinates for the left eye (viewer's left) and right eye (viewer's right). Return a JSON object. All values must be normalized coordinates between 0.0 and 1.0." }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            box: {
              type: Type.OBJECT,
              properties: {
                ymin: { type: Type.NUMBER },
                xmin: { type: Type.NUMBER },
                ymax: { type: Type.NUMBER },
                xmax: { type: Type.NUMBER },
              }
            },
            landmarks: {
              type: Type.OBJECT,
              properties: {
                leftEye: {
                  type: Type.OBJECT,
                  properties: { x: { type: Type.NUMBER }, y: { type: Type.NUMBER } }
                },
                rightEye: {
                   type: Type.OBJECT,
                   properties: { x: { type: Type.NUMBER }, y: { type: Type.NUMBER } }
                }
              }
            }
          }
        }
      }
    });

    const text = response.text;
    if (!text) return null;

    let jsonStr = text;
    const markdownMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (markdownMatch) {
        jsonStr = markdownMatch[1];
    } else {
        const firstBrace = text.indexOf('{');
        const lastBrace = text.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) {
            jsonStr = text.substring(firstBrace, lastBrace + 1);
        }
    }

    const result = JSON.parse(jsonStr);
    const box = result.box;

    // Validation
    if (
        box &&
        typeof box.ymin === 'number' && typeof box.xmin === 'number' &&
        typeof box.ymax === 'number' && typeof box.xmax === 'number' &&
        box.xmax > box.xmin && box.ymax > box.ymin
    ) {
        return result;
    }
    console.warn("Invalid face detection result:", result);
    return null;

  } catch (e) {
    console.error("Face detection failed", e);
    return null;
  }
};

export const editPhoto = async (
  imageBase64: string,
  options: ProcessingOptions
): Promise<string> => {
  const ai = getGeminiClient();

  // Clean base64 string
  const cleanBase64 = imageBase64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');

  const selectedBg = BACKGROUNDS.find(b => b.id === options.background);
  const selectedHair = HAIRSTYLES.find(h => h.id === options.hairstyle);
  const selectedOutfitType = OUTFIT_TYPES.find(o => o.id === options.outfitType);
  const selectedOutfitColorData = OUTFIT_COLORS_DATA[options.outfitColor];

  // Construct prompt
  let promptParts = [];
  promptParts.push("Task: Finalize this ID Photo.");
  
  // CORE INSTRUCTION: The image is ALREADY cropped.
  promptParts.push("INPUT ANALYSIS: The input image is already cropped to the target aspect ratio. It may contain solid color margins (padding) or the person's body might be cut off at the bottom/sides.");
  
  promptParts.push("PRIMARY GOAL: FILL THE FRAME.");
  promptParts.push("1. GENERATE missing body parts (shoulders, chest, arms) to extend the person to the edges of the frame.");
  promptParts.push("2. DO NOT change the aspect ratio or crop the image further.");
  promptParts.push("3. If there is empty/solid colored space around the person, fill it with the requested background and body parts.");

  // Identity Preservation
  if (options.lighting) {
      // If lighting needs correction, we give slightly more freedom to modify pixel values on the face, but must keep identity
      promptParts.push("CRITICAL: Preserve the person's identity and facial features intact. However, YOU MUST correct the lighting on the face to be even and balanced, removing dark shadows or uneven brightness.");
  } else {
      promptParts.push("CRITICAL: Preserve the face, eyes, nose, and mouth EXACTLY as they are. Only modify the surrounding elements (body, hair, background) to blend seamlessly.");
  }

  // Background
  if (selectedBg && selectedBg.id !== 'original') {
    promptParts.push(`ACTION: Change the background to a ${selectedBg.prompt}.`);
  } else {
    promptParts.push("ACTION: Extend the existing background naturally to fill any empty space.");
  }
  
  // Outfit
  if (selectedOutfitType && selectedOutfitType.id !== 'original') {
      let outfitPrompt = selectedOutfitType.promptTemplate;
      
      // Inject color if applicable
      if (outfitPrompt.includes('{color}')) {
          const colorPrompt = selectedOutfitColorData ? selectedOutfitColorData.prompt : 'white'; // default fallback
          outfitPrompt = outfitPrompt.replace('{color}', colorPrompt);
      }
      
      promptParts.push(`ACTION: Change the person's clothing to ${outfitPrompt}. The clothes must fit the generated body shape and fill the bottom of the frame.`);
  } else {
      promptParts.push("ACTION: Extend the person's current clothing naturally to fill the generated body parts.");
  }
  
  // Hairstyle
  if (selectedHair && selectedHair.id !== 'original') {
    promptParts.push(`ACTION: Change the hairstyle to ${selectedHair.prompt}.`);
  }
  
  // Face Enhancement Options
  if (options.beautify) {
    promptParts.push("ACTION: Apply subtle professional skin retouching.");
  }
  
  if (options.lighting) {
    promptParts.push("ACTION: Fix uneven lighting (e.g., side shadows). Normalize the illumination to create a flat, professional studio lighting effect where the skin tone is even across the entire face.");
  }

  promptParts.push("OUTPUT: High-quality, photorealistic ID portrait.");

  const prompt = promptParts.join(' ');

  console.log("Sending prompt to Gemini:", prompt);

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: cleanBase64
            }
          },
          { text: prompt }
        ]
      }
    });

    if (response.candidates && response.candidates[0].content.parts) {
        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData && part.inlineData.data) {
                return `data:image/jpeg;base64,${part.inlineData.data}`;
            }
        }
    }

    throw new Error("No image generated by Gemini.");

  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};