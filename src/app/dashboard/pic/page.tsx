'use client';

import { useState, useEffect } from 'react';
import { Container, Card, Title, Text, Button, Badge, Group, Table, Anchor, Modal, Timeline, Stack, FileInput } from '@mantine/core';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase';

interface RequestItem {
  id: string;
  ticket_number: string;
  request_title: string;
  description: string;
  status: string;
  total_hold_days: number;
  created_at: string;
  profiles: { full_name: string; division: string } | null;
  categories: { name: string; sla_days: number } | null;
  file_url?: string | null; 
}

interface HistoryLog {
  id: string;
  status_before: string;
  status_after: string;
  notes: string | null;
  created_at: string;
  profiles: { full_name: string } | null;
}

export default function PicDashboard() {
  const router = useRouter();
  const [currentPicId, setCurrentPicId] = useState<string | null>(null);
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [finalUploadRequest, setFinalUploadRequest] = useState<any | null>(null);
  const [finalFile, setFinalFile] = useState<File | null>(null);
  const [uploadingFinal, setUploadingFinal] = useState(false);

  const [selectedRequest, setSelectedRequest] = useState<RequestItem | null>(null);
  const [historyLogs, setHistoryLogs] = useState<HistoryLog[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  useEffect(() => {
    initPic();
    
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'requests' },
        () => {
          initPic(); 
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  const initPic = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/login');
      return;
    }
    setCurrentPicId(user.id);

    const { data } = await supabase
      .from('requests')
      .select(`
        id, ticket_number, request_title, description, status, total_hold_days, created_at, file_url,
        profiles:user_id (full_name, division),
        categories:category_id (name, sla_days)
      `)
      .order('created_at', { ascending: false });

    if (data) setRequests(data as any);
    setLoading(false);
  };

  const handleOpenTimeline = async (req: RequestItem) => {
    setSelectedRequest(req);
    setLoadingTimeline(true);

    const { data } = await supabase
      .from('request_logs')
      .select(`
        id, status_before, status_after, notes, created_at,
        profiles:changed_by (full_name)
      `)
      .eq('request_id', req.id)
      .order('created_at', { ascending: true });

    if (data) setHistoryLogs(data as any);
    setLoadingTimeline(false);
  };

  const handleNextStep = async (req: RequestItem) => {
    if (req.status === 'Dalam Proses oleh Konsultan') {
        setFinalUploadRequest(req); 
        return;
    }

    let nextStatus = '';
    switch (req.status) {
      case 'Dikirim': nextStatus = 'Dalam Proses oleh PIC'; break;
      case 'Dalam Proses oleh PIC': nextStatus = 'Dalam Proses oleh Head Office'; break;
      case 'Dalam Proses oleh Head Office': nextStatus = 'Dalam Proses oleh Holding'; break;
      case 'Dalam Proses oleh Holding': nextStatus = 'Dalam Proses oleh Konsultan'; break;
      case 'Dalam Proses oleh Konsultan': nextStatus = 'Disetujui'; break;
      default: return;
    }

    await updateDatabaseStatus(req.id, { status: nextStatus }, nextStatus, 'Maju ke tahap selanjutnya.');
    };


const handleSubmitFinalDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!finalUploadRequest || !finalFile || !currentPicId) return;
    setUploadingFinal(true);

    try {
        const fileExt = finalFile.name.split('.').pop();
        const fileName = `final-${finalUploadRequest.ticket_number}-${Date.now()}.${fileExt}`;
        const filePath = `final_docs/${fileName}`;

        const { error: uploadError } = await supabase.storage.from('documents').upload(filePath, finalFile);
        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(filePath);

        const { error: attachError } = await supabase.from('attachments').insert([
        {
            request_id: finalUploadRequest.id,
            file_name: finalFile.name,
            file_url: publicUrl,
            uploaded_by: currentPicId,
            type: 'Form_Final'
        }
        ]);
        if (attachError) throw attachError;

        await updateDatabaseStatus(finalUploadRequest.id, { status: 'Disetujui' }, 'Disetujui', 'Berkas disetujui seluruh pihak. Dokumen Form_Final dilampirkan.');
        
        setFinalUploadRequest(null);
        setFinalFile(null);
    } catch (err: any) {
        alert(`Gagal: ${err.message}`);
    } finally {
        setUploadingFinal(false);
    }
    };

  const handleToggleHold = async (req: RequestItem) => {
    const nowStr = new Date().toISOString();
    let nextStatus = '';

    if (req.status.startsWith('Dalam Proses oleh')) {
      if (req.status.includes('Head Office')) nextStatus = 'Sedang Ditahan di Head Office';
      if (req.status.includes('Holding')) nextStatus = 'Sedang Ditahan di Holding';
      if (req.status.includes('Konsultan')) nextStatus = 'Sedang Ditahan di Konsultan';

      try {
        await supabase.from('request_holds').insert([
          { request_id: req.id, hold_reason: `Penahanan berkas pada fase ${req.status}`, hold_start: nowStr }
        ]);

        await supabase.from('requests').update({ status: nextStatus, updated_at: nowStr }).eq('id', req.id);

        await supabase.from('request_logs').insert([
          { request_id: req.id, changed_by: currentPicId, status_before: req.status, status_after: nextStatus, notes: 'Berkas ditangguhkan sementara' }
        ]);

        setRequests((prev) => prev.map((r) => (r.id === req.id ? { ...r, status: nextStatus } : r)));
      } catch (err: any) {
        alert(err.message);
      }

    } else if (req.status.startsWith('Sedang Ditahan di')) {
      if (req.status.includes('Head Office')) nextStatus = 'Dalam Proses oleh Head Office';
      if (req.status.includes('Holding')) nextStatus = 'Dalam Proses oleh Holding';
      if (req.status.includes('Konsultan')) nextStatus = 'Dalam Proses oleh Konsultan';

      try {
        const { data: activeHold } = await supabase
          .from('request_holds')
          .select('id, hold_start')
          .eq('request_id', req.id)
          .is('hold_end', null)
          .maybeSingle();

        let diffDays = 0;
        if (activeHold) {
          const startTime = new Date(activeHold.hold_start).getTime();
          const endTime = new Date().getTime();
          diffDays = Math.max(1, Math.round((endTime - startTime) / (1000 * 60 * 60 * 24)));

          await supabase
            .from('request_holds')
            .update({ hold_end: nowStr, duration_days: diffDays })
            .eq('id', activeHold.id);
        }

        const newTotalHoldDays = (req.total_hold_days || 0) + diffDays;

        await supabase
          .from('requests')
          .update({ status: nextStatus, total_hold_days: newTotalHoldDays, updated_at: nowStr })
          .eq('id', req.id);

        await supabase.from('request_logs').insert([
          { request_id: req.id, changed_by: currentPicId, status_before: req.status, status_after: nextStatus, notes: 'Berkas dilepas dari penahanan' }
        ]);

        setRequests((prev) => prev.map((r) => (r.id === req.id ? { ...r, status: nextStatus, total_hold_days: newTotalHoldDays } : r)));
      } catch (err: any) {
        alert(err.message);
      }
    }
  };

  const calculateTotalSlaDays = (createdAtString: string) => {
    const created = new Date(createdAtString).getTime();
    const now = new Date().getTime();
    const diffDays = Math.round((now - created) / (1000 * 60 * 60 * 24));
    return diffDays <= 0 ? 'Hari Ini' : `${diffDays} Hari`;
  };

  return (
    <Container size="xl" style={{ paddingTop: '40px' }} suppressHydrationWarning>
      <Card shadow="sm" padding="xl" radius="md" withBorder>
        <Title order={2} c="teal" mb="lg">Control Panel PIC Monitor</Title>

        <Table striped highlightOnHover withTableBorder>
          <Table.Thead bg="gray.0">
            <Table.Tr>
              <Table.Th>No. Tiket</Table.Th>
              <Table.Th>Pengaju / Divisi</Table.Th>
              <Table.Th>Judul Permohonan</Table.Th>
              <Table.Th>Durasi / Hold</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th style={{ width: '280px' }}>Aksi Sinkronisasi</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {requests.map((req) => {
              const isFinal = req.status === 'Disetujui' || req.status === 'Ditolak';
              const isHoldState = req.status.startsWith('Sedang Ditahan di');
              const canHold = req.status.includes('Head Office') || req.status.includes('Holding') || req.status.includes('Konsultan');

                const updateDatabaseStatus = async (id: string, payload: any, logStatusName: string) => {
                    try {
                    const { data: updatedData, error: reqError } = await supabase
                        .from('requests')
                        .update({
                        ...payload,
                        current_pic_id: currentPicId,
                        updated_at: new Date().toISOString()
                        })
                        .eq('id', id)
                        .select(); 
                    if (reqError) throw reqError;

                    if (!updatedData || updatedData.length === 0) {
                        throw new Error("Gagal menyimpan! Database menolak update status ini. Pastikan RLS sudah mati.");
                    }
                    await supabase.from('request_logs').insert([
                        { 
                        request_id: id, 
                        changed_by: currentPicId, 
                        status_before: requests.find(r => r.id === id)?.status || null, 
                        status_after: logStatusName, 
                        notes: 'Sinkronisasi status birokrasi manual oleh PIC' 
                        }
                    ]);

                    setRequests((prev) =>
                        prev.map((r) => (r.id === id ? { ...r, ...payload } : r))
                    );
                    } catch (err: any) {
                    alert(`Eror Sistem: ${err.message}`);
                    }
                };

              return (
                <Table.Tr key={req.id}>
                  <Table.Td>
                    <Anchor onClick={() => handleOpenTimeline(req)} fw={700} size="xs" c="teal" style={{ cursor: 'pointer' }}>
                      {req.ticket_number} 🔍
                    </Anchor>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs" fw={500}>{req.profiles?.full_name}</Text>
                    <Text size="10px" c="dimmed">{req.profiles?.division}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs" fw={600}>{req.request_title}</Text>
                    <Text size="10px" c="dimmed">SLA Batas Kategori: {req.categories?.sla_days} Hari</Text>
                  </Table.Td>
                  {}
                  <Table.Td>
                    <Stack gap={2}>
                      <Text size="xs" fw={700}>{calculateTotalSlaDays(req.created_at)}</Text>
                      <Text size="10px" c="orange" fw={500}>Hold: {req.total_hold_days} Hari</Text>
                    </Stack>
                  </Table.Td>
                  <Table.Td>
                    <Badge color={isHoldState ? 'orange' : isFinal ? 'green' : 'blue'} variant="light" size="sm">
                      {req.status}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    {!isFinal && (
                      <Group gap="xs">
                        <Button size="xs" color="green" disabled={isHoldState} onClick={() => handleNextStep(req)}>
                          {req.status === 'Dikirim' ? 'Proses' : 'Next Step'}
                        </Button>
                        {canHold && (
                          <Button size="xs" color="orange" variant={isHoldState ? 'filled' : 'outline'} onClick={() => handleToggleHold(req)}>
                            {isHoldState ? 'Unhold' : 'Hold'}
                          </Button>
                        )}
                        <Button size="xs" color="red" variant="subtle" onClick={() => {
                          if(confirm('Tolak berkas?')) updateDatabaseStatus(req.id, { status: 'Ditolak' }, 'Ditolak');
                        }}>
                          Reject
                        </Button>
                      </Group>
                    )}
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Card>

      <Modal opened={selectedRequest !== null} onClose={() => setSelectedRequest(null)} title={`Riwayat Alur Tiket - ${selectedRequest?.ticket_number}`} size="md" centered>
        {loadingTimeline ? (
          <Text size="sm" ta="center" my="md">Menyusun baris log...</Text>
        ) : (
          <Timeline active={historyLogs.length - 1} bulletSize={20} lineWidth={2} mt="md">
            {historyLogs.map((log) => (
              <Timeline.Item key={log.id} title={log.status_after}>
                <Text size="xs" c="dimmed">Tahap Sebelumnya: {log.status_before || 'Mulai Awal'}</Text>
                {log.notes && <Text size="xs" mt={2} style={{ italic: true }}>Keterangan: "{log.notes}"</Text>}
                <Text size="10px" c="teal" fw={500} mt={4}>
                  Aktor PIC: {log.profiles?.full_name || 'System'} • {new Date(log.created_at).toLocaleString('id-ID')} WIB
                </Text>
              </Timeline.Item>
            ))}
          </Timeline>
        )}
      </Modal>
            <Modal opened={finalUploadRequest !== null} onClose={() => setFinalUploadRequest(null)} title="Unggah Berkas Persetujuan Akhir (Konsultan)" centered>
        <form onSubmit={handleSubmitFinalDocument}>
            <Stack gap="md">
            <Text size="xs" c="dimmed">Untuk menyelesaikan tiket ini menjadi status Disetujui, Anda wajib melampirkan file PDF Form_Final hasil verifikasi luar sistem.</Text>
            <FileInput label="Dokumen Hasil Akhir (PDF)" placeholder="Pilih file PDF resmi" accept="application/pdf" required value={finalFile} onChange={(file) => setFinalFile(file)} />
            <Button type="submit" color="green" fullWidth loading={uploadingFinal}>Simpan & Setujui Dokumen Secara Permanen</Button>
            </Stack>
        </form>
        </Modal>
    </Container>
  );
}

function updateDatabaseStatus(id: string, arg1: { status: string; }, nextStatus: string, arg3: string) {
    throw new Error('Function not implemented.');
}
