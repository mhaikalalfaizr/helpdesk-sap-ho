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
              console.error('Gagal mengatur cookie (create-user):', error);
            }
          },
        },
      }
    );

    const { data: { user: callerUser } } = await supabaseSession.auth.getUser();

    if (!callerUser) {
      return NextResponse.json({ error: 'Akses Ditolak: Sesi tidak valid.' }, { status: 401 });
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

    const {
      full_name,
      email,
      password,
      division,
      unit_kerja,
      role,
    } = await request.json();

    if (!full_name || !email || !password || !unit_kerja || !role) {
      return NextResponse.json(
        { error: 'Nama, email, password, unit kerja, dan role wajib diisi.' },
        { status: 400 }
      );
    }

    const validRoles = ['Koordinator', 'Staf', 'Pengaju'];

    if (!validRoles.includes(role)) {
      return NextResponse.json(
        { error: `Role tidak valid. Gunakan salah satu dari: ${validRoles.join(', ')}` },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password minimal 8 karakter.' },
        { status: 400 }
      );
    }

    const cleanUnitKerja = String(unit_kerja).trim();

    const cleanDivision =
      cleanUnitKerja === 'Head Office'
        ? String(division || '').trim()
        : '-';

    if (!cleanUnitKerja) {
      return NextResponse.json(
        { error: 'Unit kerja wajib dipilih.' },
        { status: 400 }
      );
    }

    if (cleanUnitKerja === 'Head Office' && !cleanDivision) {
      return NextResponse.json(
        { error: 'Divisi wajib dipilih untuk user Head Office.' },
        { status: 400 }
      );
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: newAuthUser, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email: String(email).trim().toLowerCase(),
        password,
        email_confirm: true,
      });

    if (authError) {
      if (
        authError.message.includes('already registered') ||
        authError.message.includes('already been registered')
      ) {
        return NextResponse.json(
          { error: 'Email ini sudah terdaftar di sistem.' },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: `Gagal membuat akun Auth: ${authError.message}` },
        { status: 500 }
      );
    }

    if (!newAuthUser.user) {
      return NextResponse.json(
        { error: 'Gagal mendapatkan ID user baru dari Auth.' },
        { status: 500 }
      );
    }

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: newAuthUser.user.id,
        full_name: String(full_name).trim(),
        email: String(email).trim().toLowerCase(),
        unit_kerja: cleanUnitKerja,
        division: cleanDivision,
        role,
        is_active: true,
      });

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(newAuthUser.user.id);

      return NextResponse.json(
        {
          error: `Akun Auth berhasil dibuat tetapi profil gagal disimpan: ${profileError.message}. Akun telah di-rollback.`,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, userId: newAuthUser.user.id },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error fatal di /api/admin/create-user:', error);

    return NextResponse.json(
      { error: error?.message || 'Terjadi kesalahan internal server.' },
      { status: 500 }
    );
  }
}