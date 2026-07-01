import { supabaseServer } from './supabase/server';

export type BlogGenre = {
  id: number;
  name: string;
  slug: string;
  sort_order: number;
};

export type BlogArticle = {
  id: number;
  title: string;
  excerpt: string | null;
  external_url: string;
  image_url: string | null;
  source_name: string | null;
  published_at: string | null;
  featured: boolean;
  sort_order: number;
  genres: BlogGenre[];
};

type ArticleRow = {
  id: number;
  title: string;
  excerpt: string | null;
  external_url: string;
  image_url: string | null;
  source_name: string | null;
  published_at: string | null;
  featured: boolean;
  sort_order: number;
  blog_article_genres: { blog_genres: BlogGenre | BlogGenre[] | null }[] | null;
};

function normalizeGenre(raw: BlogGenre | BlogGenre[] | null): BlogGenre | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw;
}

function mapArticle(row: ArticleRow): BlogArticle {
  const genres = (row.blog_article_genres ?? [])
    .map((link) => normalizeGenre(link.blog_genres))
    .filter((g): g is BlogGenre => g != null)
    .sort((a, b) => a.sort_order - b.sort_order);

  return {
    id: row.id,
    title: row.title,
    excerpt: row.excerpt,
    external_url: row.external_url,
    image_url: row.image_url,
    source_name: row.source_name,
    published_at: row.published_at,
    featured: row.featured,
    sort_order: row.sort_order,
    genres
  };
}

const ARTICLE_SELECT = `
  id,
  title,
  excerpt,
  external_url,
  image_url,
  source_name,
  published_at,
  featured,
  sort_order,
  blog_article_genres (
    blog_genres (
      id,
      name,
      slug,
      sort_order
    )
  )
`;

/** Published, verified articles for the blog library and landing carousel. */
export async function fetchBlogArticles(options?: {
  limit?: number;
  featured?: boolean;
}): Promise<BlogArticle[]> {
  const supabase = await supabaseServer();
  let query = supabase
    .from('blog_articles')
    .select(ARTICLE_SELECT)
    .eq('is_published', true)
    .eq('verified', true)
    .order('published_at', { ascending: false, nullsFirst: false });

  if (options?.featured) {
    query = query.eq('featured', true);
  }
  if (options?.limit != null) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;
  if (error) {
    console.error('fetchBlogArticles:', error.message);
    return [];
  }

  return (data as unknown as ArticleRow[]).map(mapArticle);
}

export async function fetchBlogGenres(): Promise<BlogGenre[]> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from('blog_genres')
    .select('id, name, slug, sort_order')
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('fetchBlogGenres:', error.message);
    return [];
  }

  return data ?? [];
}
