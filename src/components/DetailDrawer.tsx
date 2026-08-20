import { useState } from 'react';
import { Drawer, Group, Badge, Text, Stack, Box, Paper, NumberInput, Button, ActionIcon, Tooltip, Divider, Timeline, Modal } from '@mantine/core';
import { IconPencil, IconDownload, IconUpload, IconTrash } from '@tabler/icons-react';
import { RequestItem, RequestLog } from '@/utils/types';
import { getProjectedDate } from '@/utils/helpers';
import { createClient } from '@/lib/supabase/client';
import { notifications } from '@mantine/notifications'

interface DetailDrawerProps {
  detail: RequestItem | null;
  historyLogs: RequestLog[];
  loadingTimeline: boolean;
  onClose: () => void;
  editingSlaId: string | null;
  newSlaValue: number | '';
  isSavingSla: boolean;
  onEditSla: (id: string, currentVal: number | '') => void;
  onCancelEditSla: () => void;
  onSlaValueChange: (val: number | '') => void;
  onSaveSla: (id: string) => void;
  currentUserRole: string;
  currentPicId: string | null;
  onDownload: (url: string, fileName: string) => void;
}

export default function DetailDrawer({
  detail, historyLogs, loadingTimeline, onClose,
  editingSlaId, newSlaValue, isSavingSla,
  onEditSla, onCancelEditSla, onSlaValueChange, onSaveSla,
  currentUserRole, currentPicId, onDownload
}: DetailDrawerProps) {

  const [uploadAwal, setUploadAwal] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<{id: string, url: string} | null>(null);

  const handleDocumentUploadStaff = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !detail) return;

    const payload = Array.from(files);
    const MAX_SIZE_MB = 5;

    const oversizedFiles = payload.filter(file => file.size / (1024 * 1024) > MAX_SIZE_MB);
    if (oversizedFiles.length > 0) {
      notifications.show({
        title: 'Berkas Terlalu Besar',
        message: `Ukuran berkas melebihi ${MAX_SIZE_MB} MB.`,
        color: 'red',
      });
      e.target.value = '';
      return;
    }

    setUploadAwal(true);
    const supabase = createClient();

    try {
      if (!currentPicId) throw new Error("ID Staf tidak ditemukan.");

      const newAttachments = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const sanitizedName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        const uniqueFileName = `${Date.now()}_${sanitizedName}`;
        const filePath = `user_docs/${uniqueFileName}`;

        const { error: uploadError } = await supabase.storage.from('documents').upload(filePath, file);
        if (uploadError) throw new Error("STORAGE_ERROR: " + uploadError.message);

        const { data: urlData } = supabase.storage.from('documents').getPublicUrl(filePath);

        const { data: insertedDb, error: dbError } = await supabase.from('attachments').insert({
          request_id: detail.id,
          file_name: file.name,
          file_url: urlData.publicUrl,
          type: 'Dokumen_Awal',
          uploaded_by: currentPicId
        }).select().single();
        if (dbError) throw new Error("Gagal: Error Pada Database " + dbError.message);
        if (insertedDb) newAttachments.push(insertedDb);
      }
      if (!detail.attachments) detail.attachments = [];
      detail.attachments.push(...newAttachments);

      e.target.value = '';

      notifications.show({
        title: 'Berhasil Mengunggah Dokumen',
        message: `${newAttachments.length} dokumen telah ditambahkan ke lampiran.`,
        color: 'green',
      });

    } catch (err: any) {
      notifications.show({ title: 'Gagal Mengunggah Dokumen', message: 'Terjadi kesalahan saat mengunggah dokumen.', color: 'red' });
    } finally {
      setUploadAwal(false);
    }
  };
  const handleDeleteAttachment = async () => {
    if(!fileToDelete) return;
    setUploadAwal(true);
    const supabase = createClient();
    try {
      const pathParts = fileToDelete.url.split('/documents/');
      if (pathParts.length > 1) {
        await supabase.storage.from('documents').remove([pathParts[1]]);
      }

      await supabase.from('attachments').delete().eq('id', fileToDelete.id);

      if (detail && detail.attachments) {
        detail.attachments = detail.attachments.filter(a => a.id !== fileToDelete.id);
      }

      notifications.show({
        title: 'Berhasil Menghapus Dokumen',
        message: 'Dokumen berhasil dihapus dari sistem.',
        color: 'green',
      });

    } catch (error) {
      notifications.show({ title: 'Gagal Menghapus Dokumen', message: "Terjadi kesalahan saat menghapus dokumen.", color: 'red' });
    } finally {
      setUploadAwal(false);
      setFileToDelete(null);
    }
  };

  return (
    <Drawer
      opened={detail !== null}
      onClose={onClose}
      title={
        <Group gap="xs">
          <Badge color="ptpn4Green.9" variant="filled" radius="sm">
            {detail?.ticket_number}
          </Badge>
          <Text fw={800} size="md" c="slateClean.9">Detail Dokumen Pengajuan</Text>
        </Group>
      }
      position="right"
      size="md"
      styles={{
        header: { borderBottom: '1px solid var(--mantine-color-slateClean-2)', paddingBottom: '12px' },
        content: { backgroundColor: 'var(--mantine-color-white)' }
      }}
    >
      {detail && (
        <Stack gap="lg" mt="md">
          { }
          <Box p="sm" bg="slateClean.0" style={{ borderRadius: '8px' }}>
            <Text size="xs" c="dimmed" fw={600} mb={4}>INFORMASI PENGAJU</Text>
            <Text fw={700} size="sm" c="slateClean.8">{detail.profiles?.full_name}</Text>
            <Text size="xs" c="slateClean.5">
              {detail.profiles?.work_unit === 'Head Office'
                ? `${detail.profiles.work_unit} | ${detail.profiles.division || ''}`
                : (detail.profiles?.work_unit || 'Lokasi Kerja')}
              {detail.profiles?.email ? ` • ${detail.profiles.email}` : ''}
            </Text>
          </Box>

          { }
          <Box>
            <Text size="xs" c="dimmed" fw={600} mb={2}>JUDUL PENGAJUAN</Text>
            <Text fw={700} size="md" c="slateClean.9" mb="xs">{detail.request_title}</Text>
            <Badge color="blue" variant="light">
              {detail.categories?.name === 'Tiket Lainnya' && detail.sub_categories?.name
                ? detail.sub_categories.name
                : (detail.categories?.name || 'Tidak Diketahui')}
            </Badge>
          </Box>

          { }
          <Box>
            <Text size="xs" c="dimmed" fw={600} mb={4}>TARGET BATAS WAKTU (SLA)</Text>
            {editingSlaId === detail.id ? (
              <Group gap="xs">
                <NumberInput
                  value={newSlaValue}
                  onChange={(val) => onSlaValueChange(val as number | '')}
                  min={1} max={365} size="xs" w={100} placeholder="Hari"
                />
                {newSlaValue !== '' && (
                  <Text size="xs" c="dimmed" mt={4}>
                    📅 Estimasi: <Text span fw={700} c="ptpn4Green.9">{getProjectedDate(Number(newSlaValue))}</Text>
                  </Text>
                )}
                <Button size="xs" color="ptpn4Green.9" loading={isSavingSla} onClick={() => onSaveSla(detail.id)}>
                  Simpan
                </Button>
                <Button size="xs" variant="subtle" color="gray" onClick={onCancelEditSla}>
                  Batal
                </Button>
              </Group>
            ) : (
              <Group gap="xs">
                <Text size="sm" fw={600} c="slateClean.8">
                  {detail.categories?.name === 'Tiket Lainnya'
                    ? (detail.custom_sla_days ? `${detail.custom_sla_days} Hari` : 'Belum Ditentukan')
                    : `${detail.categories?.sla_days} Hari`
                  }
                </Text>
                {(detail.categories?.name === 'Tiket Lainnya') &&
                  (currentUserRole === 'Koordinator' || detail.current_pic_id === currentPicId) && (
                    <Tooltip label="Ubah batas waktu SLA" position="top">
                      <ActionIcon size="sm" variant="subtle" color="blue" onClick={() => onEditSla(detail.id, detail.custom_sla_days || '')}>
                        <IconPencil size={14} />
                      </ActionIcon>
                    </Tooltip>
                  )}
              </Group>
            )}
          </Box>

          { }
          <Box>
            <Text size="xs" c="dimmed" fw={600} mb={4}>DESKRIPSI / KETERANGAN</Text>
            <Paper p="md" withBorder radius="md" bg="var(--mantine-color-slateClean-0)" style={{ borderColor: 'var(--mantine-color-slateClean-2)' }}>
              <Text size="sm" c="slateClean.7" style={{ whiteSpace: 'pre-line', lineHeight: '1.6' }}>
                {detail.description || 'Tidak ada keterangan.'}
              </Text>
            </Paper>
          </Box>

          { }

          {detail.attachments && detail.attachments.filter((a) => a.type === 'Dokumen_Awal').length > 0 && (
            <Box>
              <Text size="xs" c="dimmed" fw={600} mb={4}>
                LAMPIRAN DOKUMEN AWAL ({detail.attachments.filter((a) => a.type === 'Dokumen_Awal').length} Dokumen)
              </Text>

              <Stack gap="xs">
                {detail.attachments.filter((att) => att.type === 'Dokumen_Awal').map((file, idx: number) => (
                  <Group key={file.id || idx} wrap="nowrap" gap="xs">
                    <Button
                      style={{ flex: 1 }}
                      onClick={() => onDownload(file.file_url, file.file_name || 'Dokumen')}
                      variant="outline" color="ptpn4Green.9" leftSection={<IconDownload size={16} />}
                      styles={{ inner: { justifyContent: 'flex-start' } }}
                    >
                      <Text size="xs" truncate style={{ maxWidth: '90%' }}>
                        {file.file_name || `Unduh Dokumen Lampiran ${idx + 1}`}
                      </Text>
                    </Button>

                    {(currentUserRole === 'Staf' || currentUserRole === 'Koordinator') && (
                      <ActionIcon
                        variant="light"
                        color="red"
                        size="lg"
                        onClick={() => setFileToDelete({ id: file.id, url: file.file_url })}
                      >
                        <IconTrash size={18} />
                      </ActionIcon>
                    )}
                  </Group>
                ))}
              </Stack>
              {(currentUserRole === 'Staf' || currentUserRole === 'Koordinator') && (
                <Box mt="sm">
                  <Button
                    component="label"
                    variant="fill"
                    color="ptpn4Green.5"
                    loading={uploadAwal}
                    leftSection={<IconUpload size={16} />}
                    styles={{ inner: { justifyContent: 'flex-start' } }}
                  >
                    <Text size="xs" truncate>
                      Unggah
                    </Text>
                    <input
                      type="file"
                      hidden
                      multiple
                      accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,
                          application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      onChange={handleDocumentUploadStaff}
                    />
                  </Button>
                </Box>
              )}
            </Box>
          )}

          {detail.attachments?.some((a: any) => a.type === 'Dokumen_Final') && (
            <Box>
              <Text size="xs" c="ptpn4Green.9" fw={800} mb={4}>LAMPIRAN DOKUMEN FINAL</Text>
              <Stack gap="xs">
                {detail.attachments
                  .filter((att: any) => att.type === 'Dokumen_Final')
                  .map((file: any, idx: number) => (
                    <Button
                      key={file.id || idx}
                      onClick={() => onDownload(file.file_url, file.file_name || 'Dokumen')}
                      variant="filled" color="ptpn4Green.9" fullWidth leftSection={<IconDownload size={16} />}
                      styles={{ inner: { justifyContent: 'flex-start' } }}
                    >
                      <Text size="xs" truncate style={{ maxWidth: '90%' }}>
                        {file.file_name || `Unduh Dokumen Final ${idx + 1}`}
                      </Text>
                    </Button>
                  ))}
              </Stack>
            </Box>
          )}

          <Divider my="sm" label={<Text size="10px" fw={700} c="slateClean.4" lts="0.5px">RIWAYAT STATUS DOKUMEN</Text>} labelPosition="center" />
          {loadingTimeline ? (
            <Text size="xs" ta="center" c="dimmed" py="sm">Memuat riwayat log...</Text>
          ) : (
            <Timeline active={historyLogs.length - 1} bulletSize={18} lineWidth={1.5} color="ptpn4Green.9">
              {historyLogs.map((log, index) => {
                const isCurrentStatus = index === historyLogs.length - 1;
                return (
                  <Timeline.Item
                    key={log.id}
                    title={
                      <Text
                        fw={700} size="xs" c={isCurrentStatus ? 'ptpn4Green.9' : 'slateClean.8'}
                        style={{
                          backgroundColor: isCurrentStatus ? '#ecfdf3' : 'transparent',
                          padding: isCurrentStatus ? '2px 6px' : '0',
                          borderRadius: isCurrentStatus ? '4px' : '0',
                          display: 'inline-block'
                        }}
                      >
                        {log.status_after}
                      </Text>
                    }
                  >
                    {log.notes && <Text size="11px" mt={2} c="slateClean.6" style={{ fontStyle: 'italic' }}>Keterangan: "{log.notes}"</Text>}
                    <Text size="9px" c={isCurrentStatus ? 'green.7' : 'ptpn4Green.8'} fw={600} mt={4}>
                      Oleh: {log.profiles?.full_name || 'System Auto'} • {new Date(log.created_at).toLocaleString('id-ID')}
                    </Text>
                  </Timeline.Item>
                );
              })}
            </Timeline>
          )}
        </Stack>

      )}

      <Modal
        opened={!!fileToDelete}
        onClose={() => setFileToDelete(null)}
        title={<Text fw={700}>Konfirmasi Penghapusan</Text>}
        centered
        radius="md"
        zIndex={1000}
      >
        <Text size="sm" mb="xl">
          Apakah Anda yakin ingin menghapus lampiran ini secara permanen? Dokumen yang dihapus tidak dapat dipulihkan.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={() => setFileToDelete(null)}>Batal</Button>
          <Button color="red.9" onClick={handleDeleteAttachment} loading={uploadAwal}>Hapus Dokumen</Button>
        </Group>
      </Modal>

    </Drawer>
  );
}
