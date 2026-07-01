-- Curated external articles (blog link library)
-- Run this in the Supabase SQL Editor on your existing project.
-- Safe to re-run: uses IF NOT EXISTS and ON CONFLICT for seeds.
--
-- Architecture note: Supabase free tier = one Postgres database. User data
-- (fridge_items, recipes, …) and shared content (recipe_templates, blog_articles)
-- live in the same DB with Row Level Security — not separate databases.

-- ── Genres (topics for filter) ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.blog_genres (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- ── Curated external article links ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.blog_articles (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  excerpt TEXT,
  external_url TEXT NOT NULL,
  image_url TEXT,
  source_name TEXT,
  verified BOOLEAN NOT NULL DEFAULT false,
  is_published BOOLEAN NOT NULL DEFAULT false,
  featured BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS blog_articles_published_idx
  ON public.blog_articles (published_at DESC NULLS LAST)
  WHERE is_published = true AND verified = true;

-- ── Many-to-many: article ↔ genre ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.blog_article_genres (
  article_id BIGINT NOT NULL REFERENCES public.blog_articles(id) ON DELETE CASCADE,
  genre_id INTEGER NOT NULL REFERENCES public.blog_genres(id) ON DELETE CASCADE,
  PRIMARY KEY (article_id, genre_id)
);

-- ── Row Level Security (public read for published + verified) ───────────────

ALTER TABLE public.blog_genres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_article_genres ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read blog genres" ON public.blog_genres;
CREATE POLICY "Public read blog genres"
  ON public.blog_genres FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Public read published articles" ON public.blog_articles;
CREATE POLICY "Public read published articles"
  ON public.blog_articles FOR SELECT
  TO anon, authenticated
  USING (is_published = true AND verified = true);

DROP POLICY IF EXISTS "Public read article genres" ON public.blog_article_genres;
CREATE POLICY "Public read article genres"
  ON public.blog_article_genres FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.blog_articles a
      WHERE a.id = article_id
        AND a.is_published = true
        AND a.verified = true
    )
  );

-- Writes: service role / dashboard only (no in-app CMS yet).
-- Manage articles via Supabase Table Editor or SQL as admin.

-- ── Seed genres ─────────────────────────────────────────────────────────────

INSERT INTO public.blog_genres (name, slug, sort_order) VALUES
  ('Food waste', 'food-waste', 1),
  ('Sustainable cooking', 'sustainable-cooking', 2),
  ('Meal planning', 'meal-planning', 3),
  ('Kitchen tips', 'kitchen-tips', 4),
  ('Nutrition', 'nutrition', 5)
ON CONFLICT (slug) DO NOTHING;

-- ── Seed placeholder articles (replace URLs/images when you have real links) ─

INSERT INTO public.blog_articles (
  title, excerpt, external_url, image_url, source_name,
  verified, is_published, featured, sort_order, published_at
)
SELECT v.title, v.excerpt, v.external_url, v.image_url, v.source_name,
       v.verified, v.is_published, v.featured, v.sort_order, v.published_at
FROM (VALUES
  (
    'The scale of global food waste',
    'How much food is lost worldwide and why household action matters.',
    'https://example.com/articles/scale-of-global-food-waste',
    'https://picsum.photos/seed/chefai-food-waste/640/360',
    'Example Publisher',
    true, true, true, 1, timezone('utc', now()) - interval '5 days'
  ),
  (
    'Household habits that help',
    'Simple routines to use groceries before they spoil.',
    'https://example.com/articles/household-habits',
    'https://picsum.photos/seed/chefai-habits/640/360',
    'Example Publisher',
    true, true, true, 2, timezone('utc', now()) - interval '4 days'
  ),
  (
    'Why expiry dates matter',
    'Best-before vs use-by, and how to plan around them.',
    'https://example.com/articles/expiry-dates',
    'https://picsum.photos/seed/chefai-expiry/640/360',
    'Example Publisher',
    true, true, true, 3, timezone('utc', now()) - interval '3 days'
  ),
  (
    'Cooking from what you have',
    'Flexible recipes when you are missing an ingredient or two.',
    'https://example.com/articles/cook-from-fridge',
    'https://picsum.photos/seed/chefai-cook-have/640/360',
    'Example Publisher',
    true, true, true, 4, timezone('utc', now()) - interval '2 days'
  ),
  (
    'The cost of throwing away food',
    'What wasted groceries add up to over a year.',
    'https://example.com/articles/cost-of-waste',
    'https://picsum.photos/seed/chefai-cost/640/360',
    'Example Publisher',
    true, true, false, 5, timezone('utc', now()) - interval '1 day'
  ),
  (
    'Small changes, big impact',
    'Low-effort swaps that cut waste without changing your diet.',
    'https://example.com/articles/small-changes',
    'https://picsum.photos/seed/chefai-small-changes/640/360',
    'Example Publisher',
    true, true, false, 6, timezone('utc', now())
  )
) AS v(title, excerpt, external_url, image_url, source_name, verified, is_published, featured, sort_order, published_at)
WHERE NOT EXISTS (
  SELECT 1 FROM public.blog_articles existing WHERE existing.title = v.title
);

-- Link articles to genres (by title for idempotent seeding)
INSERT INTO public.blog_article_genres (article_id, genre_id)
SELECT a.id, g.id
FROM public.blog_articles a
CROSS JOIN public.blog_genres g
WHERE
  (a.title = 'The scale of global food waste' AND g.slug IN ('food-waste', 'sustainable-cooking'))
  OR (a.title = 'Household habits that help' AND g.slug IN ('food-waste', 'kitchen-tips'))
  OR (a.title = 'Why expiry dates matter' AND g.slug IN ('kitchen-tips', 'meal-planning'))
  OR (a.title = 'Cooking from what you have' AND g.slug IN ('sustainable-cooking', 'meal-planning'))
  OR (a.title = 'The cost of throwing away food' AND g.slug = 'food-waste')
  OR (a.title = 'Small changes, big impact' AND g.slug IN ('sustainable-cooking', 'kitchen-tips'))
ON CONFLICT DO NOTHING;
