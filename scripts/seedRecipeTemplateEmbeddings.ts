/**
 * One-time script: embed all recipe_templates rows and store vectors in Supabase.
 * Required for vector RAG search (templates ship with NULL embeddings in schema).
 *
 * Run from project root (loads .env.local if present via Node --env-file or export vars):
 *
 *   npx tsx scripts/seedRecipeTemplateEmbeddings.ts
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *           OPENROUTER_EMBEDDING_API_KEY, OPENROUTER_EMBEDDING_MODEL,
 *           EMBEDDING_DIMENSIONS (optional, default 1536)
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

function loadEnvLocal() {
  const path = resolve(process.cwd(), '.env.local');
  if (!existsSync(path)) return;
  const content = readFileSync(path, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

async function embedViaOpenRouter(text: string): Promise<number[]> {
  const key = process.env.OPENROUTER_EMBEDDING_API_KEY;
  const model = process.env.OPENROUTER_EMBEDDING_MODEL;
  if (!key || !model) {
    throw new Error(
      'OPENROUTER_EMBEDDING_API_KEY and OPENROUTER_EMBEDDING_MODEL must be set'
    );
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

  const resp = await fetch('https://openrouter.ai/api/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
      'X-Title': 'chefAI'
    },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    throw new Error(`Embedding failed (${resp.status}): ${await resp.text()}`);
  }
  const data = await resp.json();
  const embedding = data.data?.[0]?.embedding;
  if (!Array.isArray(embedding)) {
    throw new Error('No embedding in response');
  }
  return embedding as number[];
}

async function main() {
  loadEnvLocal();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false }
  });

  const { data: rows, error } = await supabase
    .from('recipe_templates')
    .select('id, title, content');

  if (error) throw error;
  if (!rows?.length) {
    console.log('No recipe_templates found.');
    return;
  }

  console.log(`Embedding ${rows.length} template(s)...`);

  for (const row of rows) {
    const text = `${row.title}\n${row.content}`;
    const embedding = await embedViaOpenRouter(text);
    const { error: updateError } = await supabase
      .from('recipe_templates')
      .update({ embedding })
      .eq('id', row.id);

    if (updateError) {
      console.error(`Failed to update template ${row.id}:`, updateError.message);
    } else {
      console.log(`Updated template ${row.id} (${row.title}) — ${embedding.length} dimensions`);
    }
  }

  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
