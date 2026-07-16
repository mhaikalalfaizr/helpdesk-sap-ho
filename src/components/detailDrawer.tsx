import { Drawer, Group, Badge, Text, Stack, Box, Paper, NumberInput, Button, ActionIcon, Tooltip, Divider, Timeline } from '@mantine/core';
import { IconPencil, IconDownload } from '@tabler/icons-react';

interface DetailDrawerProps {
  detail: any;
  historyLogs: any[];
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

  const getProjectedDate = (daysToAdd: number) => {
    if (!daysToAdd) return '-';
    const projected = new Date();
    projected.setDate(projected.getDate() + daysToAdd);
    return projected.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
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
        header: { borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' },
        content: { backgroundColor: '#ffffff' }
      }}
    >
      {detail && (
        <Stack gap="lg" mt="md">
          {}
          <Box p="sm" bg="slateClean.0" style={{ borderRadius: '8px' }}>
            <Text size="xs" c="dimmed" fw={600} mb={4}>INFORMASI PENGAJU</Text>
            <Text fw={700} size="sm" c="slateClean.8">{detail.profiles?.full_name}</Text>
            <Text size="xs" c="slateClean.5">
              {detail.profiles?.unit_kerja === 'Head Office'
                ? `${detail.profiles.unit_kerja} | ${detail.profiles.division || ''}`
                : (detail.profiles?.unit_kerja || 'Lokasi Kerja')}
              {detail.profiles?.email ? ` • ${detail.profiles.email}` : ''}
            </Text>
          </Box>

          {}
          <Box>
            <Text size="xs" c="dimmed" fw={600} mb={2}>JUDUL PENGAJUAN</Text>
            <Text fw={700} size="md" c="slateClean.9" mb="xs">{detail.request_title}</Text>
            <Badge color="blue" variant="light">
              {detail.categories?.name === 'Tiket Lainnya' && detail.sub_categories?.name
                ? detail.sub_categories.name
                : (detail.categories?.name || 'Tidak Diketahui')}
            </Badge>
          </Box>

          {}
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
                  {detail.categories?.id === 4 || detail.categories?.name === 'Tiket Lainnya'
                     ? (detail.custom_sla_days ? `${detail.custom_sla_days} Hari` : 'Belum Ditentukan')
                     : `${detail.categories?.sla_days} Hari`
                  }
                </Text>
                {(detail.categories?.id === 4 || detail.categories?.name === 'Tiket Lainnya') &&
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

          {}
          <Box>
            <Text size="xs" c="dimmed" fw={600} mb={4}>DESKRIPSI & KETERANGAN DOKUMEN</Text>
            <Paper p="md" withBorder radius="md" bg="#f8fafc" style={{ borderColor: '#e2e8f0' }}>
              <Text size="sm" c="slateClean.7" style={{ whiteSpace: 'pre-line', lineHeight: '1.6' }}>
                {detail.description || 'Pengaju tidak menyertakan keterangan tertulis pada dokumen ini.'}
              </Text>
            </Paper>
          </Box>

          {}
          {detail.attachments && detail.attachments.filter((a: any) => a.type === 'Dokumen_Awal').length > 0 ? (
            <Box>
              <Text size="xs" c="dimmed" fw={600} mb={4}>
                LAMPIRAN DOKUMEN AWAL ({detail.attachments.filter((a: any) => a.type === 'Dokumen_Awal').length} Dokumen)
              </Text>
              <Stack gap="xs">
                {detail.attachments.filter((att: any) => att.type === 'Dokumen_Awal').map((file: any, idx: number) => (
                  <Button
                    key={file.id || idx}
                    onClick={() => onDownload(file.file_url, file.file_name)}
                    variant="outline" color="ptpn4Green.9" fullWidth leftSection={<IconDownload size={16} />}
                    styles={{ inner: { justifyContent: 'flex-start' } }}
                  >
                    <Text size="xs" truncate style={{ maxWidth: '90%' }}>
                      {file.file_name || `Unduh Dokumen Lampiran ${idx + 1}`}
                    </Text>
                  </Button>
                ))}
              </Stack>
            </Box>
          ) : (
            detail.file_url && (
              <Box>
                <Text size="xs" c="dimmed" fw={600} mb={4}></Text>
                <Button
                  component="a" target="_blank" rel="noopener noreferrer"
                  variant="outline" color="ptpn4Green.9" fullWidth leftSection={<IconDownload size={16} />}
                >
                  Buka Dokumen PDF
                </Button>
              </Box>
            )
          )}

          {detail.attachments?.some((a: any) => a.type === 'Dokumen_Final') && (
            <Box mt="sm">
              <Text size="xs" c="ptpn4Green.9" fw={800} mb={4}>LAMPIRAN DOKUMEN AKHIR</Text>
              <Stack gap="xs">
                {detail.attachments
                  .filter((att: any) => att.type === 'Dokumen_Final')
                  .map((file: any, idx: number) => (
                    <Button
                      key={file.id || idx}
                      onClick={() => onDownload(file.file_url, file.file_name)}
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

          {}
          <Divider my="sm" label={<Text size="10px" fw={700} c="slateClean.4" lts="0.5px">RIWAYAT ALUR DOKUMEN</Text>} labelPosition="center" />
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
    </Drawer>
  );
}
