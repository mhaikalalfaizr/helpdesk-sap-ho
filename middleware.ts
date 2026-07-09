import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const res = NextResponse.next();

  const supabaseAuthCookies = req.cookies.getAll().filter((c) => c.name.startsWith('sb-') && c.name.endsWith('-auth-token'));

  const isAuthenticated = supabaseAuthCookies.length > 0;

  if (req.nextUrl.pathname.startsWith('/dashboard') && !isAuthenticated) {
    const redirectUrl = new URL('/login', req.url);
    return NextResponse.redirect(redirectUrl);
  }

  if ((req.nextUrl.pathname === '/login' || req.nextUrl.pathname === '/') && isAuthenticated) {
    const redirectUrl = new URL('/dashboard/user', req.url);
    return NextResponse.redirect(redirectUrl);
  }

  return res;
}

export const config = {
  matcher: [

    '/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
};
