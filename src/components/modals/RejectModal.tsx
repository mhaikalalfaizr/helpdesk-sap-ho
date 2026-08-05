import { useState, useEffect } from 'react';
import { Modal, Text, Textarea, Stack, Group, Button } from '@mantine/core';

interface RejectModalProps {
  opened: boolean;
  onClose: () => void;
  ticketNumber?: string;
  onSubmit: (reason: string) => Promise<void>;
}

export default function RejectModal({ opened, onClose, ticketNumber, onSubmit }: RejectModalProps){
  const [rejectReason, setRejectReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);

  useEffect(() => {
    if (opened) {
      setRejectReason('');
    }
  }, [opened]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectReason.trim()) return;

    setIsRejecting(true);
    try {
      await onSubmit(rejectReason);
      setRejectReason('');
      onClose();
    } catch (error) {
      console.error(error);
    } finally {
      setIsRejecting(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title={<Text fw={700}>Konfirmasi Penolakan Dokumen</Text>} centered radius="lg">
      <form onSubmit={handleSubmit}>
        <Stack gap="md">
          <Text size="sm" c="slateClean.7">
            Anda akan menolak pengajuan nomor <b style={{ color: '#e53e3e' }}>{ticketNumber}</b>. Tindakan ini tidak dapat dibatalkan.
          </Text>

          <Textarea
            label="Alasan/Keterangan Penolakan"
            placeholder="Berikan keterangan yang jelas (misal: Format dokumen awal tidak valid...)"
            required
            rows={4}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            radius="md"
          />

          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={onClose} radius="md">Batal</Button>
            <Button type="submit" color="red.8" loading={isRejecting} radius="md">Tolak</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
