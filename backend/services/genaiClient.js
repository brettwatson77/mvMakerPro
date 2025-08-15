import { GoogleGenAI } from '@google/genai';

export const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export const MODELS = {
  textPlanner: 'gemini-2.5-pro', // planning & prompt enhancement
  veoPreview: 'veo-3.0-generate-preview',
  veoFastPreview: 'veo-3.0-fast-generate-preview'
};
