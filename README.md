# chefai

A Next.js app that suggests recipes and weekly meal plans from ingredients you have, using OpenRouter (chat + embeddings) and Supabase for auth and data.

## Features

- **Fridge** – Track ingredients and expiry
- **Single generation** – Generate a single recipe from your fridge and preferences (diet, allergens, likes/dislikes)
- **Weekly plan** – Generate a 7-day meal plan (breakfast, lunch, dinner) from fridge and preferences
- **Personalization** – Questionnaire for diet, health goals, cuisines, and cooking habits; answers are used when generating recipes
- **History** – View and manage saved recipes
- **Shopping** – Shopping list support

Recipes are powered by RAG over stored recipe templates and your fridge contents. Diet type (vegan/vegetarian/pescatarian/omnivore) is inferred by the model and stored with each recipe.

## Stack

- **Next.js 14** (App Router), **React 18**, **TypeScript**
- **Supabase** – Auth, Postgres, pgvector RAG
- **OpenRouter** – Chat model (e.g. Owl Alpha) and embedding model (e.g. Qwen3 Embedding 8B)

## Prerequisites

- Node.js 18+
- pnpm
- [Supabase](https://supabase.com) project
- [OpenRouter](https://openrouter.ai) API key

## Setup

1. Clone and install:

   ```bash
   pnpm install
   ```

2. Copy env and set your keys:

   ```bash
   cp .env.example .env.local
   ```

   Fill in Supabase URL and keys, `OPENROUTER_API_KEY`, `OPENROUTER_CHAT_MODEL`, and `OPENROUTER_EMBEDDING_MODEL` (see `.env.example` for suggested defaults).

3. Apply the database schema in the Supabase SQL editor (see `postgres-schema.sql`).

4. **Seed recipe template embeddings** (one-time, enables vector RAG):

   ```bash
   pnpm seed:embeddings
   ```

   Requires the same OpenRouter and Supabase env vars as the app. Templates in the schema start with `NULL` embeddings; this script fills them.

5. Run the app:

   ```bash
   pnpm dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Environment variables

| Variable | Description |
|----------|-------------|
| `OPENROUTER_API_KEY` | Your OpenRouter API key (chat + embeddings) |
| `OPENROUTER_CHAT_MODEL` | Model id for recipe / weekly generation |
| `OPENROUTER_EMBEDDING_MODEL` | Model id for RAG embeddings |
| `EMBEDDING_DIMENSIONS` | Vector size (default `1536`, must match `recipe_templates.embedding` in Postgres) |

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start dev server |
| `pnpm build` | Production build |
| `pnpm start` | Start production |
| `pnpm lint` | Run ESLint |
| `pnpm seed:embeddings` | Embed `recipe_templates` rows in Supabase (one-time RAG setup) |

## Project layout

- `src/app/` – App Router pages (fridge, genius, weekly, questionnaire, history, shopping, profile, login)
- `src/components/` – Shared UI (NavBar, SideNav, Modal, etc.)
- `src/lib/` – Auth, OpenRouter client, RAG, personalization, types
- `src/app/api/generate/` – Recipe generation API
- `src/app/api/generate-weekly/` – Weekly plan generation API
- `postgres-schema.sql` – Supabase/Postgres schema and RAG function

## Deploying (e.g. Vercel)

Add the same environment variables in your hosting provider. No local Ollama or other processes are required—the app calls OpenRouter and Supabase from the server only.
