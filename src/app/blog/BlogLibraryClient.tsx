"use client";

import { useMemo, useState } from 'react';
import type { BlogArticle, BlogGenre } from '../../lib/blog';

type SortKey = 'newest' | 'title_asc' | 'title_desc' | 'source';

function ExternalIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M14 3h7v7M10 14L21 3M21 14v7h-7M3 10V3h7M3 21l7-7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function articleMatchesSearch(article: BlogArticle, query: string): boolean {
  if (!query) return true;
  const haystack = [
    article.title,
    article.excerpt ?? '',
    article.source_name ?? '',
    ...article.genres.map((g) => g.name)
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

function sortArticles(articles: BlogArticle[], sortKey: SortKey): BlogArticle[] {
  const sorted = [...articles];
  switch (sortKey) {
    case 'title_asc':
      return sorted.sort((a, b) => a.title.localeCompare(b.title));
    case 'title_desc':
      return sorted.sort((a, b) => b.title.localeCompare(a.title));
    case 'source':
      return sorted.sort((a, b) =>
        (a.source_name ?? '').localeCompare(b.source_name ?? '')
      );
    case 'newest':
    default:
      return sorted.sort((a, b) => {
        const da = a.published_at ? new Date(a.published_at).getTime() : 0;
        const db = b.published_at ? new Date(b.published_at).getTime() : 0;
        return db - da;
      });
  }
}

export default function BlogLibraryClient({
  articles,
  genres
}: {
  articles: BlogArticle[];
  genres: BlogGenre[];
}) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('newest');
  const [genreFilter, setGenreFilter] = useState<number | 'all'>('all');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = articles.filter((a) => articleMatchesSearch(a, q));
    if (genreFilter !== 'all') {
      list = list.filter((a) => a.genres.some((g) => g.id === genreFilter));
    }
    return sortArticles(list, sortKey);
  }, [articles, search, sortKey, genreFilter]);

  return (
    <div className="app-page blog-library">
      <h1 className="page-title">Articles &amp; insights</h1>
      <p className="page-lead">
        Curated reads on food waste, sustainable cooking, and kitchen habits — verified
        links that open on the original publisher&apos;s site.
      </p>

      <div className="app-toolbar blog-library-toolbar">
        <div className="app-field app-field--inline blog-library-search">
          <label className="app-label" htmlFor="blog-search">
            Search
          </label>
          <input
            id="blog-search"
            type="search"
            placeholder="Title, topic, or source…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="app-field app-field--inline">
          <label className="app-label" htmlFor="blog-sort">
            Sort by
          </label>
          <select
            id="blog-sort"
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
          >
            <option value="newest">Newest first</option>
            <option value="title_asc">Title A–Z</option>
            <option value="title_desc">Title Z–A</option>
            <option value="source">Source</option>
          </select>
        </div>
        <div className="app-field app-field--inline">
          <label className="app-label" htmlFor="blog-genre">
            Genre
          </label>
          <select
            id="blog-genre"
            value={genreFilter === 'all' ? 'all' : String(genreFilter)}
            onChange={(e) => {
              const val = e.target.value;
              setGenreFilter(val === 'all' ? 'all' : parseInt(val, 10));
            }}
          >
            <option value="all">All genres</option>
            {genres.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {genres.length > 0 && (
        <div className="blog-genre-chips" role="group" aria-label="Filter by genre">
          <button
            type="button"
            className={`app-chip${genreFilter === 'all' ? ' active' : ''}`}
            onClick={() => setGenreFilter('all')}
          >
            All
          </button>
          {genres.map((g) => (
            <button
              key={g.id}
              type="button"
              className={`app-chip${genreFilter === g.id ? ' active' : ''}`}
              onClick={() => setGenreFilter(g.id)}
            >
              {g.name}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="app-empty">
          {articles.length === 0
            ? 'No articles yet. Run scripts/blog-articles.sql in Supabase to seed the library.'
            : 'No articles match your search or filters.'}
        </p>
      ) : (
        <ul className="blog-link-list">
          {filtered.map((article) => (
            <li key={article.id}>
              <a
                href={article.external_url}
                className="blog-link-card"
                target="_blank"
                rel="noopener noreferrer"
              >
                <div className="blog-link-card-image-wrap">
                  {article.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={article.image_url}
                      alt=""
                      className="blog-link-card-image"
                      loading="lazy"
                    />
                  ) : (
                    <div className="blog-link-card-image blog-link-card-image--placeholder" />
                  )}
                </div>
                <div className="blog-link-card-body">
                  <div className="blog-link-card-top">
                    <h2 className="blog-link-card-title">{article.title}</h2>
                    <span className="blog-link-card-external" aria-hidden="true">
                      <ExternalIcon />
                    </span>
                  </div>
                  {article.excerpt && (
                    <p className="blog-link-card-excerpt">{article.excerpt}</p>
                  )}
                  <div className="blog-link-card-meta">
                    {article.source_name && (
                      <span className="blog-link-card-source">{article.source_name}</span>
                    )}
                    {article.genres.length > 0 && (
                      <span className="blog-link-card-genres">
                        {article.genres.map((g) => (
                          <span key={g.id} className="blog-link-genre-tag">
                            {g.name}
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}

      <p className="blog-library-footnote text-muted text-sm">
        {filtered.length} of {articles.length} article{articles.length === 1 ? '' : 's'}
        {search || genreFilter !== 'all' ? ' shown' : ''}
      </p>
    </div>
  );
}
