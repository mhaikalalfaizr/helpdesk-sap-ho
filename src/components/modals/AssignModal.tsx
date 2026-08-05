import { useState, useEffect } from 'react';
import { Modal, Text, Stack, Select, Group, Button } from '@mantine/core';

interface AssignModalProps {
  opened: boolean;
  onClose: () => void;
  ticketNumber?: string;
  picList: { value: string; label: string; email: string }[];
  currentPicId?: string | null;
  onSubmit: (newPicId: string | null) => Promise<void>;
}

export default function AssignModal({ opened, onClose, ticketNumber, picList, currentPicId, onSubmit }: AssignModalProps) {
  const [selectedNewPicId, setSelectedNewPicId] = useState<string | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);

  useEffect(() => {
    if (opened) {
      setSelectedNewPicId(currentPicId || null);
    }
  }, [opened, currentPicId]);

  const handleSubmit = async () => {
    setIsAssigning(true);
    try {
      await onSubmit(selectedNewPicId);
      setSelectedNewPicId(null);
      onClose();
    } catch (error) {
      console.error(error);
    } finally {
      setIsAssigning(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title={<Text fw={700}>Alihkan Penugasan Tiket</Text>} centered radius="lg">
      <Stack gap="md">
        <Text size="sm" c="slateClean.7">
          Pilih PIC untuk menangani tiket <b style={{ color: '#0f172a' }}>{ticketNumber}</b>.
        </Text>
        <Select
          label="Pilih Penanggung Jawab"
          placeholder="Cari nama PIC..."
          data={picList}
          value={selectedNewPicId}
          onChange={setSelectedNewPicId}
          searchable
          clearable
          nothingFoundMessage="Tidak ada staf yang ditemukan, periksa kembali nama pada pencarian."
          radius="md"
        />
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose} radius="md">Batal</Button>
          <Button
            onClick={handleSubmit}
            color="ptpn4Green.9"
            loading={isAssigning}
            disabled={!selectedNewPicId || selectedNewPicId === currentPicId}
            radius="md"
          >
            Alihkan Tiket
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
