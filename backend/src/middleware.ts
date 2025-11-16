// src/middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Handle CORS for API routes
  if (request.nextUrl.pathname.startsWith('/api')) {
    const origin = request.headers.get('origin') || '*';

    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      return new NextResponse(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, swarm-postage-batch-id, X-Subject-Address, x-posting-parent, x-posting-key, x-posting-kind, x-posting-auth',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // Add CORS headers to the response
    const response = NextResponse.next();
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, swarm-postage-batch-id, X-Subject-Address, x-posting-parent, x-posting-key, x-posting-kind, x-posting-auth');

    return response;
  }

  return NextResponse.next();
}

// Apply middleware to all /api routes
export const config = {
  matcher: '/api/:path*',
};
