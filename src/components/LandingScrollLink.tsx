'use client';

import { useRef, type ReactNode, type MouseEvent } from 'react';

const SCROLL_DURATION_MS = 1000;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function getScrollY(): number {
  return window.scrollY || document.documentElement.scrollTop;
}

function setScrollY(y: number): void {
  window.scrollTo(0, y);
}

/**
 * Smooth scroll via rAF — avoids inconsistent native `behavior: 'smooth'`.
 * Cancels any in-flight scroll when triggered again.
 */
function animateScrollTo(targetY: number, cancelRef: { current: (() => void) | null }): void {
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) {
    setScrollY(targetY);
    return;
  }

  cancelRef.current?.();
  cancelRef.current = null;

  const startY = getScrollY();
  const distance = targetY - startY;
  if (Math.abs(distance) < 1) return;

  let cancelled = false;
  cancelRef.current = () => {
    cancelled = true;
  };

  const startTime = performance.now();

  function tick(now: number) {
    if (cancelled) return;
    const progress = Math.min((now - startTime) / SCROLL_DURATION_MS, 1);
    setScrollY(startY + distance * easeInOutCubic(progress));
    if (progress < 1) {
      requestAnimationFrame(tick);
    } else {
      cancelRef.current = null;
    }
  }

  requestAnimationFrame(tick);
}

/**
 * In-page anchor scroll. Aligns the target section just below the sticky header.
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
  const cancelRef = useRef<(() => void) | null>(null);

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    if (!href.startsWith('#')) return;
    const id = href.slice(1);
    const target = document.getElementById(id);
    if (!target) return;

    e.preventDefault();
    const header = document.querySelector<HTMLElement>('.landing-header');
    const headerH = header?.offsetHeight ?? 0;
    const top = target.getBoundingClientRect().top + getScrollY() - headerH;
    animateScrollTo(top, cancelRef);
  }

  return (
    <a href={href} className={className} onClick={handleClick}>
      {children}
    </a>
  );
}
