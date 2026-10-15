import type { FormSchema } from '@intuitui-labs/form-builder-engine';
import {
  compilePromptToSchema,
  SearchGroundedFormCompiler,
} from '@intuitui-labs/form-builder-engine/ai';

const LOCAL_STORAGE_KEY = 'intuitui_gemini_api_key';

export function getStoredApiKey(): string {
  // 1. Check Expo public environment variable
  const envKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  if (envKey && typeof envKey === 'string' && envKey.trim() !== '') {
    return envKey.trim();
  }

  // 2. Check localStorage (for browser / web runtime)
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const stored = window.localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored && typeof stored === 'string' && stored.trim() !== '') {
        return stored.trim();
      }
    } catch {
      // Ignore localStorage access failure
    }
  }

  return '';
}

export function saveStoredApiKey(key: string): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      if (key && key.trim() !== '') {
        window.localStorage.setItem(LOCAL_STORAGE_KEY, key.trim());
      } else {
        window.localStorage.removeItem(LOCAL_STORAGE_KEY);
      }
    } catch {
      // Ignore localStorage error
    }
  }
}

async function callGeminiApi(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  model = 'gemini-2.5-flash',
): Promise<string> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: userPrompt }],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    // Fallback to gemini-1.5-flash if 2.5-flash not found or quota issue
    if (model !== 'gemini-1.5-flash' && (response.status === 404 || response.status === 400)) {
      return callGeminiApi(apiKey, systemPrompt, userPrompt, 'gemini-1.5-flash');
    }
    throw new Error(`Gemini API error (${response.status}): ${errorBody}`);
  }

  const json = await response.json();
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Gemini API returned an empty completion response.');
  }
  return text;
}

export interface AiScaffoldResult {
  schema: FormSchema;
  provider: 'gemini' | 'grounded-offline';
  model?: string;
  notes?: string;
}

/**
 * Enterprise AI Form Scaffolding Dispatcher.
 * Uses real Gemini API if an API key is present in .env or local storage;
 * seamlessly falls back to the deterministic SearchGroundedFormCompiler offline engine if not.
 */
export async function compileWithAi(
  prompt: string,
  customApiKey?: string,
): Promise<AiScaffoldResult> {
  const activeKey = customApiKey?.trim() || getStoredApiKey();

  // 1. If API key is available, execute live Gemini completion
  if (activeKey) {
    try {
      const compilation = await compilePromptToSchema(prompt, (sys, user) =>
        callGeminiApi(activeKey, sys, user, 'gemini-2.5-flash'),
      );

      if (compilation.success && compilation.schema) {
        return {
          schema: compilation.schema,
          provider: 'gemini',
          model: 'gemini-2.5-flash',
          notes: compilation.lintIssues?.length
            ? `Compiled via Gemini 2.5 Flash with ${compilation.lintIssues.length} auto-healed lint warnings.`
            : 'Compiled successfully with zero lint issues via Gemini 2.5 Flash.',
        };
      }
    } catch (err) {
      console.warn('Gemini API call failed, falling back to offline grounded scaffolder:', err);
    }
  }

  // 2. Offline / zero-key fallback using built-in SearchGroundedFormCompiler
  const fallbackResult = SearchGroundedFormCompiler.compileFromPrompt(prompt);
  return {
    schema: fallbackResult.schema,
    provider: 'grounded-offline',
    notes: activeKey
      ? 'Gemini API call failed; gracefully fallen back to offline grounded scaffolder.'
      : 'Scaffolded using built-in offline search-grounded compiler. Connect an API key for custom Gemini generation.',
  };
}
