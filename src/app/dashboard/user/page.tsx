'use client';

import { useState, useEffect } from 'react';
import { Container, Card, Title, Text, Button, Stack, TextInput, Textarea, FileInput, Badge, Group, Select, Table, Anchor, Modal, Timeline, Divider } from '@mantine/core';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase';

interface CategoryOption {
  value: string;
  label: string;
}

interface MyRequestItem {
  attachments: any;
  id: string;
  ticket_number: string;
  request_title: string;
  description: string;
  status: string;
  total_hold_days: number;
  created_at: string;
  categories: { name: string } | null;
}

interface HistoryLog {
  id: string;
  status_before: string;
  status_after: string;
  notes: string | null;
  created_at: string;
  profiles: { full_name: string } | null;
}

export default function UserDashboard() {
  const router = useRouter();
  const [userProfile, setUserProfile] = useState<{ id: string; fullName: string; division: string } | null>(null);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [myRequests, setMyRequests] = useState<MyRequestItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [categoryId, setCategoryId] = useState<string>('');
  const [requestTitle, setRequestTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [message, setMessage] = useState('');

  const [selectedRequest, setSelectedRequest] = useState<MyRequestItem | null>(null);
  const [historyLogs, setHistoryLogs] = useState<HistoryLog[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  useEffect(() => {
    initDashboard();

    const channel = supabase
      .channel('user-db-changes')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'requests' },
        () => {
          const checkUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) fetchUserRequests(user.id);
          };
          checkUser();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  const initDashboard = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/login');
      return;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, division')
      .eq('id', user.id)
      .maybeSingle();

    if (profile) {
      setUserProfile({
        id: user.id,
        fullName: profile.full_name,
        division: profile.division,
      });

      fetchUserRequests(user.id);
    }

    const { data: categoriesData } = await supabase.from('categories').select('id, name');
    if (categoriesData) {
      setCategories(categoriesData.map((cat) => ({ value: String(cat.id), label: cat.name })));
    }
    setLoading(false);
  };

  const fetchUserRequests = async (userId: string) => {
  const { data } = await supabase
    .from('requests')
    .select(`
      id, ticket_number, request_title, description, status, total_hold_days, created_at,
      categories:category_id (name),
      attachments (id, file_url, type) -- JOIN ke tabel attachments asli lo
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (data) setMyRequests(data as any);
    };

  const handleOpenTimeline = async (req: MyRequestItem) => {
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

  const generateTicketNumber = () => {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomStr = Math.floor(1000 + Math.random() * 9000);
    return `REQ-${dateStr}-${randomStr}`;
  };

  const handleUploadAndSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile || !categoryId) return;
    setFormLoading(true);
    setMessage('');

    try {
      let uploadedFileUrl = '';

      if (file) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${userProfile.id}-${Date.now()}.${fileExt}`;
        const filePath = `user_docs/${fileName}`;

        const { error: uploadError } = await supabase.storage.from('documents').upload(filePath, file);
        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(filePath);
        uploadedFileUrl = publicUrl;
      }

      const ticketNumber = generateTicketNumber();

      const { data: newRequest, error: insertError } = await supabase
        .from('requests')
        .insert([
          {
            ticket_number: ticketNumber,
            user_id: userProfile.id,
            category_id: parseInt(categoryId),
            request_title: requestTitle,
            description: description,
            status: 'Dikirim',
            file_url: uploadedFileUrl,
            total_hold_days: 0,
          },
        ])
        .select()
        .single();

      if (insertError) throw insertError;

      await supabase.from('request_logs').insert([
        { request_id: newRequest.id, changed_by: userProfile.id, status_before: null, status_after: 'Dikirim', notes: 'Dokumen berhasil diajukan ke antrean pusat' }
      ]);

      setMessage(`Sukses: Permohonan dibuat dengan nomor tiket ${ticketNumber}!`);
      setRequestTitle('');
      setDescription('');
      setCategoryId('');
      setFile(null);

      fetchUserRequests(userProfile.id);
    } catch (error: any) {
      setMessage(`Eror: ${error.message}`);
    } finally {
      setFormLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const getStatusColor = (status: string) => {
    if (status.startsWith('Sedang Ditahan')) return 'orange';
    if (status === 'Disetujui') return 'green';
    if (status === 'Ditolak') return 'red';
    return 'blue';
  };

  if (loading || !userProfile) return <Text ta="center" mt="xl">Memuat koordinat ruang kerja...</Text>;

  return (
    <Container size="lg" style={{ paddingTop: '40px' }} suppressHydrationWarning>
      <Stack gap="xl">

        <Card shadow="sm" padding="xl" radius="md" withBorder>
          <Group justify="space-between" mb="xs">
            <Title order={2} c="blue">DocuTrack PalmCo</Title>
            <Button color="red" variant="subtle" size="xs" onClick={handleLogout}>Logout</Button>
          </Group>
          
        <Card bg="gray.0" padding="md" radius="sm" mb="xl">
            <Text size="sm" fw={500}>Profil Pengaju:</Text>
            <Group gap="xs" mt="xs">
            <Text size="xs" c="dimmed">
            Nama: {userProfile.fullName} • Divisi:
            </Text>
            <Badge size="xs" color="blue" variant="light">
            {userProfile.division}
            </Badge>
            </Group>
        </Card>

          <form onSubmit={handleUploadAndSubmit}>
            <Stack gap="md">
              <Select
                label="Kategori Dokumen / Permasalahan"
                placeholder="Pilih kategori dokumen"
                data={categories}
                searchable
                required
                value={categoryId}
                onChange={(value) => setCategoryId(value || '')}
                styles={{
                  dropdown: { backgroundColor: '#ffffff', border: '1px solid #e2e8f0' },
                  option: { color: '#1a1a1a', fw: 500, '&[dataHovered]': { backgroundColor: '#f1f5f9' } },
                }}
              />
              <TextInput label="Judul Permohonan" placeholder="Contoh: Permohonan Reset Akses Akun SAP Logistik" required value={requestTitle} onChange={(e) => setRequestTitle(e.target.value)} />
              <Textarea label="Deskripsi Detail Permintaan" placeholder="Tulis urgensi berkas..." rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
              <FileInput label="Unggah Dokumen Lampiran (.pdf)" placeholder="Pilih file dokumen pendukung" value={file} onChange={setFile} accept="application/pdf" />
              
              {message && <Text size="xs" c={message.startsWith('Eror') ? 'red' : 'green'} ta="center" fw={600}>{message}</Text>}
              
              <Button type="submit" loading={formLoading} color="blue" fullWidth mt="sm">Kirim Permohonan & Berikan Tiket</Button>
            </Stack>
          </form>
        </Card>

        <Divider label="Lacak Status Dokumen Lo" labelPosition="center" />

        <Card shadow="sm" padding="xl" radius="md" withBorder>
          <Title order={3} c="dark" mb="sm" size="h4">Histori & Progress Pelacakan Tiket</Title>
          <Text size="xs" c="dimmed" mb="lg">Klik pada nomor tiket untuk melihat rincian pergerakan birokrasi berkas lo secara detail.</Text>

          {myRequests.length === 0 ? (
            <Text ta="center" c="dimmed" my="lg" size="sm">Lo belum pernah mengajukan dokumen permohonan apapun.</Text>
          ) : (
            <Table striped highlightOnHover withTableBorder>
              <Table.Thead bg="gray.0">
                <Table.Tr>
                  <Table.Th>No. Tiket Tracker</Table.Th>
                  <Table.Th>Kategori / Judul Permohonan</Table.Th>
                  <Table.Th style={{ width: '100px' }}>Durasi Hold</Table.Th>
                  <Table.Th style={{ width: '130px' }}>Tanggal Kirim</Table.Th>
                  <Table.Th style={{ width: '180px' }}>Posisi Status Berkas</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {myRequests.map((req) => {
                    const finalAttachment = req.attachments?.find((att: any) => att.type === 'Form_Final');
                
                return(
                  <Table.Tr key={req.id}>
                    <Table.Td>
                      <Anchor onClick={() => handleOpenTimeline(req)} fw={700} size="xs" c="blue" style={{ cursor: 'pointer' }}>
                        {req.ticket_number} 🔍
                      </Anchor>
                    </Table.Td>
                    <Table.Td>
                      <Badge size="10px" color="gray" variant="outline" mb="2px">{req.categories?.name}</Badge>
                      <Text size="xs" fw={600} c="dark">{req.request_title}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" ta="center" c="orange" fw={600}>{req.total_hold_days} Hari</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" c="dimmed">
                        {new Date(req.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge color={getStatusColor(req.status)} variant="light" size="sm" fullWidth>
                        {req.status}
                      </Badge>
                    </Table.Td>

                    <Table.Td>
                        <Stack gap={4}>
                        <Badge color={getStatusColor(req.status)} variant="light" size="sm" fullWidth>
                            {req.status}
                        </Badge>
                        
                        {finalAttachment && (
                            <Button component="a" href={finalAttachment.file_url} target="_blank" download size="10px" color="teal" variant="filled" fullWidth>
                            📥 Unduh Hasil Akhir
                            </Button>
                        )}
                        </Stack>
                    </Table.Td>

                  </Table.Tr>
                );
            })}
              </Table.Tbody>
            </Table>
          )}
        </Card>
      </Stack>

      <Modal opened={selectedRequest !== null} onClose={() => setSelectedRequest(null)} title={`Detail Alur Koordinat Tiket - ${selectedRequest?.ticket_number}`} size="md" centered>
        {loadingTimeline ? (
          <Text size="sm" ta="center" my="md">Membaca jejak dokumen...</Text>
        ) : (
          <Timeline active={historyLogs.length - 1} bulletSize={20} lineWidth={2} mt="md">
            {historyLogs.map((log) => (
              <Timeline.Item key={log.id} title={log.status_after}>
                {log.notes && <Text size="xs" mt={2} c="dark">Keterangan PIC: "{log.notes}"</Text>}
                <Text size="10px" c="blue" fw={500} mt={4}>
                  Oleh: {log.profiles?.full_name || 'System'} • {new Date(log.created_at).toLocaleString('id-ID')} WIB
                </Text>
              </Timeline.Item>
            ))}
          </Timeline>
        )}
      </Modal>
    </Container>
  );
}