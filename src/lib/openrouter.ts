import 'server-only';

const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_EMBEDDINGS_URL = 'https://openrouter.ai/api/v1/embeddings';

function requireApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error('OPENROUTER_API_KEY is not set');
  }
  return key;
}

function openRouterHeaders(apiKey?: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey || requireApiKey()}`,
    'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
    'X-Title': 'chefAI'
  };
}

/**
 * Sends a chat completion request to OpenRouter and returns the assistant text.
 */
export async function openRouterChatCompletion(
  prompt: string,
  temperature = 0.2
): Promise<string> {
  const model = process.env.OPENROUTER_CHAT_MODEL;
  if (!model) {
    throw new Error('OPENROUTER_CHAT_MODEL is not set');
  }

  const resp = await fetch(OPENROUTER_CHAT_URL, {
    method: 'POST',
    headers: openRouterHeaders(),
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature
    })
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`OpenRouter chat failed (${resp.status}): ${errText}`);
  }

  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('OpenRouter chat returned an empty response');
  }
  return content;
}

/**
 * Sends a bounded, low-cost completion to the Kitchen Scribe model.
 *
 * Kept separate from `openRouterChatCompletion` on purpose: the Scribe runs on
 * every cook, so it uses a cheap model, a hard output cap, temperature 0 for
 * repeatability, and an optional dedicated API key so its spend can be tracked
 * or capped independently of recipe generation.
 */
export async function openRouterScribeCompletion(
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 700
): Promise<string> {
  const model = process.env.OPENROUTER_SCRIBE_MODEL;
  if (!model) {
    throw new Error(
      'OPENROUTER_SCRIBE_MODEL is not set. Point it at a cheap model to enable cook-to-fridge deduction.'
    );
  }
  const apiKey = process.env.OPENROUTER_SCRIBE_API_KEY || undefined;

  const resp = await fetch(OPENROUTER_CHAT_URL, {
    method: 'POST',
    headers: openRouterHeaders(apiKey),
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0,
      max_tokens: maxTokens
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
  const model = process.env.OPENROUTER_EMBEDDING_MODEL;
  if (!model) {
    throw new Error('OPENROUTER_EMBEDDING_MODEL is not set');
  }

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
    headers: openRouterHeaders(),
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
