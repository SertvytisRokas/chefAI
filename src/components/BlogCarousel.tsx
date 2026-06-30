"use client";

import { useEffect, useState } from 'react';

export type BlogPost = {
  slug: string;
  title: string;
  excerpt: string;
  hue: number;
};

const PER_PAGE = 3;
const AUTO_MS = 5000;

function ChevronLeft() {
  return (
    <svg width="28" height="52" viewBox="0 0 28 52" fill="none" aria-hidden="true">
      <path
        d="M22 4L6 26L22 48"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg width="28" height="52" viewBox="0 0 28 52" fill="none" aria-hidden="true">
      <path
        d="M6 4L22 26L6 48"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function BlogCarousel({ posts }: { posts: BlogPost[] }) {
  const pageCount = Math.ceil(posts.length / PER_PAGE);
  const [page, setPage] = useState(0);
  const [paused, setPaused] = useState(false);

  const visible = posts.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);

  const goPrev = () => setPage((p) => Math.max(0, p - 1));
  const goNext = () => setPage((p) => Math.min(pageCount - 1, p + 1));
  const goTo = (i: number) => setPage(i);

  useEffect(() => {
    if (paused || pageCount <= 1) return;
    const id = setInterval(() => {
      setPage((p) => (p >= pageCount - 1 ? 0 : p + 1));
    }, AUTO_MS);
    return () => clearInterval(id);
  }, [page, paused, pageCount]);

  return (
    <div
      className="blog-carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="blog-carousel-viewport">
        <button
          type="button"
          className="blog-carousel-arrow blog-carousel-arrow--prev"
          onClick={goPrev}
          disabled={page === 0}
          aria-label="Previous articles"
        >
          <ChevronLeft />
        </button>

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

        <button
          type="button"
          className="blog-carousel-arrow blog-carousel-arrow--next"
          onClick={goNext}
          disabled={page >= pageCount - 1}
          aria-label="Next articles"
        >
          <ChevronRight />
        </button>
      </div>

      {pageCount > 1 && (
        <div className="blog-carousel-dots" role="tablist" aria-label="Article pages">
          {Array.from({ length: pageCount }, (_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === page}
              aria-label={`Page ${i + 1}`}
              className={`blog-carousel-dot${i === page ? ' active' : ''}`}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
