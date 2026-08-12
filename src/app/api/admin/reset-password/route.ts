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
                            console.error('Gagal mengatur cookie (reset-password):', error);
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
                { error: 'Akses Ditolak: Hanya Koordinator.' },
                { status: 403 }
            );
        }

        const { targetUserId, newPassword } = await request.json();

        if (!targetUserId || !newPassword) {
            return NextResponse.json(
                { error: 'targetUserId dan newPassword wajib diisi.' },
                { status: 400 }
            );
        }

        if (newPassword.length < 8) {
            return NextResponse.json(
                { error: 'Password baru minimal 8 karakter.' },
                { status: 400 }
            );
        }

        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            { auth: { autoRefreshToken: false, persistSession: false } }
        );

        const { error } = await supabaseAdmin.auth.admin.updateUserById(
            targetUserId,
            { password: newPassword }
        );

        if (error) {
            return NextResponse.json(
                { error: error.message },
                { status: 500 }
            );
        }

        return NextResponse.json(
            { success: true },
            { status: 200 }
        );
    } catch (error: any) {
        console.error('Error fatal di /api/admin/reset-password:', error);

        return NextResponse.json(
            { error: error?.message || 'Internal server error.' },
            { status: 500 }
        );
    }
}