'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import { notifications } from '@mantine/notifications';
import {
  AppShell, SimpleGrid, Paper, Text, Group, Badge, Avatar, Table, NavLink, Stack, Box, Kbd,
  Tooltip, Modal, Timeline, FileInput, Textarea, Button, TextInput, Select, ActionIcon, Divider, Loader, Center, Drawer
} from '@mantine/core';
import {
  IconLayoutDashboard, IconFileText, IconSettings, IconLogout, IconSearch, IconBell, IconMail,
  IconCheck, IconX, IconArrowUpRight, IconDownload, IconPlus, IconHistory, IconInfoCircle, IconChecklist, IconFilePlus
} from '@tabler/icons-react';

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
  profiles: { full_name: string; division: string; email?: string } | null;
  updated_at?: string | null;
  categories: { id: number; name: string; sla_days: number } | null;
  sub_categories?: { name: string; sla_days: number } | null;
  pic?: { full_name: string } | null;
  file_url?: string | null;
  current_pic_id?: string | null;
  urgency?: string | null;
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

  const [userProfile, setUserProfile] = useState<{ id: string; fullName: string; division: string; email: string } | null>(null);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [subCategoryOptions, setSubCategoryOptions] = useState<{ value: string; label: string }[]>([]);
  const [subCategory, setSubCategory] = useState<string | null>(null);
  const [myRequests, setMyRequests] = useState<MyRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserName, setCurrentUserName] = useState<string>('');

  const [categoryId, setCategoryId] = useState<string>('');
  const [requestTitle, setRequestTitle] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [formLoading, setFormLoading] = useState(false);

  const [selectedRequest, setSelectedRequest] = useState<MyRequestItem | null>(null);
  const [historyLogs, setHistoryLogs] = useState<HistoryLog[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  const [activeMenu, setActiveMenu] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<string | null>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>('desc');

  const [urgency, setUrgency] = useState<string | null>(null);

  useEffect(() => {

    initDashboard();

    const channel = supabase
      .channel('user-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'requests' },
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

  useEffect(() => {
    const fetchSubCategories = async () => {
      if (categoryId !== '4') {
        setSubCategoryOptions([]);
        setSubCategory(null);
        return;
      }

      const { data } = await supabase
        .from('sub_categories')
        .select('id, name')
        .eq('category_id', 4);

      if (data) {
        setSubCategoryOptions(data.map(sub => ({
          value: String(sub.id),
          label: sub.name
        })));
      }
    };

    fetchSubCategories();
  }, [categoryId]);

  const initDashboard = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/login');
      return;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, division, email, role')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile || profile.role !== 'User') {
      notifications.show({
        title: 'Akses Dialihkan',
        message: 'Membuka dashboard PIC...',
        color: 'blue',
      });
      router.push('/dashboard/pic');
    }

    if (profile) {
      setUserProfile({
        id: user.id,
        fullName: profile.full_name,
        division: profile.division,
        email: profile.email || '',
      });
      setCurrentUserName(profile.full_name);
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
        id, ticket_number, request_title, description, status, total_hold_days, created_at, updated_at, file_url, urgency,
        user_profile:user_id (full_name, division, email),
        categories:category_id (id, name, sla_days),
        sub_categories:sub_category_id (name, sla_days),
        pic:current_pic_id (full_name),
        attachments (id, file_url, type)
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

    if (categoryId === '4' && !subCategory) {
      notifications.show({ title: 'Data Belum Lengkap', 
        message: 'Harap pilih sub-kategori tiket Anda sebelum mengirim.', color: 'orange' });
      return;
    }

    if (!urgency) {
      notifications.show({ title: 'Data Belum Lengkap', 
        message: 'Harap tentukan Tingkat Urgensi pengajuan.', color: 'orange' });
      return;
    }

    if (!isTiketCategory && files.length === 0) {
      notifications.show({ title: 'Dokumen Wajib Dilampirkan', 
        message: 'Silakan unggah dokumen pengajuan dalam format PDF.', color: 'red' });
      return;
    }

    setFormLoading(true);
    let insertedRequestId: string | null = null;

    try {
      const ticketNumber = generateTicketNumber();
      const uploadedAttachments: { file_name: string; file_url: string; type: string }[] = [];

      let uploadedFileUrl = '';

      for (const currentFile of files) {
        const fileExt = currentFile.name.split('.').pop();
        const randomNonce = Math.random().toString(36).substring(7);
        const fileName = `${userProfile.id}-${Date.now()}-${randomNonce}.${fileExt}`;
        const filePath = `user_docs/${fileName}`;

        const { error: uploadError } = await supabase.storage.from('documents').upload(filePath, currentFile);
        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(filePath);

        uploadedAttachments.push({
          file_name: currentFile.name,
          file_url: publicUrl,
          type: 'Dokumen_Awal'
        });
      }

      const primaryFileUrl = uploadedAttachments[0]?.file_url || null;

      const { data: newRequest, error: insertError } = await supabase
        .from('requests')
        .insert([
          {
            ticket_number: ticketNumber,
            user_id: userProfile.id,
            category_id: parseInt(categoryId),
            sub_category_id: categoryId === '4' ? (subCategory ? parseInt(subCategory) : null) : null,
            request_title: requestTitle,
            description: description,
            status: 'Dikirim',
            file_url: primaryFileUrl,
            total_hold_days: 0,
            urgency: urgency,
          },
        ])
        .select()
        .single();

      if (insertError) throw insertError;

      insertedRequestId = newRequest.id;

      if (uploadedAttachments.length > 0) {
        const attachmentsPayload = uploadedAttachments.map((att) => ({
          request_id: newRequest.id,
          file_name: att.file_name,
          file_url: att.file_url,
          uploaded_by: userProfile.id,
          type: att.type
        }));

        const { error: attachError } = await supabase.from('attachments').insert(attachmentsPayload);
        if (attachError) throw attachError;
      }

      await supabase.from('request_logs').insert([
        { request_id: newRequest.id, changed_by: userProfile.id, status_before: null, status_after: 'Dikirim', notes: 'Dokumen berhasil diajukan ke antrean pusat' }
      ]);

      try {
        const emailRes = await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticketNumber: ticketNumber,
            title: requestTitle,
            status: 'Dikirim (Menunggu Antrean)',
            notes: 'Dokumen Anda berhasil dikirim ke sistem dan menunggu verifikasi oleh pihak PIC.',
            recipientEmail: userProfile?.email,
            recipientName: userProfile?.fullName
          }),
        });

        if (!emailRes.ok) {
           console.warn('API Email menolak pengiriman:', await emailRes.json());
        }
      } catch (emailErr) {
        console.error('Jaringan terputus saat kirim notif email tiket baru:', emailErr);
      }

      try {
        await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticketNumber: ticketNumber,
            title: requestTitle,
            status: 'Dikirim (Menunggu Antrean)',
            notes: 'Dokumen berhasil masuk ke sistem antrean pusat dan menunggu penanganan oleh PIC.',
            recipientEmail: userProfile?.email,
            recipientName: userProfile?.fullName
          }),
        });
      } catch (emailErr) {
        console.error('Gagal mengirimkan email notifikasi:', emailErr);
      }

      notifications.show({
        title: 'Pengajuan Berhasil Dikirim',
        message: `Tiket nomor ${ticketNumber} telah sukses dikirim ke sistem.`,
        color: 'green',
        autoClose: 5000,
      });

      setRequestTitle('');
      setDescription('');
      setCategoryId('');
      setFiles([]);
      setUrgency(null);``

      fetchUserRequests(userProfile.id);
      setActiveMenu(1);

    } catch (error: any) {
      if (insertedRequestId) {
        await supabase.from('requests').delete().eq('id', insertedRequestId);
      }

      notifications.show({ title: 'Gagal Membuat Pengajuan', message: error.message, color: 'red' });
    } finally {
      setFormLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const getStatusColor = (status: string) => {
    if (status.startsWith('Sedang Ditangguhkan') || status.startsWith('Sedang Ditahan')) return 'orange';
    if (status === 'Disetujui' || status === 'Disetujui Seluruh Pihak' || status === 'Selesai (Rilis PRD)') return 'green';
    if (status === 'Ditolak') return 'red'
    if (status === 'Dikirim') return 'cyan';
    return 'blue';
  };

  const getFilteredAndSortedRequests = () => {
    let filtered = [...myRequests];

    if (searchQuery.trim() !== '') {
      const cleanQuery = searchQuery.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      filtered = filtered.filter((req) => {
        const cleanTicket = req.ticket_number.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        return cleanTicket.includes(cleanQuery);
      });
    }

    if (!sortKey || !sortDirection) return filtered;

    return filtered.sort((a, b) => {
      let valA: any = '';
      let valB: any = '';

      if (sortKey === 'ticket') { valA = a.ticket_number; valB = b.ticket_number; }
        else if (sortKey === 'title') { valA = a.categories?.name; valB = b.categories?.name; }
        else if (sortKey === 'date') { valA = new Date(a.created_at).getTime(); valB = new Date(b.created_at).getTime(); }
        else if (sortKey === 'status') { valA = a.status; valB = b.status; }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const handleSortRequest = (key: string) => {
    if (sortKey === key) {
      if (sortDirection === 'asc') setSortDirection('desc');
      else if (sortDirection === 'desc') { setSortKey(null); setSortDirection(null); }
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const renderSortArrow = (key: string) => {
    if (sortKey !== key) return <Text component="span" size="xs" c="slateClean.3" ml={5}> ↕</Text>;
    if (sortDirection === 'asc') return <Text component="span" size="xs" c="ptpn4Green.9" ml={5}> ▲</Text>;
    return <Text component="span" size="xs" c="ptpn4Green.9" ml={5}> ▼</Text>;
  };

  const calculateTotalSlaDays = (createdAtString: string, status: string, newTotalHoldDays: number, updatedAtString?: string | null) => {
    const created = new Date(createdAtString).getTime();
      const isFinal = status === 'Disetujui' || status === 'Ditolak' || status === 'Selesai (Rilis PRD)';
      const isCurrentlyHold = status.startsWith('Sedang Ditangguhkan di');

      const endTime = (isFinal && updatedAtString)
        ? new Date(updatedAtString).getTime()
        : new Date().getTime();

      const totalElapsedDays = Math.floor((endTime - created) / (1000 * 60 * 60 * 24));

      let finalHoldDays = newTotalHoldDays || 0;

      if (isCurrentlyHold && updatedAtString) {
        const holdStart = new Date(updatedAtString).getTime();
        const currentHoldDuration = Math.floor((new Date().getTime() - holdStart) / (1000 * 60 * 60 * 24));
        finalHoldDays += currentHoldDuration;
      }

      const netSlaDays = totalElapsedDays - (newTotalHoldDays || 0);

      return netSlaDays <= 0 ? '1 Hari' : `${netSlaDays} Hari`;
  };

  const totalCount = myRequests.length;
  const processCount = myRequests.filter(r => r.status.startsWith('Dalam Proses') || r.status === 'Dikirim').length;
  const holdCount = myRequests.filter(r => r.status.startsWith('Sedang Ditangguhkan') || r.status.startsWith('Sedang Ditahan')).length;
  const archivedCount = myRequests.filter(r => r.status === 'Disetujui' || r.status === 'Ditolak').length;

  const activeCategoryLabel = categories.find(c => c.value === categoryId)?.label || '';
  const isTiketCategory = activeCategoryLabel.toLowerCase().includes('tiket');

  if (loading || !userProfile) return <Text ta="center" mt="xl" c="dimmed" fw={500}>Memuat dashboard...</Text>;

  return (
    <AppShell
      header={{ height: 75 }}
      navbar={{ width: 280, breakpoint: 'sm' }}
      padding="xl"
    >

      <AppShell.Header bg="white" px="xl" style={{ borderBottom: '1px solid rgba(226, 232, 240, 0.8)' }}>
          <Group justify="space-between" h="100%">
            <Group gap="lg" h="100%">
              <Avatar src={null} alt="PIC Monitor" color="ptpn4Green.9" radius="xl">PIC
              </Avatar>
                <Box>
                  <Text size="sm" fw={600} c="slateClean.9">Halo, {currentUserName}</Text>
                  <Text size="xs" c="dimmed">Selamat datang di {process.env.NEXT_PUBLIC_APP_NAME}</Text>
                </Box>
            </Group>

            <Group gap="lg" h="100%">
              <ActionIcon variant="subtle" color="gray" radius="xl" size="lg" style={{ position: 'relative' }}>
                <IconBell size={20} stroke={1.5} />
                {holdCount > 0 && (
                  <Box style={{ position: 'absolute', top: 6, right: 6, width: 8, height: 8, backgroundColor: '#f59e0b', borderRadius: '50%' }} />
                )}
              </ActionIcon>
            </Group>
          </Group>
        </AppShell.Header>

      <AppShell.Navbar p="md" bg="white" style={{ borderRight: 'none' }}>
        <Stack justify="between" h="100%">
          <Box>
            <Group px="sm" py="md" mb="xl">
              <Box bg="ptpn4Green.0" p="xs" style={{ borderRadius: '12px', display: 'flex', alignItems: 'center' }}>
                <IconChecklist size={24} color="#0e422a" />
              </Box>
              <Text fw={800} size="xl" lts="tight" c="ptpn4Green.9">{process.env.NEXT_PUBLIC_APP_NAME}</Text>
            </Group>

            <Stack gap={4}>
              <Text size="xs" fw={700} c="slateClean.4" px="sm" mb={4} lts="0.5px">MENU UTAMA</Text>

              <NavLink
                label="Buat Pengajuan"
                leftSection={<IconFilePlus size={18} stroke={1.5} />}
                active={activeMenu === 0}
                onClick={() => setActiveMenu(0)}
                style={{ borderRadius: 'var(--mantine-radius-md)' }}
                py="sm"
              />

              <NavLink
                label="Lacak Status Tiket"
                leftSection={<IconHistory size={18} stroke={1.5} />}
                active={activeMenu === 1}
                onClick={() => setActiveMenu(1)}
                style={{ borderRadius: 'var(--mantine-radius-md)' }}
                py="sm"
                rightSection={processCount > 0 ? <Badge size="xs" color="ptpn4Green.9" variant="filled">{processCount}</Badge> : null}
              />

              <Divider my="sm" />
              <NavLink label="Keluar Aplikasi" leftSection={<IconLogout size={18} stroke={1.5} />} color="red" py="sm" onClick={handleLogout} />
            </Stack>
          </Box>
        </Stack>
      </AppShell.Navbar>
      <AppShell.Main>

        {activeMenu === 0 && (
          <Box style={{ maxWidth: '1700px', margin: '0 auto' }}>
            <Box mb="xl">
              <Stack gap="xs">
                <Text size="28px" fw={800} c="slateClean.9" style={{ letterSpacing: '-0.5px' }}>Formulir Pengajuan Dokumen</Text>
                <Text size="sm" c="dimmed">Isi kelengkapan data pada formulir berikut untuk mengajukan permohonan.</Text>
             </Stack>
            </Box>

            <Paper p="xl">
              <Group mb="sm" gap="xs">
                <Text fw={800} size="xl" c="slateClean.9">Detail Pengajuan</Text>
              </Group>

              <form onSubmit={handleUploadAndSubmit}>
                <Stack gap="md">
                  <Select
                    label="Kategori Pengajuan"
                    placeholder="Pilih kategori yang sesuai"
                    data={categories}
                    searchable
                    required
                    value={categoryId}
                    onChange={(value) => setCategoryId(value || '')}
                    radius="md"
                  />
                  {subCategoryOptions.length > 0 && (
                    <Select
                      label="Sub-Kategori Tiket"
                      placeholder="Pilih tipe permasalahan yang sesuai"
                      required
                      searchable
                      value={subCategory}
                      onChange={setSubCategory}
                      data={subCategoryOptions}
                      radius="md"
                    />
                  )}
                  <TextInput
                    label="Judul Pengajuan"
                    placeholder="Contoh: Pengajuan Akses Akun SAP"
                    required
                    value={requestTitle}
                    onChange={(e) => setRequestTitle(e.target.value)}
                    radius="md"
                  />
                  <Select
                    label="Tingkat Urgensi"
                    placeholder="Pilih tingkat urgensi dokumen"
                    data={[
                      { value: 'Rendah', label: '🟢 Rendah (Biasa)' },
                      { value: 'Sedang', label: '🟡 Sedang (Butuh Perhatian)' },
                      { value: 'Tinggi', label: '🔴 Tinggi (Prioritas Utama)' },
                    ]}
                    required
                    value={urgency}
                    onChange={setUrgency}
                    radius="md"
                  />
                  <Textarea
                    label="Deskripsi Pengajuan"
                    placeholder="Berikan deskripsi secara singkat dan jelas"
                    rows={5}
                    value={description}
                    required
                    onChange={(e) => setDescription(e.target.value)}
                    radius="md"
                  />
                  <FileInput
                    label="Unggah Dokumen Pengajuan (.PDF)"
                    placeholder={isTiketCategory ? "Opsional (dalam format .PDF)" : "Pilih dokumen dari perangkat Anda"}
                    required={!isTiketCategory}
                    withAsterisk={!isTiketCategory}
                    value={files}
                    onChange={setFiles}
                    accept="application/pdf"
                    multiple
                    radius="md"
                  />
                  <Button type="submit" loading={formLoading} color="ptpn4Green.9" fullWidth mt="lg" size="md" radius="md">
                    Kirim Pengajuan
                  </Button>
                </Stack>
              </form>
            </Paper>
          </Box>
        )}

        {activeMenu === 1 && (
          <Box>
            <Box mb="xl">
              <Stack gap="xs">
                <Text size="28px" fw={800} c="slateClean.9" style={{ letterSpacing: '-0.5px' }}>Monitoring & Pelacakan Dokumen</Text>
                <Text size="sm" c="dimmed">Pantau pengajuan anda.</Text>
              </Stack>
            </Box>

            <SimpleGrid cols={{ base: 1, sm: 4 }} spacing="lg" mb="xl">
              <Paper bg="ptpn4Green.9" p="xl" style={{ position: 'relative', color: '#fff' }}>
                <Text size="xs" fw={700} c="ptpn4Green.2" lts="0.5px">TOTAL PENGAJUAN SAYA</Text>
                <Text size="36px" fw={800} my="xs">{totalCount}</Text>
                <Text size="xs" c="ptpn4Green.1" fw={500}>Seluruh riwayat pengajuan</Text>
              </Paper>
              <Paper p="xl">
                <Text size="xs" fw={700} c="slateClean.4" lts="0.5px">TIKET DALAM PROSES</Text>
                <Text size="36px" fw={800} my="xs" c="slateClean.9">{processCount}</Text>
                <Text size="xs" c="blue.6" fw={500}>Dalam peninjauan</Text>
              </Paper>
              <Paper p="xl">
                <Text size="xs" fw={700} c="slateClean.4" lts="0.5px">TIKET DITANGGUHKAN</Text>
                <Text size="36px" fw={800} my="xs" c="slateClean.9">{holdCount}</Text>
                <Text size="xs" c="orange.6" fw={500}>Penangguhan aktif</Text>
              </Paper>
              <Paper p="xl">
                <Text size="xs" fw={700} c="slateClean.4" lts="0.5px">TIKET SELESAI</Text>
                <Text size="36px" fw={800} my="xs" c="slateClean.9">{archivedCount}</Text>
                <Text size="xs" c="green.6" fw={500}>Telah diselesaikan</Text>
              </Paper>
            </SimpleGrid>

            <Paper p="xl">
              <TextInput
                placeholder="Ketik nomor tiket secara dinamis (cth: req2026)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                leftSection={<IconSearch size={16} stroke={1.5} color="#64748b" />}
                mb="xl"
                w={{ base: '100%', sm: 340 }}
                styles={{ input: { backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' } }}
              />

              <Table verticalSpacing="md" horizontalSpacing="md" highlightOnHover variant="simple" striped>
                <Table.Thead bg="slateClean.0">
                  <Table.Tr>
                    <Table.Th style={{ cursor: 'pointer' }} w={250} onClick={() => handleSortRequest('ticket')}>
                      <Text size="xs" fw={700} c="slateClean.5">NO. TIKET{renderSortArrow('ticket')}</Text>
                    </Table.Th>
                    <Table.Th w={300} style={{ cursor: 'pointer' }} onClick={() => handleSortRequest('title')}>
                      <Text size="xs" fw={700} c="slateClean.5">JUDUL / JENIS{renderSortArrow('title')}</Text>
                    </Table.Th>
                    <Table.Th>
                      <Text size="xs" fw={700} c="slateClean.5">DURASI</Text>
                    </Table.Th>
                    <Table.Th w={230}style={{ cursor: 'pointer' }} onClick={() => handleSortRequest('date')}>
                      <Text size="xs" fw={700} c="slateClean.5">TANGGAL KIRIM{renderSortArrow('date')}</Text>
                    </Table.Th>
                    <Table.Th w={280}>
                      <Text size="xs" fw={700} c="slateClean.5">PIC</Text>
                    </Table.Th>
                    <Table.Th w={300} style={{ cursor: 'pointer' }} onClick={() => handleSortRequest('status')}>
                      <Text size="xs" fw={700} c="slateClean.5">STATUS SAAT INI{renderSortArrow('status')}</Text>
                    </Table.Th>
                  </Table.Tr>
                </Table.Thead>

                <Table.Tbody>
                  {getFilteredAndSortedRequests().length === 0 ? (
                    <Table.Tr>
                      <Table.Td colSpan={6} ta="center" py="xl">
                        <Stack gap="xs" align="center" py="md">
                          <IconInfoCircle size={24} color="#94a3b8" />
                          <Text fw={700} c="slateClean.8" size="sm">Data Tiket Tidak Ditemukan</Text>
                          <Text size="xs" c="dimmed" w={280}>Tidak ada tiket yang sesuai dengan filter pencarian.</Text>
                        </Stack>
                      </Table.Td>
                    </Table.Tr>
                  ) : (
                    getFilteredAndSortedRequests().map((req) => {
                      const finalAttachment = req.attachments?.find((att: any) => att.type === 'Dokumen_Final');

                      const effectiveSlaDays = (req.categories?.id === 4 || req.categories?.name === 'Tiket')
                        ? req.sub_categories?.sla_days
                        : req.categories?.sla_days;

                      return (
                        <Table.Tr key={req.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <Table.Td>
                            <Stack gap={2} align="flex-start">
                            <Tooltip label="Klik untuk melihat riwayat pengajuan" position="top" withArrow>
                              <Text
                                fw={700}
                                size="sm"
                                c="ptpn4Green.9"
                                style={{ cursor: 'pointer', display: 'inline-block' }}
                                onClick={() => handleOpenTimeline(req)}
                              >
                                {req.ticket_number} 📋
                              </Text>
                            </Tooltip>

                            <Badge
                              color={req.urgency === 'Tinggi' ? 'red' : req.urgency === 'Sedang' ? 'orange' : 'gray'}
                              variant="filled"
                              size="xs"
                              styles={{ root: { textTransform: 'none', height: '17px', padding: '0 4px' } }}
                            >
                              {req.urgency || 'Sedang'}
                            </Badge>
                          </Stack>
                          </Table.Td>

                          <Table.Td>
                            <Text size="sm" fw={500} c="slateClean.7">{req.request_title}</Text>
                            <Text size="11px" c="dimmed">
                              {req.categories?.name || 'Tidak Diketahui'}
                                {(req.categories?.id === 4 || req.categories?.name === 'Tiket Lainnya')
                                && req.sub_categories?.name ? ` (${req.sub_categories.name}) ` : ' '}
                               | Batas: {effectiveSlaDays ?? 0} Hari
                            </Text>
                          </Table.Td>

                          <Table.Td>
                            <Stack gap={2}>
                              <Text size="sm" fw={700} c="slateClean.9">
                                {calculateTotalSlaDays(req.created_at, req.status, req.total_hold_days, req.updated_at)}
                              </Text>
                              {req.total_hold_days > 0 && (
                                <Text size="11px" color="orange.7" fw={600}>Total Hold: {req.total_hold_days} Hari</Text>
                              )}
                            </Stack>
                          </Table.Td>

                          <Table.Td>
                            <Text size="sm" c="slateClean.7">
                              {new Date(req.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </Text>
                          </Table.Td>

                          <Table.Td>
                            {req.pic?.full_name ? (
                              <Group gap="xs" wrap="nowrap">
                                <Avatar size="24px" radius="xl" color="ptpn4Green.9" bg="ptpn4Green.0">
                                  {req.pic.full_name.slice(0, 2).toUpperCase()}
                                </Avatar>
                                <Text size="sm" fw={600} c="slateClean.8">
                                  {req.pic.full_name}
                                </Text>
                              </Group>
                            ) : (
                              <Badge color="gray.4" variant="outline" radius="sm" c="dimmed" style={{ borderStyle: 'dashed', textTransform: 'none' }}>
                                Belum Diproses PIC
                              </Badge>
                            )}
                          </Table.Td>

                          <Table.Td>
                            <Group gap="md">
                              <Badge color={getStatusColor(req.status)} variant="light" radius="sm" py="md">
                                {req.status}
                              </Badge>

                              {finalAttachment && (
                                <Button
                                  component="a"
                                  href={finalAttachment.file_url}
                                  target="_blank"
                                  download
                                  size="xs"
                                  color="green"
                                  variant="filled"
                                  w={150}
                                  h={35}
                                  leftSection={<IconDownload size={12} />}
                                >
                                  Unduh Hasil Akhir
                                </Button>
                              )}
                            </Group>
                          </Table.Td>
                        </Table.Tr>
                      );
                    })
                  )}
                </Table.Tbody>
              </Table>
            </Paper>
          </Box>
        )}

        <Drawer
          opened={selectedRequest !== null}
          onClose={() => setSelectedRequest(null)}
          title={
            <Group gap="xs">
              <Badge color="ptpn4Green.9" variant="filled" radius="sm">
                {selectedRequest?.ticket_number}
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
          {selectedRequest && (
            <Stack gap="lg" mt="md">
              {}
              <Box>
                <Text size="xs" c="dimmed" fw={600} mb={2}>JUDUL PENGAJUAN SAYA</Text>
                <Text fw={700} size="md" c="slateClean.9" mb="xs">{selectedRequest.request_title}</Text>
                <Badge color="blue" variant="light">{selectedRequest.categories?.name}</Badge>
              </Box>

              <Box>
                <Text size="xs" c="dimmed" fw={600} mb={4}>DESKRIPSI YANG DIAJUKAN</Text>
                <Paper p="md" withBorder radius="md" bg="#f8fafc" style={{ borderColor: '#e2e8f0' }}>
                  <Text size="sm" c="slateClean.7" style={{ whiteSpace: 'pre-line', lineHeight: '1.6' }}>
                    {selectedRequest.description || 'Tidak ada deskripsi tertulis.'}
                  </Text>
                </Paper>
              </Box>

              {selectedRequest.attachments && selectedRequest.attachments.length > 0 && (
              <Box>
                <Text size="xs" c="dimmed" fw={600} mb={4}>LAMPIRAN BERKAS AWAL ({selectedRequest.attachments.filter((a: any) => a.type === 'Dokumen_Awal').length} File)</Text>
                <Stack gap="xs">
                  {selectedRequest.attachments
                    .filter((att: any) => att.type === 'Dokumen_Awal')
                    .map((file: any, idx: number) => (
                      <Button
                        key={file.id || idx}
                        component="a"
                        href={file.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        variant="outline"
                        color="ptpn4Green.9"
                        fullWidth
                        leftSection={<IconDownload size={16} />}
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
                            fw={700}
                            size="xs"
                            c={isCurrentStatus ? 'ptpn4Green.9' : 'slateClean.8'}
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

      </AppShell.Main>
    </AppShell>
  );
}
