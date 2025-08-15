import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';

export const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// --- OpenAI -----------------------------------------------------------------
// Uses GPT-4o for strict-format JSON generation when Gemini proves verbose.
export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export const MODELS = {
  textPlanner: 'gemini-2.5-pro', // planning & prompt enhancement
  veoPreview: 'veo-3.0-generate-preview',
  veoFastPreview: 'veo-3.0-fast-generate-preview',
  gpt4o: 'gpt-4o'
};
