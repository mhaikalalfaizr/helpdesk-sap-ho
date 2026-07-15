import { Modal, Text, Textarea, Stack, Group, Button } from '@mantine/core';

interface RejectModalProps {
  opened: boolean;
  onClose: () => void;
  ticketNumber?: string;
  rejectReason: string;
  onReasonChange: (val: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  isRejecting: boolean;
}

export default function RejectModal({
  opened,
  onClose,
  ticketNumber,
  rejectReason,
  onReasonChange,
  onSubmit,
  isRejecting
}: RejectModalProps) {

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={<Text fw={700}>Konfirmasi Penolakan Dokumen</Text>}
      centered
      radius="lg"
    >
      <form onSubmit={onSubmit}>
        <Stack gap="md">
          <Text size="sm" c="slateClean.7">
            Anda akan menolak permanen dokumen <b style={{ color: '#e53e3e' }}>{ticketNumber}</b>. Tindakan ini tidak dapat dibatalkan.
          </Text>

          <Textarea
            label="Alasan/Keterangan Penolakan"
            placeholder="Berikan keterangan yang jelas (misal: Format dokumen awal tidak valid...)"
            required
            rows={4}
            value={rejectReason}
            onChange={(e) => onReasonChange(e.target.value)}
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
