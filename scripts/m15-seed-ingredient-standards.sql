-- =============================================================================
-- M1.5 — Seed ingredient_standards (global canonical units)
-- =============================================================================
--
-- Run AFTER m15-schema-alignment.sql. Safe to re-run: existing rows are left
-- alone via ON CONFLICT (name) DO NOTHING.
--
-- Purpose: give the Kitchen Scribe a fixed answer to "what unit is this
-- ingredient normally kept in, and how do its sub-units work" so it stops
-- guessing. Every row here removes a decision from the model.
--
-- The columns that matter most:
--   measurement_type_id   canonical unit an ingredient is stored in
--   aliases               how recipes and users actually write it
--   sub_unit /            e.g. garlic: 'clove' / 10, so "2 cloves" resolves to
--   sub_units_per_unit    2 / 10 = 0.2 pieces by arithmetic, not estimation
--
-- Coverage: everything in seedFridge.sql, plus the staples that show up most in
-- generated recipes. This is a starting set, not a finished catalogue -- the
-- roadmap tracks growing it and having new fridge items normalised on entry.
-- =============================================================================

BEGIN;

INSERT INTO public.ingredient_standards
  (name, measurement_type_id, aliases, sub_unit, sub_units_per_unit, category, typical_shelf_life_days)
SELECT
  v.name,
  (SELECT id FROM public.measurement_types WHERE name = v.unit),
  v.aliases,
  v.sub_unit,
  v.sub_per_unit,
  v.category,
  v.shelf_life
FROM (VALUES
  -- name, canonical unit, aliases, sub_unit, sub_units_per_unit, category, shelf life (days)

  -- ---- Aromatics & things measured in confusing sub-units ------------------
  -- This block is the whole reason the table exists.
  ('garlic',          'pieces', ARRAY['garlic bulb','garlic head','garlic cloves','clove of garlic'], 'clove',  10,   'produce', 90),
  ('ginger',          'grams',  ARRAY['ginger root','fresh ginger'],                                   NULL,    NULL, 'produce', 21),
  ('onions',          'pieces', ARRAY['onion','yellow onion','brown onion','white onion'],             'half',  2,    'produce', 30),
  ('red onions',      'pieces', ARRAY['red onion'],                                                    'half',  2,    'produce', 30),
  ('spring onions',   'pieces', ARRAY['scallion','scallions','green onion','green onions'],            NULL,    NULL, 'produce', 10),
  ('lemons',          'pieces', ARRAY['lemon'],                                                        'half',  2,    'produce', 21),
  ('limes',           'pieces', ARRAY['lime'],                                                         'half',  2,    'produce', 21),

  -- ---- Produce -------------------------------------------------------------
  ('potatoes',        'kilograms', ARRAY['potato'],                                    NULL, NULL, 'produce', 30),
  ('sweet potatoes',  'kilograms', ARRAY['sweet potato'],                              NULL, NULL, 'produce', 21),
  ('tomatoes',        'pieces',    ARRAY['tomato'],                                    NULL, NULL, 'produce', 7),
  ('canned tomatoes', 'pieces',    ARRAY['tinned tomatoes','chopped tomatoes','can of tomatoes'], NULL, NULL, 'pantry', 730),
  ('carrots',         'pieces',    ARRAY['carrot'],                                    NULL, NULL, 'produce', 21),
  ('broccoli',        'pieces',    ARRAY['broccoli head'],                             NULL, NULL, 'produce', 7),
  ('cauliflower',     'pieces',    ARRAY['cauliflower head'],                          NULL, NULL, 'produce', 7),
  ('bell peppers',    'pieces',    ARRAY['bell pepper','pepper','capsicum','red pepper','green pepper'], NULL, NULL, 'produce', 10),
  ('chili peppers',   'pieces',    ARRAY['chili','chilli','chile','hot pepper'],       NULL, NULL, 'produce', 14),
  ('spinach',         'grams',     ARRAY['baby spinach','fresh spinach'],              NULL, NULL, 'produce', 5),
  ('lettuce',         'pieces',    ARRAY['salad leaves','romaine','iceberg lettuce'],  NULL, NULL, 'produce', 7),
  ('mushrooms',       'grams',     ARRAY['mushroom','button mushrooms','chestnut mushrooms'], NULL, NULL, 'produce', 7),
  ('courgette',       'pieces',    ARRAY['zucchini'],                                  NULL, NULL, 'produce', 10),
  ('aubergine',       'pieces',    ARRAY['eggplant'],                                  NULL, NULL, 'produce', 10),
  ('cucumber',        'pieces',    ARRAY['cucumbers'],                                 NULL, NULL, 'produce', 10),
  ('avocado',         'pieces',    ARRAY['avocados'],                                  'half', 2, 'produce', 5),
  ('apples',          'pieces',    ARRAY['apple'],                                     NULL, NULL, 'produce', 21),
  ('bananas',         'pieces',    ARRAY['banana'],                                    NULL, NULL, 'produce', 7),
  ('peas',            'grams',     ARRAY['frozen peas','green peas'],                  NULL, NULL, 'frozen',  180),
  ('sweetcorn',       'grams',     ARRAY['corn','canned corn'],                        NULL, NULL, 'pantry',  365),

  -- ---- Dairy & eggs --------------------------------------------------------
  ('eggs',            'pieces', ARRAY['egg','large eggs','medium eggs'], NULL, NULL, 'dairy', 21),
  ('milk',            'liters', ARRAY['whole milk','semi-skimmed milk','skimmed milk'], NULL, NULL, 'dairy', 7),
  ('oat milk',        'liters', ARRAY['oatmilk','oat drink'],           NULL, NULL, 'dairy', 7),
  ('butter',          'grams',  ARRAY['unsalted butter','salted butter'], NULL, NULL, 'dairy', 60),
  ('cream',           'ml',     ARRAY['double cream','heavy cream','single cream'], NULL, NULL, 'dairy', 10),
  ('yogurt',          'grams',  ARRAY['yoghurt','greek yogurt','natural yogurt'], NULL, NULL, 'dairy', 14),
  ('cheddar cheese',  'grams',  ARRAY['cheddar','grated cheddar'],      NULL, NULL, 'dairy', 30),
  ('parmesan',        'grams',  ARRAY['parmigiano','parmesan cheese','grated parmesan'], NULL, NULL, 'dairy', 60),
  ('feta cheese',     'grams',  ARRAY['feta'],                          NULL, NULL, 'dairy', 21),
  ('mozzarella',      'grams',  ARRAY['mozzarella cheese'],             NULL, NULL, 'dairy', 14),

  -- ---- Protein -------------------------------------------------------------
  ('chicken breast',  'pieces', ARRAY['chicken breasts','chicken fillet'], NULL, NULL, 'protein', 3),
  ('chicken thighs',  'pieces', ARRAY['chicken thigh'],                    NULL, NULL, 'protein', 3),
  ('ground beef',     'grams',  ARRAY['minced beef','beef mince','mince'], NULL, NULL, 'protein', 3),
  ('ground pork',     'grams',  ARRAY['minced pork','pork mince'],         NULL, NULL, 'protein', 3),
  ('bacon',           'grams',  ARRAY['streaky bacon','bacon rashers'],    NULL, NULL, 'protein', 10),
  ('salmon',          'grams',  ARRAY['salmon fillet','salmon fillets'],   NULL, NULL, 'protein', 2),
  ('tuna',            'grams',  ARRAY['canned tuna','tinned tuna'],        NULL, NULL, 'pantry',  730),
  ('tofu',            'grams',  ARRAY['firm tofu','silken tofu'],          NULL, NULL, 'protein', 14),
  ('canned beans',    'pieces', ARRAY['tinned beans','black beans','kidney beans','cannellini beans'], NULL, NULL, 'pantry', 730),
  ('chickpeas',       'grams',  ARRAY['garbanzo beans','canned chickpeas'], NULL, NULL, 'pantry', 730),
  ('lentils',         'grams',  ARRAY['red lentils','green lentils'],      NULL, NULL, 'pantry', 730),

  -- ---- Pantry staples ------------------------------------------------------
  ('rice',            'kilograms', ARRAY['white rice','basmati rice','jasmine rice','long grain rice'], NULL, NULL, 'pantry', 730),
  ('pasta',           'grams',     ARRAY['spaghetti','penne','fusilli','macaroni','tagliatelle'], NULL, NULL, 'pantry', 730),
  ('noodles',         'grams',     ARRAY['egg noodles','rice noodles'],   NULL, NULL, 'pantry', 730),
  ('flour',           'kilograms', ARRAY['plain flour','all-purpose flour','wheat flour'], NULL, NULL, 'pantry', 365),
  ('sugar',           'grams',     ARRAY['caster sugar','granulated sugar','white sugar'], NULL, NULL, 'pantry', 730),
  ('salt',            'grams',     ARRAY['table salt','sea salt','kosher salt'], NULL, NULL, 'pantry', 3650),
  ('black pepper',    'grams',     ARRAY['pepper','ground black pepper','peppercorns'], NULL, NULL, 'pantry', 730),
  ('olive oil',       'ml',        ARRAY['extra virgin olive oil','evoo'], NULL, NULL, 'pantry', 540),
  ('vegetable oil',   'ml',        ARRAY['sunflower oil','rapeseed oil','cooking oil'], NULL, NULL, 'pantry', 540),
  ('vinegar',         'ml',        ARRAY['white vinegar','balsamic vinegar','apple cider vinegar'], NULL, NULL, 'pantry', 1095),
  ('soy sauce',       'ml',        ARRAY['light soy sauce','dark soy sauce'], NULL, NULL, 'pantry', 730),
  ('honey',           'grams',     ARRAY['runny honey'],                  NULL, NULL, 'pantry', 1095),
  ('bread',           'pieces',    ARRAY['loaf','loaf of bread','sliced bread','toast'], 'slice', 20, 'bakery', 5),
  ('oats',            'grams',     ARRAY['rolled oats','porridge oats'],  NULL, NULL, 'pantry', 365),
  ('stock cubes',     'pieces',    ARRAY['bouillon cube','stock cube','broth cube'], NULL, NULL, 'pantry', 730),
  ('tomato paste',    'grams',     ARRAY['tomato puree','tomato concentrate'], NULL, NULL, 'pantry', 365),

  -- ---- Dried herbs & spices (usually measured in spoons, stored in grams) ---
  ('paprika',         'grams', ARRAY['smoked paprika','sweet paprika'], NULL, NULL, 'spice', 730),
  ('cumin',           'grams', ARRAY['ground cumin','cumin seeds'],     NULL, NULL, 'spice', 730),
  ('oregano',         'grams', ARRAY['dried oregano'],                  NULL, NULL, 'spice', 730),
  ('basil',           'grams', ARRAY['dried basil','fresh basil'],      NULL, NULL, 'spice', 730),
  ('thyme',           'grams', ARRAY['dried thyme','fresh thyme'],      NULL, NULL, 'spice', 730),
  ('chili powder',    'grams', ARRAY['chilli powder','cayenne'],        NULL, NULL, 'spice', 730),
  ('cinnamon',        'grams', ARRAY['ground cinnamon'],                NULL, NULL, 'spice', 730),
  ('curry powder',    'grams', ARRAY['madras curry powder'],            NULL, NULL, 'spice', 730),
  ('parsley',         'grams', ARRAY['fresh parsley','dried parsley','flat-leaf parsley'], NULL, NULL, 'spice', 7)
) AS v(name, unit, aliases, sub_unit, sub_per_unit, category, shelf_life)
WHERE EXISTS (SELECT 1 FROM public.measurement_types WHERE name = v.unit)
ON CONFLICT (name) DO NOTHING;

COMMIT;

-- =============================================================================
-- Verification
-- =============================================================================
-- Row count and a look at the sub-unit entries that drive conversion:
--   SELECT count(*) FROM public.ingredient_standards;
--   SELECT s.name, m.name AS unit, s.sub_unit, s.sub_units_per_unit
--     FROM public.ingredient_standards s
--     JOIN public.measurement_types m ON m.id = s.measurement_type_id
--    WHERE s.sub_unit IS NOT NULL ORDER BY s.name;
--
-- Anything that failed to resolve a unit (expect 0 rows):
--   SELECT name FROM public.ingredient_standards WHERE measurement_type_id IS NULL;
--
-- Which of your current fridge items are not yet standardised:
--   SELECT DISTINCT f.name FROM public.fridge_items f
--    WHERE lower(f.name) NOT IN (SELECT name FROM public.ingredient_standards)
--      AND NOT EXISTS (SELECT 1 FROM public.ingredient_standards s
--                       WHERE lower(f.name) = ANY (s.aliases));
