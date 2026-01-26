/**
 * StaticLink - A Link component for static export deployments (eth.limo/Swarm)
 *
 * Uses regular <a> tags instead of Next.js <Link> to avoid RSC navigation
 * which doesn't work on static hosting (eth.limo sends Clear-Site-Data headers
 * when RSC fetches fail, causing navigation issues).
 */
"use client";

import { ReactNode, AnchorHTMLAttributes } from "react";

interface StaticLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  children: ReactNode;
}

export default function StaticLink({ href, children, ...props }: StaticLinkProps) {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

  // Normalize href: add trailing slash for internal paths (required for static export)
  // For query params, add slash before the '?' (e.g., /forum?x=1 → /forum/?x=1)
  let normalizedHref = href;
  if (href.startsWith('/')) {
    if (href.includes('?')) {
      // Has query params - ensure trailing slash before '?'
      const [path, query] = href.split('?');
      const normalizedPath = path.endsWith('/') ? path : `${path}/`;
      normalizedHref = `${normalizedPath}?${query}`;
    } else if (!href.endsWith('/')) {
      // No query params, no trailing slash - add it
      normalizedHref = `${href}/`;
    }
  }

  const fullHref = normalizedHref.startsWith('/') ? `${basePath}${normalizedHref}` : normalizedHref;

  return (
    <a href={fullHref} {...props}>
      {children}
    </a>
  );
}
