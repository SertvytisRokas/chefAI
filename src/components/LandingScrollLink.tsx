'use client';

import type { ReactNode, MouseEvent } from 'react';

const SCROLL_DURATION_MS = 700;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function smoothScrollTo(targetY: number, duration = SCROLL_DURATION_MS): void {
  const prefersReduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (prefersReduced) {
    window.scrollTo(0, targetY);
    return;
  }

  const startY = window.scrollY;
  const distance = targetY - startY;
  const startTime = performance.now();

  function step(now: number) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    window.scrollTo(0, startY + distance * easeOutCubic(progress));
    if (progress < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

/**
 * In-page anchor scroll that offsets for the sticky landing header.
 * Measures the header at click time so it works on every screen size.
 */
export default function LandingScrollLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    if (!href.startsWith('#')) return;
    const id = href.slice(1);
    const target = document.getElementById(id);
    if (!target) return;

    e.preventDefault();
    const header = document.querySelector<HTMLElement>('.landing-header');
    const headerH = header?.offsetHeight ?? 0;
    const top =
      target.getBoundingClientRect().top + window.scrollY - headerH;

    smoothScrollTo(top);
  }

  return (
    <a href={href} className={className} onClick={handleClick}>
      {children}
    </a>
  );
}
