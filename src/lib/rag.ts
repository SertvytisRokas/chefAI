import { supabaseClient } from './supabaseClient';
import type { Database } from './types';

/**
 * Embeds a text using a local or remote embedding model. By default this
 * function calls the Ollama embeddings endpoint specified by
 * `EMBEDDING_MODEL_ENDPOINT` and `EMBEDDING_MODEL_NAME` environment
 * variables. The embedding dimension must match the vector column in
 * the `recipe_templates` table (1536 by default).
 */
export async function embedText(text: string): Promise<number[]> {
  const endpoint = process.env.EMBEDDING_MODEL_ENDPOINT || 'http://localhost:11434/api/embeddings';
  const model = process.env.EMBEDDING_MODEL_NAME || 'all-minilm';
  const body = {
    model,
    prompt: text
  };
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!resp.ok) {
    throw new Error(`Embedding request failed with status ${resp.status}`);
  }
  const data = await resp.json();
  // Ollama returns { embedding: number[] }
  return data.embedding;
}

/**
 * Retrieves the top `topK` recipe templates most similar to the query
 * embedding via Supabase RPC. Returns an array of objects containing
 * the template title and content. Similarity scores are ignored here
 * but could be used for weighting.
 */
export async function retrieveSimilarRecipes(queryEmbedding: number[], topK = 3) {
  const supabase = supabaseClient as any;
  const { data, error } = await supabase.rpc('match_recipe_templates', {
    query_embedding: queryEmbedding,
    match_count: topK
  });
  if (error) {
    console.error('Error retrieving templates', error);
    return [];
  }
  return data as {
    id: number;
    title: string;
    content: string;
    similarity: number;
  }[];
}