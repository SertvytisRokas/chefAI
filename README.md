# chefai

A Next.js app that suggests recipes and weekly meal plans from ingredients you have, using OpenRouter (chat + embeddings) and Supabase for auth and data.

## Features

- **Fridge** – Track ingredients and expiry
- **Cook → deduct** – "I cooked this" resolves a recipe against your fridge, reconciles units ("2 cloves" against "1 bulb"), and updates quantities after you confirm
- **Single generation** – Generate a single recipe from your fridge and preferences (diet, allergens, likes/dislikes)
- **Weekly plan** – Generate a 7-day meal plan (breakfast, lunch, dinner) from fridge and preferences
- **Personalization** – Questionnaire for diet, health goals, cuisines, and cooking habits; answers are used when generating recipes
- **History** – View and manage saved recipes
- **Shopping** – Shopping list support
- **Blog** – Curated library of external articles on food waste and cooking, with genre filtering and a featured carousel on the landing page

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

3. Apply the database schema in the Supabase SQL editor (see `postgres-schema.sql`). **This script drops and recreates every table — only run it on a fresh project, never against one with existing data.**

   For an existing project, instead apply the additive migrations individually:
   - `scripts/blog-articles.sql` – blog tables + seed content
   - `scripts/enable-rls.sql` – Row Level Security policies (required so users can't read/write each other's data; safe to re-run anytime)

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
| `OPENROUTER_SCRIBE_MODEL` | Small, cheap model id used to resolve cooked recipes against the fridge. Required for "I cooked this". |
| `OPENROUTER_SCRIBE_API_KEY` | Optional separate key for the above, so its spend can be tracked or capped independently. Falls back to `OPENROUTER_API_KEY`. |

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start dev server |
| `pnpm build` | Production build |
| `pnpm start` | Start production |
| `pnpm lint` | Run ESLint |
| `pnpm seed:embeddings` | Embed `recipe_templates` rows in Supabase (one-time RAG setup) |

## Project layout

- `src/app/` – App Router pages (fridge, genius, weekly, questionnaire, history, shopping, profile, login, blog, auth/callback, auth/confirmed)
- `src/components/` – Shared UI (AppShell, LandingHeader, UserMenu, SideNav, Modal, BlogCarousel, etc.)
- `src/lib/` – Auth, OpenRouter client, RAG, personalization, blog, types
- `src/app/api/generate/` – Recipe generation API
- `src/app/api/generate-weekly/` – Weekly plan generation API
- `src/app/api/cook/plan/` – Proposes fridge deductions for a cooked recipe (read-only)
- `src/app/api/cook/apply/` – Applies a confirmed deduction plan (no model call)
- `src/lib/scribe.ts` – Resolves recipe ingredients against fridge items and reconciles units
- `src/lib/executor.ts` – Deterministic fridge arithmetic; the only place cooking mutates quantities
- `src/app/api/auth/check-email/` – Signup email status check (duplicate/pending detection)
- `postgres-schema.sql` – Supabase/Postgres schema and RAG function (fresh installs only)
- `scripts/blog-articles.sql`, `scripts/enable-rls.sql` – Additive migrations for an existing project

## Deploying (e.g. Vercel)

Add the same environment variables in your hosting provider. No local Ollama or other processes are required—the app calls OpenRouter and Supabase from the server only.
