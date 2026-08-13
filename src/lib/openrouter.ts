import 'server-only';

const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_EMBEDDINGS_URL = 'https://openrouter.ai/api/v1/embeddings';

/**
 * Every distinct job we send to OpenRouter.
 *
 * Each job has its own model and its own API key, so a model can be swapped for
 * one job without touching the others, and spend is attributed per feature in
 * the OpenRouter dashboard.
 *
 * An OpenRouter key is only a credential — no model is bound to it. The model is
 * chosen per request, here in the code, from the env vars below.
 */
export type LlmPurpose = 'recipe' | 'weekly' | 'scribe' | 'embedding';

/** Which model runs each job. One variable each, no fallbacks. */
const MODEL_ENV: Record<LlmPurpose, string> = {
  recipe: 'OPENROUTER_RECIPE_MODEL',
  weekly: 'OPENROUTER_WEEKLY_MODEL',
  scribe: 'OPENROUTER_SCRIBE_MODEL',
  embedding: 'OPENROUTER_EMBEDDING_MODEL'
};

/** Which credential pays for each job. One variable each, no fallbacks. */
const KEY_ENV: Record<LlmPurpose, string> = {
  recipe: 'OPENROUTER_RECIPE_API_KEY',
  weekly: 'OPENROUTER_WEEKLY_API_KEY',
  scribe: 'OPENROUTER_SCRIBE_API_KEY',
  embedding: 'OPENROUTER_EMBEDDING_API_KEY'
};

/** Reads an env var, treating blank or whitespace-only as unset. */
function readEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

/** Resolves which model id to use. The error names the exact variable to set. */
function resolveModel(purpose: LlmPurpose): string {
  const name = MODEL_ENV[purpose];
  const model = readEnv(name);
  if (!model) {
    throw new Error(`${name} is not set (required for "${purpose}").`);
  }
  return model;
}

/** Resolves which key to authenticate with. The error names the exact variable to set. */
function resolveApiKey(purpose: LlmPurpose): string {
  const name = KEY_ENV[purpose];
  const key = readEnv(name);
  if (!key) {
    throw new Error(`${name} is not set (required for "${purpose}").`);
  }
  return key;
}

function openRouterHeaders(purpose: LlmPurpose): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${resolveApiKey(purpose)}`,
    'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
    'X-Title': 'chefAI'
  };
}

/**
 * Sends a chat completion request to OpenRouter and returns the assistant text.
 * Used for the two generation jobs (single recipe, weekly plan).
 */
export async function openRouterChatCompletion(
  purpose: Extract<LlmPurpose, 'recipe' | 'weekly'>,
  prompt: string,
  temperature = 0.2
): Promise<string> {
  const model = resolveModel(purpose);

  const resp = await fetch(OPENROUTER_CHAT_URL, {
    method: 'POST',
    headers: openRouterHeaders(purpose),
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature
    })
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`OpenRouter ${purpose} request failed (${resp.status}): ${errText}`);
  }

  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error(`OpenRouter ${purpose} request returned an empty response`);
  }
  return content;
}

/**
 * Sends a bounded, low-cost completion to the Kitchen Scribe model.
 *
 * Kept separate from `openRouterChatCompletion` on purpose: the Scribe runs on
 * every cook, so it uses a cheap model, a hard output cap, and temperature 0
 * for repeatability.
 */
export async function openRouterScribeCompletion(
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 700
): Promise<string> {
  const model = resolveModel('scribe');

  const resp = await fetch(OPENROUTER_CHAT_URL, {
    method: 'POST',
    headers: openRouterHeaders('scribe'),
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0,
      max_tokens: maxTokens,
      // Enforce valid JSON at the provider rather than hoping the prompt holds.
      // OPENROUTER_SCRIBE_MODEL must support structured outputs; if it doesn't,
      // OpenRouter returns a 400 and the error names this request.
      response_format: { type: 'json_object' }
    })
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Kitchen Scribe request failed (${resp.status}): ${errText}`);
  }

  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Kitchen Scribe returned an empty response');
  }
  return content;
}

/**
 * Generates an embedding vector via OpenRouter. Dimension must match
 * `recipe_templates.embedding` in Postgres (default 1536).
 */
export async function openRouterEmbed(text: string): Promise<number[]> {
  const model = resolveModel('embedding');

  const dimensions = parseInt(process.env.EMBEDDING_DIMENSIONS || '1536', 10);

  const body: Record<string, unknown> = {
    model,
    input: text,
    encoding_format: 'float'
  };
  if (!Number.isNaN(dimensions) && dimensions > 0) {
    body.dimensions = dimensions;
  }

  const resp = await fetch(OPENROUTER_EMBEDDINGS_URL, {
    method: 'POST',
    headers: openRouterHeaders('embedding'),
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`OpenRouter embedding failed (${resp.status}): ${errText}`);
  }

  const data = await resp.json();
  const embedding = data.data?.[0]?.embedding;
  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error('OpenRouter embedding returned no vector');
  }
  return embedding as number[];
}

/**
 * Extracts and parses a JSON object from model text (strips markdown fences, fixes trailing commas).
 */
export function parseJsonFromModelResponse<T>(raw: string, label: string): T {
  let text = raw.trim();
  const fenceMatch = text.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }

  const jsonStart = text.indexOf('{');
  const jsonEnd = text.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error(`Failed to parse JSON ${label} from model response`);
  }

  const jsonString = text.slice(jsonStart, jsonEnd + 1);
  const cleaned = jsonString.replace(/,\s*([}\]])/g, '$1');
  try {
    return JSON.parse(cleaned) as T;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse JSON ${label}: ${message}`);
  }
}
