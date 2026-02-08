-- Seed fridge items for a specific user by email. Replace
-- <YOUR_EMAIL_HERE> with the actual email of your Supabase user.
-- This script inserts a variety of common ingredients into the
-- fridge_items table. It looks up the user_id via the auth.users
-- table and uses measurement_type_id values from measurement_types.

-- NOTE: run this script in the Supabase SQL editor after replacing
-- <YOUR_EMAIL_HERE> with your email. Duplicate inserts are fine
-- because fridge_items has an auto-incrementing primary key. You
-- may adjust quantities and expiration dates as desired.

WITH u AS (
  SELECT id FROM auth.users WHERE email = '<YOUR_EMAIL_HERE>'
), mt AS (
  SELECT name, id FROM public.measurement_types
)
INSERT INTO public.fridge_items (user_id, name, quantity, measurement_type_id, expiration_date)
SELECT
  u.id,
  items.name,
  items.quantity,
  (SELECT id FROM mt WHERE mt.name = items.unit LIMIT 1),
  items.expires
FROM u,
  (
    VALUES
      ('eggs', 12::numeric, 'units', NULL::date),
      ('milk', 2, 'liters', NULL),
      ('potatoes', 3, 'kilograms', NULL),
      ('butter', 250, 'grams', NULL),
      ('flour', 1, 'kilograms', NULL),
      ('sugar', 500, 'grams', NULL),
      ('salt', 200, 'grams', NULL),
      ('olive oil', 500, 'ml', NULL),
      ('rice', 1, 'kilograms', NULL),
      ('pasta', 500, 'grams', NULL),
      ('tomatoes', 6, 'pieces', NULL),
      ('onions', 4, 'pieces', NULL),
      ('garlic', 3, 'pieces', NULL),
      ('carrots', 5, 'pieces', NULL),
      ('broccoli', 2, 'pieces', NULL),
      ('chicken breast', 2, 'pieces', NULL),
      ('ground beef', 500, 'grams', NULL),
      ('tofu', 400, 'grams', NULL),
      ('cheddar cheese', 300, 'grams', NULL),
      ('parmesan', 200, 'grams', NULL),
      ('bell peppers', 3, 'pieces', NULL),
      ('spinach', 200, 'grams', NULL),
      ('mushrooms', 250, 'grams', NULL),
      ('canned beans', 2, 'pieces', NULL),
      ('canned tomatoes', 2, 'pieces', NULL),
      ('yogurt', 500, 'grams', NULL),
      ('cream', 200, 'ml', NULL),
      ('feta cheese', 150, 'grams', NULL),
      ('avocado', 2, 'pieces', NULL),
      ('lemons', 4, 'pieces', NULL)
  ) AS items(name, quantity, unit, expires);