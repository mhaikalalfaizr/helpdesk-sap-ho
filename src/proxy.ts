import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;

  const isDashboardRoute = path.startsWith('/dashboard');
  const isAuthRoute = path === '/login' || path === '/register' || path === '/';

  if (isDashboardRoute && !user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const role = profile?.role;

    if (isAuthRoute) {
      if (role === 'Staf' || role === 'Koordinator') {
        return NextResponse.redirect(new URL('/dashboard/staf', request.url));
      } else {
        return NextResponse.redirect(new URL('/dashboard/pengajuan', request.url));
      }
    }

    if (path.startsWith('/dashboard/staf') && role === 'Pengaju') {
      return NextResponse.redirect(new URL('/dashboard/pengajuan', request.url));
    }

    if (path.startsWith('/dashboard/pengajuan') && (role === 'Staf' || role === 'Koordinator')) {
      return NextResponse.redirect(new URL('/dashboard/staf', request.url));
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
};
