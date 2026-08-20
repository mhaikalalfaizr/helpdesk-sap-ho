import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(cookiesToSet) {
            try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch (error) {
              console.error('Gagal mengatur cookie email:', error);
            }
          },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Akses Ditolak: Sesi tidak valid' }, { status: 401 });
    }

    const { ticketNumber, status, notes, targetRole, recipientEmail: overrideEmail, recipientName: overrideName, title: overrideTitle } = await request.json();

    const { data: ticket, error: ticketError } = await supabase
      .from('requests')
      .select('id, request_title, user_id, profiles:user_id(email, full_name), current_pic_id')
      .eq('ticket_number', ticketNumber)
      .single();

    if (ticketError || !ticket) {
      return NextResponse.json({ error: 'Akses Ditolak: Tiket tidak valid atau tidak diizinkan.' }, { status: 403 });
    }

    let finalEmail = overrideEmail;
    let finalName = overrideName;

    if (!finalEmail) {
      let targetUserId = ticket.user_id;
      if (targetRole === 'pic' && ticket.current_pic_id) {
        targetUserId = ticket.current_pic_id;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('email, full_name')
        .eq('id', targetUserId)
        .single();

      finalEmail = profile?.email;
      finalName = profile?.full_name || 'Pengaju';
    }

    const title = ticket.request_title;

    if (!finalEmail || !ticketNumber || !title || !status) {
      return NextResponse.json(
        { error: 'Data tiket tidak lengkap di database. Pastikan profil target memiliki email.' },
        { status: 400 }
      );
    }

    const emailHtml = `
      <div style="font-family: sans-serif; padding: 20px; color: #334155; max-width: 600px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #0e422a;">Helpdesk SAP HO Notification</h2>
        <p>Halo <strong>${finalName}</strong>,</p>
        <p>Terdapat pembaruan status penting terkait pelacakan dokumen di sistem helpdesk:</p>

        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr style="background-color: #f8fafc;">
            <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold;">No. Tiket</td>
            <td style="padding: 10px; border: 1px solid #e2e8f0; color: #0e422a; font-weight: bold;">${ticketNumber}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold;">Judul Permohonan</td>
            <td style="padding: 10px; border: 1px solid #e2e8f0;">${ticket.request_title}</td>
          </tr>
          <tr style="background-color: #f8fafc;">
            <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold;">Status Terbaru</td>
            <td style="padding: 10px; border: 1px solid #e2e8f0;"><span style="background-color: #ecfdf3; color: #0e422a; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold;">${status}</span></td>
          </tr>
          ${notes ? `
          <tr>
            <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold;">Keterangan/Catatan</td>
            <td style="padding: 10px; border: 1px solid #e2e8f0; font-style: italic;">"${notes}"</td>
          </tr>` : ''}
        </table>

        <p style="font-size: 13px; color: #64748b;">Silakan akses halaman Helpdesk untuk meninjau riwayat dokumen Anda lebih lanjut.</p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin-top: 30px;" />
        <p style="font-size: 11px; color: #94a3b8; text-align: center;">Pesan otomatis dari Sistem Helpdesk SAP HO. Harap tidak membalas email ini.</p>
      </div>
    `;

    const { data, error } = await resend.emails.send({
      from: 'Helpdesk SAP HO <no-reply@sap-ho.my.id>',
      to: finalEmail,
      subject: `[SAP HO] Pembaruan Status Tiket ${ticketNumber} - ${status}`,
      html: emailHtml,
    });

    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Terjadi kesalahan sistem' }, { status: 500 });
  }
}
