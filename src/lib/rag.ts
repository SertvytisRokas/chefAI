import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { openRouterEmbed } from './openrouter';

/**
 * Embeds text via OpenRouter. Vector length must match `recipe_templates.embedding`
 * (see EMBEDDING_DIMENSIONS, default 1536).
 */
export async function embedText(text: string): Promise<number[]> {
  return openRouterEmbed(text);
}

function createServiceSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
    global: { headers: { 'X-Client-Info': 'meal-app-rag/1.0' } }
  });
}

/**
 * Fallback when vector search returns nothing (e.g. templates not embedded yet).
 */
async function fetchTemplateFallback(topK: number) {
  const supabase = createServiceSupabase();
  if (!supabase) {
    console.error('Supabase URL or key is missing');
    return [];
  }
  const { data, error } = await supabase
    .from('recipe_templates')
    .select('id, title, content')
    .limit(topK);
  if (error) {
    console.error('Error fetching recipe templates fallback', error);
    return [];
  }
  return (data ?? []).map((row) => ({
    id: row.id as number,
    title: row.title as string,
    content: row.content as string,
    similarity: 0
  }));
}

/**
 * Retrieves the top `topK` recipe templates most similar to the query
 * embedding via Supabase RPC. Falls back to a plain list if RPC fails or
 * returns no rows (e.g. NULL embeddings in the database).
 */
export async function retrieveSimilarRecipes(queryEmbedding: number[], topK = 3) {
  const supabase = createServiceSupabase();
  if (!supabase) {
    console.error('Supabase URL or key is missing');
    return fetchTemplateFallback(topK);
  }

  const { data, error } = await (supabase as any).rpc('match_recipe_templates', {
    query_embedding: queryEmbedding,
    match_count: topK
  });

  if (error) {
    console.error('Error retrieving templates via RPC', error);
    return fetchTemplateFallback(topK);
  }

  const rows = (data ?? []) as {
    id: number;
    title: string;
    content: string;
    similarity: number;
  }[];

  if (rows.length === 0) {
    return fetchTemplateFallback(topK);
  }

  return rows;
}
