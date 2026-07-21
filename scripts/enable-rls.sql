-- Enable Row Level Security on every table in the public schema.
-- Run this in the Supabase SQL Editor (Project → SQL Editor → New query).
-- Safe to re-run: ENABLE ROW LEVEL SECURITY is idempotent and every policy
-- is dropped and recreated. Does not touch app code or require a redeploy.
--
-- Why: Supabase's Security Advisor flags "RLS Disabled in Public" for every
-- table below. Without RLS, the anon/authenticated PostgREST roles can read
-- and write ANY row in these tables — the app's own queries only filter by
-- `id` (not `user_id`) on several delete/update calls (e.g. fridge_items,
-- user_allergens, user_preferences, shopping_list), relying entirely on the
-- database to enforce ownership. This script adds that enforcement.

-- ── Per-user tables: owner-only access ──────────────────────────────────────

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner full access" ON public.profiles;
CREATE POLICY "Owner full access" ON public.profiles
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner full access" ON public.recipes;
CREATE POLICY "Owner full access" ON public.recipes
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.fridge_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner full access" ON public.fridge_items;
CREATE POLICY "Owner full access" ON public.fridge_items
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.user_allergens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner full access" ON public.user_allergens;
CREATE POLICY "Owner full access" ON public.user_allergens
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner full access" ON public.user_preferences;
CREATE POLICY "Owner full access" ON public.user_preferences
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.meal_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner full access" ON public.meal_plans;
CREATE POLICY "Owner full access" ON public.meal_plans
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.shopping_list ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner full access" ON public.shopping_list;
CREATE POLICY "Owner full access" ON public.shopping_list
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.user_personalization ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner full access" ON public.user_personalization;
CREATE POLICY "Owner full access" ON public.user_personalization
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── Global lookup / reference tables: public read, no client writes ───────
-- Writes happen via service role (seed script, SQL editor) only, which
-- bypasses RLS entirely — no write policy is needed for the app to work.

ALTER TABLE public.diet_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read" ON public.diet_types;
CREATE POLICY "Public read" ON public.diet_types
  FOR SELECT TO anon, authenticated USING (true);

ALTER TABLE public.meal_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read" ON public.meal_types;
CREATE POLICY "Public read" ON public.meal_types
  FOR SELECT TO anon, authenticated USING (true);

ALTER TABLE public.measurement_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read" ON public.measurement_types;
CREATE POLICY "Public read" ON public.measurement_types
  FOR SELECT TO anon, authenticated USING (true);

ALTER TABLE public.recipe_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read" ON public.recipe_templates;
CREATE POLICY "Public read" ON public.recipe_templates
  FOR SELECT TO anon, authenticated USING (true);
-- Note: rag.ts queries this table via the service role key, which bypasses
-- RLS regardless. This policy only matters if it's ever queried client-side.
