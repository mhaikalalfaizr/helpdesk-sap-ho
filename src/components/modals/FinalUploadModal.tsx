import { useState, useEffect } from 'react';
import { Modal, Text, Stack, FileInput, Textarea, TextInput, Button, Group } from '@mantine/core';

interface FinalUploadModalProps {
  opened: boolean;
  onClose: () => void;
  ticket: any | null;
  currentUserName: string;
  defaultTo: string;
  defaultCc: string;
  onSubmit: (files: File[], emailSubject: string, emailBody: string, consultantTo: string, consultantCc: string[]) => Promise<void>;
}

export default function FinalUploadModal({ opened, onClose, ticket, currentUserName, defaultTo, defaultCc, onSubmit }: FinalUploadModalProps) {
  const [finalFiles, setFinalFiles] = useState<File[]>([]);
  const [uploadingFinal, setUploadingFinal] = useState(false);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBodyForFinal, setEmailBodyForFinal] = useState('');
  const [consultantTo, setConsultantTo] = useState('');
  const [consultantCc, setConsultantCc] = useState('');

  const catName = (ticket?.categories?.name || '').toLowerCase();
  const subCatName = (ticket?.sub_categories?.name || '').toLowerCase();
  const isAccessRequest = catName.includes('access') || subCatName.includes('access');
  const division = (ticket?.profiles?.division || '').toLowerCase();
  const workUnit = (ticket?.profiles?.work_unit || '').toLowerCase();
  const isHeadOffice = division.includes('head office') || workUnit.includes('head office') || division === 'ho' || workUnit === 'ho';

  const shouldSendEmail = isAccessRequest && isHeadOffice;

  useEffect(() => {
    if (opened && ticket) {
      setFinalFiles([]);
      setConsultantTo(defaultTo);
      setConsultantCc(defaultCc);
      setEmailSubject(`[SAP HO] Dokumen Final: ${ticket.ticket_number} - ${ticket.request_title}`);
      setEmailBodyForFinal(
`Yth. Tim Konsultan,

Bersama ini kami sampaikan bahwa pengajuan berikut telah disetujui dan dokumen final terlampir:

Nomor Tiket: ${ticket.ticket_number}
Judul: ${ticket.request_title}
Unit Kerja: ${ticket.profiles?.work_unit || '-'}
Kategori: ${ticket.categories?.name || '-'}

Mohon diterima dan diarsipkan. Terima kasih.

Salam,
${currentUserName}
Tim Helpdesk SAP HO`
      );
    }
  }, [opened, ticket, currentUserName, defaultTo, defaultCc]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (finalFiles.length === 0) return;

    setUploadingFinal(true);
    try {
      const ccArray = consultantCc ? consultantCc.split(',').map(e => e.trim()) : [];

      await onSubmit(finalFiles, emailSubject, emailBodyForFinal, consultantTo, ccArray);
      onClose();
    } catch (error) {
      console.error(error);
    } finally {
      setUploadingFinal(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title={<Text fw={700}>Setujui Tiket & Unggah Dokumen Final</Text>} size="xl" centered radius="lg">
      <form onSubmit={handleSubmit}>
        <Stack gap="md">
          <FileInput label="1. Pilih Dokumen Final (PDF / .docx / .xlsx)" placeholder="Klik untuk memilih berkas" multiple accept="application/pdf, application/vnd.openxmlformats-officedocument.wordprocessingml.document, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" value={finalFiles} onChange={setFinalFiles} required radius="md" />

        {shouldSendEmail && (
        <>
          <Text fw={600} size="sm" mt="md">2. Email kepada Konsultan</Text>
          <TextInput label="Email Tujuan (To)" placeholder="konsultan@domain.com" value={consultantTo} onChange={(e) => setConsultantTo(e.currentTarget.value)} required radius="md"/>
          <TextInput label="Email CC" placeholder="Gunakan koma untuk lebih dari 1 penerima (opsional)" value={consultantCc} onChange={(e) => setConsultantCc(e.currentTarget.value)} required radius="md" />
          <TextInput label="Subject Email" value={emailSubject} onChange={(e) => setEmailSubject(e.currentTarget.value)} required radius="md" />
          <Textarea label="Body Email" value={emailBodyForFinal} onChange={(e) => setEmailBodyForFinal(e.currentTarget.value)} minRows={8} autosize required radius="md" />
        </>
        )}

          <Group justify="flex-end" mt="xl">
            <Button variant="default" onClick={onClose} radius="md">Batal</Button>
            <Button type="submit" color="ptpn4Green.9" loading={uploadingFinal} disabled={finalFiles.length === 0} radius="md">Setujui & Selesaikan Tiket</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
