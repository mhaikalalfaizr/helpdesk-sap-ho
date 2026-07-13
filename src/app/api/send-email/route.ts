import { NextResponse } from 'next/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.NEXT_PUBLIC_INTERNAL_API_KEY}`) {
      return NextResponse.json({ error: 'Akses Ditolak' }, { status: 401 });
    }

    const { ticketNumber, title, status, notes, recipientEmail, recipientName } = await request.json();

    if (!recipientEmail || !ticketNumber || !title || !status || !recipientName) {
      return NextResponse.json(
        { error: 'Data tidak lengkap. Pastikan email, nama, nomor tiket, judul, dan status terisi.' }, 
        { status: 400 }
      );
    }

    const emailHtml = `
      <div style="font-family: sans-serif; padding: 20px; color: #334155; max-width: 600px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #0e422a;">Helpdesk SAP HO Notification</h2>
        <p>Halo <strong>${recipientName}</strong>,</p>
        <p>Terdapat pembaruan status penting terkait pelacakan dokumen di sistem antrean pusat:</p>

        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr style="background-color: #f8fafc;">
            <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold;">No. Tiket</td>
            <td style="padding: 10px; border: 1px solid #e2e8f0; color: #0e422a; font-weight: bold;">${ticketNumber}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold;">Judul Permohonan</td>
            <td style="padding: 10px; border: 1px solid #e2e8f0;">${title}</td>
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
      to: recipientEmail,
      subject: `[SAP HO] Update Status Tiket ${ticketNumber} - ${status}`,
      html: emailHtml,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Terjadi kesalahan sistem, harap hubungi administrator.' }, { status: 500 });
  }
}

