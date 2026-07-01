import { fetchBlogArticles, fetchBlogGenres } from '../../lib/blog';
import BlogLibraryClient from './BlogLibraryClient';

/**
 * Public blog library — curated external article links.
 * No login required; side nav appears only when signed in (AppShell).
 */
export default async function BlogPage() {
  const [articles, genres] = await Promise.all([
    fetchBlogArticles(),
    fetchBlogGenres()
  ]);

  return <BlogLibraryClient articles={articles} genres={genres} />;
}
