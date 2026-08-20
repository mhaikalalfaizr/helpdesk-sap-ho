import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';

export async function POST(request: Request) {

  try {
    const cookieStore = await cookies();
    const supabaseAuth = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll() { },
        },
      }
    );

    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Akses Ditolak: Sesi tidak valid.' }, { status: 401 });
    }

    let body;

    try {
      body = await request.json();
    } catch (err) {
      return NextResponse.json(
        { error: 'Format request tidak valid.' },
        { status: 400 }
      );
    }

    const { ticketNumber, subject, emailBody, consultantTo, consultantCc, attachmentsData } = body;

    const { data: ticket, error: ticketError } = await supabaseAuth
      .from('requests')
      .select('*')
      .eq('ticket_number', ticketNumber)
      .single();

    if (ticketError || !ticket) {
      return NextResponse.json({ error: 'Tiket tidak ditemukan / Akses ditolak' }, { status: 403 });
    }

    if (!ticketNumber || !emailBody || !consultantTo) {
      return NextResponse.json(
        { error: 'Data tidak lengkap. Pastikan nomor tiket, body email, dan email konsultan terisi.' },
        { status: 400 }
      );
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });

    const attachments: { filename: string; content: Buffer }[] = [];

    if (attachmentsData && Array.isArray(attachmentsData)) {
      for (const att of attachmentsData) {
        const { data: fileData, error: downloadError } = await supabaseAuth.storage
          .from('documents')
          .download(att.filePath);

        if (!downloadError && fileData) {
          const buffer = Buffer.from(await fileData.arrayBuffer());
          attachments.push({
            filename: att.fileName || 'Dokumen_Final.pdf',
            content: buffer,
          });
        }
      }
    }

    await transporter.sendMail({
      from: `"Helpdesk SAP HO" <${process.env.GMAIL_USER}>`,
      to: consultantTo,
      cc: consultantCc && consultantCc.length > 0 ? consultantCc.join(', ') : undefined,
      subject: subject || `[SAP HO] Eskalasi Tiket: ${ticketNumber}`,
      text: emailBody,
      attachments,
    });

    return NextResponse.json({ success: true });

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Terjadi kesalahan pada sistem.';
    console.error('Gagal mengirim email ke konsultan:', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
