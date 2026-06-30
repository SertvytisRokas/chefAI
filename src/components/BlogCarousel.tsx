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

function chunkPosts(posts: BlogPost[], perPage: number): BlogPost[][] {
  const pages: BlogPost[][] = [];
  for (let i = 0; i < posts.length; i += perPage) {
    pages.push(posts.slice(i, i + perPage));
  }
  return pages;
}

export default function BlogCarousel({ posts }: { posts: BlogPost[] }) {
  const pages = chunkPosts(posts, PER_PAGE);
  const pageCount = pages.length;
  const [page, setPage] = useState(0);
  const [paused, setPaused] = useState(false);

  const goPrev = () => setPage((p) => (p <= 0 ? pageCount - 1 : p - 1));
  const goNext = () => setPage((p) => (p >= pageCount - 1 ? 0 : p + 1));
  const goTo = (i: number) => setPage(i);

  useEffect(() => {
    if (paused || pageCount <= 1) return;
    const id = setInterval(() => {
      setPage((p) => (p >= pageCount - 1 ? 0 : p + 1));
    }, AUTO_MS);
    return () => clearInterval(id);
  }, [paused, pageCount, page]);

  return (
    <div
      className="blog-carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="blog-carousel-viewport">
        <button
          type="button"
          className="blog-carousel-arrow blog-carousel-arrow--prev"
          onClick={goPrev}
          disabled={pageCount <= 1}
          aria-label="Previous articles"
        >
          <ChevronLeft />
        </button>

        <div className="blog-carousel-window">
          <div
            className="blog-carousel-track"
            style={{
              transform: `translateX(calc(-${page} * (100cqw + var(--blog-carousel-gap))))`,
            }}
          >
            {pages.map((slidePosts, slideIdx) => (
              <div key={slideIdx} className="blog-carousel-slide">
                {slidePosts.map((post) => (
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
            ))}
          </div>
        </div>

        <button
          type="button"
          className="blog-carousel-arrow blog-carousel-arrow--next"
          onClick={goNext}
          disabled={pageCount <= 1}
          aria-label="Next articles"
        >
          <ChevronRight />
        </button>
      </div>

      {pageCount > 1 && (
        <div className="blog-carousel-dots" role="tablist" aria-label="Article pages">
          {pages.map((_, i) => (
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
