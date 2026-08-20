import React, { useState, useEffect } from 'react';
import { Modal, Stack, TextInput, Textarea, Box, Text, Button } from '@mantine/core';
import { notifications } from '@mantine/notifications';

interface EmailModalProps {
  opened: boolean;
  onClose: () => void;
  ticket: any | null;
  currentUserName: string;
  currentUserEmail: string;
}

export default function EmailModal({ opened, onClose, ticket, currentUserName, currentUserEmail }: EmailModalProps) {
  const [consultantEmailInput, setConsultantEmailInput] = useState('');
  const [emailContent, setEmailContent] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  useEffect(() => {
    if (opened && ticket) {
      setConsultantEmailInput('');
      const template =
        `Yth. Tim Konsultan,

        Bersama ini kami sampaikan bahwa pengajuan berikut telah disetujui dan dokumen final terlampir:

        Nomor Tiket : ${ticket.ticket_number}
        Judul       : ${ticket.request_title}
        Unit Kerja  : ${ticket.profiles?.work_unit || '-'}
        Kategori    : ${ticket.categories?.name || '-'}

        Mohon diterima dan diarsipkan. Terima kasih.

        Salam,
        ${currentUserName}
        Tim Helpdesk SAP HO`;

      setEmailContent(template);
    }
  }, [opened, ticket, currentUserName]);

  const handleSendEmailToKonsultan = async () => {
    if (!ticket) return;

    if (!consultantEmailInput.trim()) {
      notifications.show({ title: 'Email Belum Diisi', message: 'Masukkan alamat email konsultan terlebih dahulu.', color: 'orange' });
      return;
    }

    setIsSendingEmail(true);
    try {
      const targetDoc = ticket.attachments && ticket.attachments.length > 0
        ? ticket.attachments[ticket.attachments.length - 1]
        : null;

      let filePath = '';
      if (targetDoc?.file_url) {
        const pathSegments = targetDoc.file_url.split('/documents/');
        filePath = pathSegments.length > 1 ? pathSegments[1].split('?')[0] : '';
      }

      const response = await fetch('/api/send-email-konsultan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketNumber: ticket.ticket_number,
          emailBody: emailContent,
          consultantEmail: consultantEmailInput.trim(),
          replyToEmail: currentUserEmail,
          filePath: filePath,
          fileName: targetDoc?.file_name,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Gagal mengirim email');
      }

      notifications.show({ title: 'Berhasil', message: `Email tiket nomor ${ticket.ticket_number} berhasil dikirim ke konsultan.`, color: 'green' });
      onClose();
      setConsultantEmailInput('');

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Terjadi kesalahan.';
      notifications.show({ title: 'Gagal Mengirim Email', message: message, color: 'red' });
    } finally {
      setIsSendingEmail(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title={<Text fw={700} size="md">Eskalasi ke Konsultan</Text>} size="lg" centered radius="lg">
      <Stack gap="md">
        <TextInput label="Email Konsultan" placeholder="konsultan@email.com" value={consultantEmailInput} onChange={(e) => setConsultantEmailInput(e.currentTarget.value)} required radius="md" />
        <Textarea label="Isi Email" value={emailContent} onChange={(e) => setEmailContent(e.currentTarget.value)} minRows={10} autosize radius="md" />
        <Box p="sm" bg="slateClean.0" style={{ borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
          <Text size="xs" fw={600} c="dimmed" mb={2}>📎 LAMPIRAN</Text>
          <Text size="sm" fw={600} c="ptpn4Green.9">
            {ticket?.attachments && ticket.attachments.length > 0 ? ticket.attachments[ticket.attachments.length - 1]?.file_name : 'Tidak ada dokumen yang akan dilampirkan'}
          </Text>
        </Box>
        <Button onClick={handleSendEmailToKonsultan} loading={isSendingEmail} color="ptpn4Green.9" fullWidth radius="md">
          Kirim Email ke Konsultan
        </Button>
      </Stack>
    </Modal>
  );
}
