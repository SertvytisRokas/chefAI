-- =============================================================================
-- M1.5 — Schema alignment for Scribe v2, favourites, and unit standardisation
-- =============================================================================
--
-- ADDITIVE AND SAFE TO RE-RUN. This script never drops a table and never
-- destroys user data. Run it in the Supabase SQL editor against the live
-- project. (Never run postgres-schema.sql there — that one rebuilds everything.)
--
-- What it does:
--   1. Gives measurement_types real conversion metadata, so g <-> kg and
--      ml <-> l become deterministic arithmetic instead of an LLM guess.
--   2. Merges the duplicate/ambiguous units (kg|kilograms, lb|pounds,
--      units|pieces, dozens) after remapping every row that references them.
--   3. Adds fridge_items.favorite, .depleted_at, .created_at, .updated_at.
--   4. Adds a trigger that maintains depleted_at automatically, so the
--      "empty for 7 days" countdown is a database fact, not app logic.
--   5. Creates ingredient_standards — global, server-owned reference data
--      giving each ingredient a canonical unit and sub-unit relationship
--      (e.g. 1 garlic bulb = 10 cloves).
--
-- Seed data for ingredient_standards is in m15-seed-ingredient-standards.sql;
-- run that one second.
--
-- WRITTEN AGAINST THE LIVE SUPABASE SCHEMA (dumped 2026-08-13), not against
-- postgres-schema.sql, which has drifted and is now known to be stale — the
-- live `recipes` table has rating, feedback, diet_type_id and favorite columns
-- that the committed file does not mention. Regenerating postgres-schema.sql
-- from the live database is a task on the roadmap.
--
-- Every step below is guarded (IF NOT EXISTS / ON CONFLICT / IF ... IS NOT NULL),
-- so it behaves correctly whether or not a given unit row happens to exist.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. measurement_types: add conversion metadata
-- -----------------------------------------------------------------------------
-- dimension groups units that can convert between each other. to_base_factor is
-- expressed in that dimension's base unit (mass -> grams, volume -> ml,
-- count -> pieces). Converting is then pure arithmetic:
--   target_amount = amount * from.to_base_factor / to.to_base_factor
-- and a conversion between different dimensions is correctly impossible.

ALTER TABLE public.measurement_types
  ADD COLUMN IF NOT EXISTS abbreviation   text,
  ADD COLUMN IF NOT EXISTS dimension      text,
  ADD COLUMN IF NOT EXISTS to_base_factor numeric,
  ADD COLUMN IF NOT EXISTS is_active      boolean NOT NULL DEFAULT true;

-- Make sure every unit we rely on exists before we start remapping onto it.
INSERT INTO public.measurement_types (name)
VALUES ('grams'), ('kilograms'), ('pounds'), ('ml'), ('liters'),
       ('cups'), ('tablespoons'), ('teaspoons'), ('pieces')
ON CONFLICT (name) DO NOTHING;

UPDATE public.measurement_types SET abbreviation = v.abbr, dimension = v.dim, to_base_factor = v.factor
FROM (VALUES
    ('grams',       'g',    'mass',   1),
    ('kilograms',   'kg',   'mass',   1000),
    ('pounds',      'lb',   'mass',   453.592),
    ('ml',          'ml',   'volume', 1),
    ('liters',      'l',    'volume', 1000),
    ('cups',        'cup',  'volume', 240),
    ('tablespoons', 'tbsp', 'volume', 15),
    ('teaspoons',   'tsp',  'volume', 5),
    ('pieces',      'pc',   'count',  1)
) AS v(uname, abbr, dim, factor)
WHERE public.measurement_types.name = v.uname;

-- -----------------------------------------------------------------------------
-- 2. Merge duplicate and ambiguous units
-- -----------------------------------------------------------------------------
-- 'kg' == 'kilograms' and 'lb' == 'pounds' are pure duplicates: remap the id,
-- leave quantities alone. 'units' vs 'pieces' is an ambiguous pair with no
-- meaningful distinction -- 'pieces' wins. 'dozens' is a real unit, so its rows
-- are converted (x12) rather than relabelled.

DO $$
DECLARE
  v_pieces_id    integer;
  v_dozens_id    integer;
  v_kilograms_id integer;
  v_kg_id        integer;
  v_pounds_id    integer;
  v_lb_id        integer;
  v_units_id     integer;
BEGIN
  SELECT id INTO v_pieces_id    FROM public.measurement_types WHERE name = 'pieces';
  SELECT id INTO v_dozens_id    FROM public.measurement_types WHERE name = 'dozens';
  SELECT id INTO v_kilograms_id FROM public.measurement_types WHERE name = 'kilograms';
  SELECT id INTO v_kg_id        FROM public.measurement_types WHERE name = 'kg';
  SELECT id INTO v_pounds_id    FROM public.measurement_types WHERE name = 'pounds';
  SELECT id INTO v_lb_id        FROM public.measurement_types WHERE name = 'lb';
  SELECT id INTO v_units_id     FROM public.measurement_types WHERE name = 'units';

  -- 'dozens' -> 'pieces', multiplying the quantity by 12.
  IF v_dozens_id IS NOT NULL AND v_pieces_id IS NOT NULL THEN
    UPDATE public.fridge_items
      SET quantity = quantity * 12, measurement_type_id = v_pieces_id
      WHERE measurement_type_id = v_dozens_id;
    UPDATE public.shopping_list
      SET quantity = quantity * 12, measurement_type_id = v_pieces_id
      WHERE measurement_type_id = v_dozens_id;
  END IF;

  -- Pure relabels: same physical unit, different spelling.
  IF v_kg_id IS NOT NULL AND v_kilograms_id IS NOT NULL THEN
    UPDATE public.fridge_items  SET measurement_type_id = v_kilograms_id WHERE measurement_type_id = v_kg_id;
    UPDATE public.shopping_list SET measurement_type_id = v_kilograms_id WHERE measurement_type_id = v_kg_id;
  END IF;

  IF v_lb_id IS NOT NULL AND v_pounds_id IS NOT NULL THEN
    UPDATE public.fridge_items  SET measurement_type_id = v_pounds_id WHERE measurement_type_id = v_lb_id;
    UPDATE public.shopping_list SET measurement_type_id = v_pounds_id WHERE measurement_type_id = v_lb_id;
  END IF;

  IF v_units_id IS NOT NULL AND v_pieces_id IS NOT NULL THEN
    UPDATE public.fridge_items  SET measurement_type_id = v_pieces_id WHERE measurement_type_id = v_units_id;
    UPDATE public.shopping_list SET measurement_type_id = v_pieces_id WHERE measurement_type_id = v_units_id;
  END IF;
END $$;

-- Nothing references them now, so remove them for good.
DELETE FROM public.measurement_types WHERE name IN ('kg', 'lb', 'units', 'dozens');

-- Any unit still lacking metadata is one we did not anticipate. Park it as
-- inactive rather than leaving a silent hole in the conversion table.
UPDATE public.measurement_types SET is_active = false WHERE dimension IS NULL;

-- -----------------------------------------------------------------------------
-- 3. fridge_items: favourites, depletion tracking, timestamps
-- -----------------------------------------------------------------------------
-- created_at/updated_at also close a real drift: src/lib/types.ts has always
-- claimed fridge_items had them, and it never did.

ALTER TABLE public.fridge_items
  ADD COLUMN IF NOT EXISTS favorite    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS depleted_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS created_at  timestamp with time zone NOT NULL DEFAULT timezone('utc', now()),
  ADD COLUMN IF NOT EXISTS updated_at  timestamp with time zone NOT NULL DEFAULT timezone('utc', now());

COMMENT ON COLUMN public.fridge_items.favorite IS
  'Pinned staple. Pinned above the main list and never auto-removed when it hits zero.';
COMMENT ON COLUMN public.fridge_items.depleted_at IS
  'Set automatically when quantity reaches 0, cleared when restocked. Start of the 7-day auto-removal window.';

-- -----------------------------------------------------------------------------
-- 4. Triggers: keep updated_at and depleted_at honest
-- -----------------------------------------------------------------------------
-- Enforced in the database so every write path agrees, including manual SQL.

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := timezone('utc', now());
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.track_fridge_depletion()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.quantity <= 0 THEN
    -- Only stamp the first time it empties, so the countdown isn't restarted
    -- by an unrelated edit.
    IF NEW.depleted_at IS NULL THEN
      NEW.depleted_at := timezone('utc', now());
    END IF;
  ELSE
    NEW.depleted_at := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS fridge_items_touch_updated_at ON public.fridge_items;
CREATE TRIGGER fridge_items_touch_updated_at
  BEFORE UPDATE ON public.fridge_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS fridge_items_track_depletion ON public.fridge_items;
CREATE TRIGGER fridge_items_track_depletion
  BEFORE INSERT OR UPDATE OF quantity ON public.fridge_items
  FOR EACH ROW EXECUTE FUNCTION public.track_fridge_depletion();

-- Backfill for rows already sitting at zero (e.g. the wiped potatoes).
UPDATE public.fridge_items
  SET depleted_at = timezone('utc', now())
  WHERE quantity <= 0 AND depleted_at IS NULL;

CREATE INDEX IF NOT EXISTS fridge_items_user_favorite_idx
  ON public.fridge_items (user_id, favorite);
CREATE INDEX IF NOT EXISTS fridge_items_depleted_idx
  ON public.fridge_items (depleted_at) WHERE depleted_at IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 5. ingredient_standards: global canonical units per ingredient
-- -----------------------------------------------------------------------------
-- Server-owned reference data shared by every user. Its job is to remove
-- guesswork from the Scribe: it says which unit an ingredient is normally
-- stored in, what its sub-unit is, and how many sub-units make one whole.
-- That last pair is what turns "2 cloves out of 1 bulb" into arithmetic
-- (2 / 10 = 0.2 pieces) instead of an LLM estimate.

CREATE TABLE IF NOT EXISTS public.ingredient_standards (
  id                      bigserial PRIMARY KEY,
  name                    text NOT NULL UNIQUE,
  measurement_type_id     integer NOT NULL REFERENCES public.measurement_types(id),
  aliases                 text[] NOT NULL DEFAULT '{}',
  sub_unit                text,
  sub_units_per_unit      numeric,
  category                text,
  typical_shelf_life_days integer,
  created_at              timestamp with time zone NOT NULL DEFAULT timezone('utc', now()),
  updated_at              timestamp with time zone NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT ingredient_standards_sub_unit_pair CHECK (
    (sub_unit IS NULL AND sub_units_per_unit IS NULL) OR
    (sub_unit IS NOT NULL AND sub_units_per_unit IS NOT NULL AND sub_units_per_unit > 0)
  )
);

COMMENT ON TABLE public.ingredient_standards IS
  'Global reference data: the canonical unit for each ingredient. Read-only to users; maintained server-side.';
COMMENT ON COLUMN public.ingredient_standards.sub_units_per_unit IS
  'How many sub_units make one canonical unit, e.g. garlic: 10 cloves per piece (bulb).';

CREATE INDEX IF NOT EXISTS ingredient_standards_aliases_idx
  ON public.ingredient_standards USING gin (aliases);

DROP TRIGGER IF EXISTS ingredient_standards_touch_updated_at ON public.ingredient_standards;
CREATE TRIGGER ingredient_standards_touch_updated_at
  BEFORE UPDATE ON public.ingredient_standards
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- RLS: readable by anyone using the app; writable by nobody through the client.
-- Server-side maintenance goes through the service role, which bypasses RLS.
-- Read is granted to anon as well as authenticated: this is a public units
-- lookup with nothing sensitive in it, and restricting it to authenticated
-- would break any pre-login screen that ever needs it.
ALTER TABLE public.ingredient_standards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ingredient_standards_read ON public.ingredient_standards;
CREATE POLICY ingredient_standards_read
  ON public.ingredient_standards FOR SELECT
  TO anon, authenticated
  USING (true);

-- NOTE: deliberately NOT enabling RLS on measurement_types. It is currently
-- open and the client reads it directly; switching it on here would risk
-- breaking a working app to protect a list of unit names. If it is ever
-- locked down, grant SELECT to both anon and authenticated in the same move.

COMMIT;

-- =============================================================================
-- Verification — run these after committing and eyeball the output
-- =============================================================================
-- Every active unit should have a dimension and a factor:
--   SELECT name, abbreviation, dimension, to_base_factor, is_active
--     FROM public.measurement_types ORDER BY dimension, to_base_factor;
--
-- No fridge row should point at a retired unit (expect 0 rows):
--   SELECT f.id, f.name FROM public.fridge_items f
--    WHERE f.measurement_type_id NOT IN (SELECT id FROM public.measurement_types);
--
-- Depleted items and their countdown start:
--   SELECT name, quantity, favorite, depleted_at FROM public.fridge_items
--    WHERE quantity <= 0;
