"use client";

import { useState } from 'react';

export type BlogPost = {
  slug: string;
  title: string;
  excerpt: string;
  hue: number;
};

const PER_PAGE = 3;

export default function BlogCarousel({ posts }: { posts: BlogPost[] }) {
  const pageCount = Math.ceil(posts.length / PER_PAGE);
  const [page, setPage] = useState(0);

  const visible = posts.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);

  return (
    <div className="blog-carousel">
      <div className="blog-carousel-row">
        {visible.map((post) => (
          <a
            key={post.slug}
            href={`/blog/${post.slug}`}
            className="blog-card"
          >
            <div
              className="blog-card-image"
              style={{
                background: `linear-gradient(135deg, hsl(${post.hue} 35% 22%) 0%, hsl(${post.hue} 25% 12%) 100%)`,
              }}
            />
            <div className="blog-card-body">
              <h3 className="blog-card-title">{post.title}</h3>
              <p className="blog-card-excerpt">{post.excerpt}</p>
            </div>
          </a>
        ))}
      </div>

      <div className="blog-carousel-controls">
        <button
          type="button"
          className="blog-carousel-btn"
          onClick={() => setPage((p) => p - 1)}
          disabled={page === 0}
          aria-label="Previous articles"
        >
          ‹
        </button>
        <div className="blog-carousel-dots" role="tablist" aria-label="Article pages">
          {Array.from({ length: pageCount }, (_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === page}
              aria-label={`Page ${i + 1}`}
              className={`blog-carousel-dot${i === page ? ' active' : ''}`}
              onClick={() => setPage(i)}
            />
          ))}
        </div>
        <button
          type="button"
          className="blog-carousel-btn"
          onClick={() => setPage((p) => p + 1)}
          disabled={page >= pageCount - 1}
          aria-label="Next articles"
        >
          ›
        </button>
      </div>
    </div>
  );
}
