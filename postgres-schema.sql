-- Schema for the Meal Genius application
--
-- This file defines the tables, relationships, and seed data required
-- to support the MVP features: users, fridge items, user preferences,
-- allergens, measurement and meal types. It assumes you are running
-- Supabase/Postgres 14 or later with the auth schema enabled.

-- Enable the pgcrypto extension for UUID generation (if not already)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Diet types: enumerated values for different dietary patterns
CREATE TABLE IF NOT EXISTS public.diet_types (
  id SERIAL PRIMARY KEY,
  name VARCHAR(20) NOT NULL UNIQUE
);

-- Meal types: breakfast, lunch, dinner, snack. Stored here to avoid
-- hardcoding and allow future expansion.
CREATE TABLE IF NOT EXISTS public.meal_types (
  id SERIAL PRIMARY KEY,
  name VARCHAR(20) NOT NULL UNIQUE
);

-- Measurement types: unit enumeration for fridge item quantities
CREATE TABLE IF NOT EXISTS public.measurement_types (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE
);

-- Profiles table extends auth.users with additional fields
CREATE TABLE IF NOT EXISTS public.profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  diet_type_id INTEGER REFERENCES public.diet_types (id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Fridge items belong to a user and represent ingredients stored in
-- their refrigerator. The measurement_type_id references the
-- measurement_types table.
CREATE TABLE IF NOT EXISTS public.fridge_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity NUMERIC NOT NULL,
  measurement_type_id INTEGER NOT NULL REFERENCES public.measurement_types (id),
  expiration_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User allergens: stores free-form allergen names for each user
CREATE TABLE IF NOT EXISTS public.user_allergens (
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  PRIMARY KEY (user_id, name)
);

-- User preferences: stores free-form likes/dislikes for each user.
-- The name column is not foreign-keyed so that users can define
-- arbitrary preferences. The preference_type specifies whether the
-- entry is liked or disliked.
CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  preference_type VARCHAR(10) NOT NULL CHECK (preference_type IN ('like', 'dislike')),
  PRIMARY KEY (user_id, name)
);

-- Recipes table stores generated recipes for auditing and history.
CREATE TABLE IF NOT EXISTS public.recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  meal_type_id INTEGER REFERENCES public.meal_types (id),
  ingredients JSONB NOT NULL,
  steps JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed data for diet types
INSERT INTO public.diet_types (name)
VALUES
  ('omnivore'),
  ('pescatarian'),
  ('vegetarian'),
  ('vegan')
ON CONFLICT (name) DO NOTHING;

-- Seed data for meal types
INSERT INTO public.meal_types (name)
VALUES
  ('breakfast'),
  ('lunch'),
  ('dinner'),
  ('snack')
ON CONFLICT (name) DO NOTHING;

-- Seed data for measurement types
INSERT INTO public.measurement_types (name)
VALUES
  ('grams'),
  ('milliliters'),
  ('pieces'),
  ('tablespoons'),
  ('teaspoons'),
  ('cups')
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------
-- Recipe templates for retrieval-augmented generation (RAG)
-- This table stores curated recipe examples along with a vector
-- representation of each recipe (embedding). The embedding can be
-- generated offline using a text-embedding model and inserted via
-- API/migration. The dimension (e.g. 1536) must match your embedding
-- model. Make sure the pgvector extension is enabled.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.recipe_templates (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536) NOT NULL
);

-- Create an index for efficient approximate nearest-neighbour search on
-- the embeddings. Tune the `lists` parameter based on dataset size.
CREATE INDEX IF NOT EXISTS recipe_templates_embedding_idx
  ON public.recipe_templates
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- RPC function to retrieve the top N most similar recipe templates by
-- cosine similarity. Pass in the query embedding vector and the
-- desired number of matches. The similarity score is returned for
-- potential weighting in your prompt.
CREATE OR REPLACE FUNCTION public.match_recipe_templates(
  query_embedding vector,
  match_count INTEGER
)
RETURNS TABLE (
  id INTEGER,
  title TEXT,
  content TEXT,
  similarity DOUBLE PRECISION
)
LANGUAGE SQL STABLE
AS $$
  SELECT id, title, content,
         1 - (embedding <=> query_embedding) AS similarity
    FROM public.recipe_templates
   ORDER BY embedding <=> query_embedding
   LIMIT match_count;
$$;