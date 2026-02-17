# chefai

A Next.js app that suggests recipes and weekly meal plans from ingredients you have, using a local LLM (Ollama) and Supabase for auth and data.

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
- **Supabase** – Auth, Postgres, optional embeddings
- **Ollama** – Local LLM (e.g. Qwen) and embeddings (e.g. nomic-embed-text)

## Prerequisites

- Node.js 18+
- pnpm
- [Supabase](https://supabase.com) project
- [Ollama](https://ollama.ai) with a chat model and an embedding model (see `.env.example`)

## Setup

1. Clone and install:

   ```bash
   pnpm install
   ```

2. Copy env and set your keys:

   ```bash
   cp .env.example .env.local
   ```

   Fill in Supabase URL and keys, and (if using local LLM) Ollama endpoints and model names.

3. Apply the database schema in the Supabase SQL editor (see `postgres-schema.sql`).

4. Run the app:

   ```bash
   pnpm dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command       | Description        |
|---------------|--------------------|
| `pnpm dev`    | Start dev server   |
| `pnpm build`  | Production build   |
| `pnpm start`  | Start production   |
| `pnpm lint`   | Run ESLint         |

## Project layout

- `src/app/` – App Router pages (fridge, genius, weekly, questionnaire, history, shopping, profile, login)
- `src/components/` – Shared UI (NavBar, SideNav, Modal, etc.)
- `src/lib/` – Auth, LLM client, RAG, personalization, types
- `src/app/api/generate/` – API route for recipe/weekly generation
- `postgres-schema.sql` – Supabase/Postgres schema and RAG function
