// src/config/api.ts
/**
 * API Configuration
 *
 * In development: API routes are served by Next.js dev server (relative paths work)
 * In production (Swarm): Frontend is static, so API calls must go to the full server URL
 */

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'https://gateway.woco-net.com';

/**
 * Helper to build API URLs
 * Usage: apiUrl('/api/profile')
 */
export function apiUrl(path: string): string {
  // Remove leading slash if present to avoid double slashes
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${cleanPath}`;
}
