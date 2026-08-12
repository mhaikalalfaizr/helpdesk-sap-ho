import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();

    const supabaseSession = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
            } catch (error) {
              console.error('Gagal mengatur cookie (toggle-user):', error);
            }
          },
        },
      }
    );

    const { data: { user: callerUser } } = await supabaseSession.auth.getUser();

    if (!callerUser) {
      return NextResponse.json(
        { error: 'Akses Ditolak: Sesi tidak valid.' },
        { status: 401 }
      );
    }

    const { data: callerProfile } = await supabaseSession
      .from('profiles')
      .select('role')
      .eq('id', callerUser.id)
      .maybeSingle();

    if (!callerProfile || callerProfile.role !== 'Koordinator') {
      return NextResponse.json(
        { error: 'Akses Ditolak: Hanya Koordinator yang dapat melakukan ini.' },
        { status: 403 }
      );
    }

    const { targetUserId, is_active } = await request.json();

    if (!targetUserId || typeof is_active !== 'boolean') {
      return NextResponse.json(
        { error: 'targetUserId dan is_active wajib diisi.' },
        { status: 400 }
      );
    }

    if (targetUserId === callerUser.id) {
      return NextResponse.json(
        { error: 'Anda tidak dapat mengubah status akun Anda sendiri.' },
        { status: 400 }
      );
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
      targetUserId,
      { ban_duration: is_active ? 'none' : '876600h' }
    );

    if (authError) {
      return NextResponse.json(
        { error: `Gagal memperbarui status Auth: ${authError.message}` },
        { status: 500 }
      );
    }

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ is_active })
      .eq('id', targetUserId);

    if (profileError) {
      return NextResponse.json(
        { error: `Auth berhasil diperbarui tetapi profil gagal diperbarui: ${profileError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, is_active },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Error fatal di /api/admin/toggle-user:', error);

    return NextResponse.json(
      { error: error?.message || 'Terjadi kesalahan internal server.' },
      { status: 500 }
    );
  }
}