import { Drawer, Group, Badge, Text, Stack, Box, Paper, Button, Divider, Timeline } from '@mantine/core';
import { IconDownload } from '@tabler/icons-react';

interface UserDetailDrawerProps {
  request: any;
  historyLogs: any[];
  loadingTimeline: boolean;
  onClose: () => void;
  onDownload: (url: string, fileName: string) => void;
}

export default function UserDetailDrawer({
  request, historyLogs, loadingTimeline, onClose, onDownload
}: UserDetailDrawerProps) {
  return (
    <Drawer
      opened={request !== null}
      onClose={onClose}
      title={
        <Group gap="xs">
          <Badge color="ptpn4Green.9" variant="filled" radius="sm">
            {request?.ticket_number}
          </Badge>
          <Text fw={800} size="md" c="slateClean.9">Detail & Status Pelacakan</Text>
        </Group>
      }
      position="right"
      size="md"
      styles={{
        header: { borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' },
        content: { backgroundColor: '#ffffff' }
      }}
    >
      {request && (
        <Stack gap="lg" mt="md">
          {}
          <Box>
            <Text size="xs" c="dimmed" fw={600} mb={2}>JUDUL PENGAJUAN SAYA</Text>
            <Text fw={700} size="md" c="slateClean.9" mb="xs">{request.request_title}</Text>
            <Badge color="blue" variant="light">{request.categories?.name}</Badge>
          </Box>

          {}
          <Box>
            <Text size="xs" c="dimmed" fw={600} mb={4}>DESKRIPSI YANG DIAJUKAN</Text>
            <Paper p="md" withBorder radius="md" bg="#f8fafc" style={{ borderColor: '#e2e8f0' }}>
              <Text size="sm" c="slateClean.7" style={{ whiteSpace: 'pre-line', lineHeight: '1.6' }}>
                {request.description || 'Tidak ada deskripsi tertulis.'}
              </Text>
            </Paper>
          </Box>

          {}
          {request.attachments && request.attachments.length > 0 && (
            <>
              <Box>
                <Text size="xs" c="dimmed" fw={600} mb={4}>LAMPIRAN BERKAS AWAL ({request.attachments.filter((a: any) => a.type === 'Dokumen_Awal').length} File)</Text>
                <Stack gap="xs">
                  {request.attachments
                    .filter((att: any) => att.type === 'Dokumen_Awal')
                    .map((file: any, idx: number) => (
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

              {request.attachments.some((a: any) => a.type === 'Dokumen_Final') && (
                <Box mt="sm">
                  <Text size="xs" c="ptpn4Green.9" fw={800} mb={4}>📥 HASIL DOKUMEN AKHIR</Text>
                  <Stack gap="xs">
                    {request.attachments
                      .filter((att: any) => att.type === 'Dokumen_Final')
                      .map((file: any, idx: number) => (
                        <Button
                          key={file.id || idx}
                          onClick={() => onDownload(file.file_url, file.file_name)}
                          variant="filled" color="ptpn4Green.9" fullWidth leftSection={<IconDownload size={16} />}
                          styles={{ inner: { justifyContent: 'flex-start' } }}
                        >
                          <Text size="xs" truncate style={{ maxWidth: '90%' }}>
                            {file.file_name || `Unduh Dokumen Lampiran ${idx + 1}`}
                          </Text>
                        </Button>
                      ))}
                  </Stack>
                </Box>
              )}
            </>
          )}

          {}
          <Divider my="sm" label={<Text size="10px" fw={700} c="slateClean.4" lts="0.5px">RIWAYAT ALUR DOKUMEN</Text>} labelPosition="center" />
          {loadingTimeline ? (
            <Text size="xs" ta="center" c="dimmed" py="sm">Mengambil riwayat status dokumen...</Text>
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
                      Oleh: {log.profiles?.full_name || 'Otomasi Sistem'} • {new Date(log.created_at).toLocaleString('id-ID')}
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
