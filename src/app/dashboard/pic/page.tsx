  'use client';

  import { useState, useEffect } from 'react';
  import { useRouter } from 'next/navigation';
  import { supabase } from '../../../lib/supabase';
  import { notifications } from '@mantine/notifications';
  import {
    AppShell, SimpleGrid, Paper, Text, Group, Badge, Avatar, Table, Menu, ActionIcon, TextInput,
    NavLink, Stack, Box, Kbd, Tooltip, Modal, Timeline, FileInput, Textarea, Button, Drawer, Divider
  } from '@mantine/core';
  import {
    IconLayoutDashboard, IconFileText, IconClock, IconChecklist, IconSettings, IconLogout, IconSearch, IconBell,
    IconMail, IconDotsVertical, IconCheck, IconX, IconAlertCircle, IconArrowUpRight, IconDownload, IconEye
  } from '@tabler/icons-react';

  interface RequestItem {
    id: string;
    ticket_number: string;
    request_title: string;
    description: string;
    status: string;
    total_hold_days: number;
    created_at: string;
    updated_at?: string | null;
    profiles: { full_name: string; division: string; email?: string } | null;
    categories: { name: string; sla_days: number } | null;
    file_url?: string | null;
    current_pic_id?: string | null;
    pic?: { full_name: string } | null;
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
    const [currentUserName, setCurrentUserName] = useState('PIC');
    const [requests, setRequests] = useState<RequestItem[]>([]);
    const [loading, setLoading] = useState(true);

    const [finalUploadRequest, setFinalUploadRequest] = useState<any | null>(null);
    const [finalFile, setFinalFile] = useState<File | null>(null);
    const [uploadingFinal, setUploadingFinal] = useState(false);

    const [selectedRequest, setSelectedRequest] = useState<RequestItem | null>(null);
    const [historyLogs, setHistoryLogs] = useState<HistoryLog[]>([]);
    const [loadingTimeline, setLoadingTimeline] = useState(false);

    const [rejectRequest, setRejectRequest] = useState<RequestItem | null>(null);
    const [rejectReason, setRejectReason] = useState('');
    const [rejecting, setRejecting] = useState(false);

    const [activeMenu, setActiveMenu] = useState(0);

    const [confirmNextRequest, setConfirmNextRequest] = useState<RequestItem | null>(null);
    const [confirmHoldRequest, setConfirmHoldRequest] = useState<RequestItem | null>(null);

    const [sortKey, setSortKey] = useState<string | null>('duration');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>('desc');

    const [searchQuery, setSearchQuery] = useState('');

    const [selectedDetail, setSelectedDetail] = useState<RequestItem | null>(null);

    const [holdReason, setHoldReason] = useState('');

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

      const { data: profileData } = await supabase
        .from('profiles')
        .select('full_name, role')
        .eq('id', user.id)
        .maybeSingle();

      if (!profileData || profileData.role !== 'PIC') {
        notifications.show({
          title: 'Akses Ditolak',
          message: 'Akun Anda tidak memiliki hak akses yang cukup.',
          color: 'red',
        });
        await supabase.auth.signOut();
        router.push('/login');
        return;
      }

      const profileName = profileData.full_name || 'PIC';
      setCurrentUserName(profileName);

      const { data } = await supabase
        .from('requests')
        .select(`
          id, ticket_number, request_title, description, status, total_hold_days, created_at, updated_at, file_url, current_pic_id,
          profiles:user_id (full_name, division, email),
          categories:category_id (name, sla_days),
          pic:current_pic_id (full_name)
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

    const handleOpenDetailAndLogs = async (req: RequestItem) => {
      setSelectedDetail(req);
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

    const updateDatabaseStatus = async (id: string, payload: any, logStatusName: string, notes: string = 'Sinkronisasi status birokrasi manual oleh PIC') => {
      try {
        const targetRequest = requests.find(r => r.id === id);

        if (targetRequest) {
          try {
            await fetch('/api/send-email', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ticketNumber: targetRequest.ticket_number,
                title: targetRequest.request_title,
                status: logStatusName,
                notes: notes,
                recipientEmail: 'mhasticmusic@gmail.com',
                recipientName: 'Stakeholder DocuTrack'
              }),
            });
          } catch (emailErr) {
            console.error('Gagal mengirim email mutasi:', emailErr);
          }
        }

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
          throw new Error("Gagal menyimpan! Database menolak update status ini.");
        }

        await supabase.from('request_logs').insert([
          {
            request_id: id,
            changed_by: currentPicId,
            status_before: requests.find(r => r.id === id)?.status || null,
            status_after: logStatusName,
            notes: notes
          }
        ]);

        setRequests((prev) =>
          prev.map((r) => (r.id === id ? { ...r, ...payload } : r))
        );

        notifications.show({
          title: 'Status Berhasil Diperbarui',
          message: `Tiket berhasil dipindahkan ke fase: ${logStatusName}`,
          color: logStatusName === 'Ditolak' ? 'red' : 'green',
          autoClose: 4000,
        });

      } catch (err: any) {
        notifications.show({
          title: 'Sistem Gagal Memperbarui',
          message: err.message,
          color: 'red',
          autoClose: 5000,
        });
      }
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
        default:
          alert(`Gagal Maju: Status "${req.status}" tidak dikenali.`);
          return;
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

          await updateDatabaseStatus(finalUploadRequest.id, { status: 'Disetujui' }, 'Disetujui', 'Berkas disetujui. Berkas form final dilampirkan.');

          notifications.show({
            title: 'Dokumen Akhir Disahkan',
            message: `Berkas final untuk ${finalUploadRequest.ticket_number} sukses diunggah ke cloud storage.`,
            color: 'green',
          });

          setFinalUploadRequest(null);
          setFinalFile(null);
      } catch (err: any) {
          notifications.show({
            title: 'Gagal Mengesahkan Dokumen',
            message: err.message,
            color: 'red',
          });
      } finally {
          setUploadingFinal(false);
      }
    };

    const handleToggleHold = async (req: RequestItem, notes: string = holdReason) => {
      const nowStr = new Date().toISOString();
      let nextStatus = '';

      if (req.status.startsWith('Dalam Proses oleh')) {
        if (req.status.includes('PIC')) nextStatus = 'Sedang Ditangguhkan di PIC';
        else if (req.status.includes('Head Office')) nextStatus = 'Sedang Ditangguhkan di Head Office';
        else if (req.status.includes('Holding')) nextStatus = 'Sedang Ditangguhkan di Holding';
        else if (req.status.includes('Konsultan')) nextStatus = 'Sedang Ditangguhkan di Konsultan';

        if (!nextStatus) {
          notifications.show({ title: 'Gagal Memproses', message: `Sub-status tidak dikenali dari "${req.status}"`, color: 'red' });
          return;
        }

        try {
          const { error: holdError } = await supabase.from('request_holds').insert([
            { request_id: req.id, hold_reason: `Penangguhan berkas pada fase ${req.status}`, hold_start: nowStr }
          ]);
          if (holdError) throw holdError;

          const { error: reqError } = await supabase.from('requests').update({ status: nextStatus, updated_at: nowStr }).eq('id', req.id);
          if (reqError) throw reqError;

          const { error: logError } = await supabase.from('request_logs').insert([
            { request_id: req.id, changed_by: currentPicId, status_before: req.status, status_after: nextStatus, notes: holdReason.trim() !== '' ? notes : 'Pengajuan ditangguhkan sementara' }
          ]);
          if (logError) throw logError;

          try {
            await fetch('/api/send-email', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ticketNumber: req.ticket_number,
                title: req.request_title,
                status: nextStatus,
                notes: 'Pengajuan ditangguhkan sementara karena diperlukan peninjauan lebih lanjut.',
                recipientEmail: 'mhasticmusic@gmail.com',
                recipientName: 'Stakeholder DocuTrack'
              }),
            });
          } catch (e) { console.error(e); }

          setRequests((prev) => prev.map((r) => (r.id === req.id ? { ...r, status: nextStatus, updated_at: nowStr } : r)));

          notifications.show({
            title: 'SLA Berhasil Ditangguhkan',
            message: `Tiket ${req.ticket_number} kini berstatus Hold aktif.`,
            color: 'orange',
          });

        } catch (err: any) {
          notifications.show({ title: 'Eror Supabase (Hold)', message: err.message, color: 'red' });
        }

      } else if (req.status.startsWith('Sedang Ditangguhkan di')) {
        if (req.status.includes('PIC')) nextStatus = 'Dalam Proses oleh PIC';
        else if (req.status.includes('Head Office')) nextStatus = 'Dalam Proses oleh Head Office';
        else if (req.status.includes('Holding')) nextStatus = 'Dalam Proses oleh Holding';
        else if (req.status.includes('Konsultan')) nextStatus = 'Dalam Proses oleh Konsultan';

        if (!nextStatus) {
          notifications.show({ title: 'Gagal Memproses', message: `Sub-status tidak dikenali dari "${req.status}"`, color: 'red' });
          return;
        }

        try {
          const { data: holdRows, error: fetchHoldError } = await supabase
            .from('request_holds')
            .select('id, hold_start')
            .eq('request_id', req.id)
            .is('hold_end', null)
            .order('hold_start', { ascending: false });

          if (fetchHoldError) throw fetchHoldError;

          let diffDays = 0;

          if (holdRows && holdRows.length > 0) {
            const activeHold = holdRows[0];
            const startTime = new Date(activeHold.hold_start).getTime();
            const endTime = new Date().getTime();
            diffDays = Math.floor((endTime - startTime) / (1000 * 60 * 60 * 24));

            const { error: updateHoldError } = await supabase
              .from('request_holds')
              .update({ hold_end: nowStr, duration_days: diffDays })
              .eq('id', activeHold.id);

            if (updateHoldError) throw updateHoldError;

            if (holdRows.length > 1) {
              const duplicateIds = holdRows.slice(1).map(h => h.id);
              await supabase
                .from('request_holds')
                .update({ hold_end: nowStr, duration_days: 0, hold_reason: 'Pembersihan otomatis data ganda' })
                .in('id', duplicateIds);
            }
          }

          const newTotalHoldDays = (req.total_hold_days || 0) + diffDays;

          const { error: reqError } = await supabase
            .from('requests')
            .update({ status: nextStatus, total_hold_days: newTotalHoldDays, updated_at: nowStr })
            .eq('id', req.id);
          if (reqError) throw reqError;

          const actualNotes = notes.trim() !== '' ? notes : 'Proses kembali dilanjutkan.';

          const { error: logError } = await supabase.from('request_logs').insert([
            { request_id: req.id, changed_by: currentPicId, status_before: req.status, status_after: nextStatus, notes: actualNotes }
          ]);

          try {
            await fetch('/api/send-email', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ticketNumber: req.ticket_number,
                title: req.request_title,
                status: nextStatus,
                notes: 'Pengajuan dilanjutkan ke tahap berikutnya.',
                recipientEmail: 'mhasticmusic@gmail.com',
                recipientName: 'Stakeholder DocuTrack'
              }),
            });
          } catch (e) { console.error(e); }

          setRequests((prev) => prev.map((r) => (r.id === req.id ? { ...r, status: nextStatus, total_hold_days: newTotalHoldDays, updated_at: nowStr } : r)));

          notifications.show({
            title: 'Penangguhan Dilepas',
            message: `Proses Tiket ${req.ticket_number} kembali berjalan normal.`,
            color: 'green',
          });

        } catch (err: any) {
          notifications.show({ title: 'Eror Supabase (Unhold)', message: err.message, color: 'red' });
        }
      }
    };

    const handleRejectSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!rejectRequest || !rejectReason.trim()) return;
      setRejecting(true);

      try {
        await updateDatabaseStatus(
          rejectRequest.id,
          { status: 'Ditolak' },
          'Ditolak',
          `Alasan Penolakan: ${rejectReason}`
        );

        setRejectRequest(null);
        setRejectReason('');
      } catch (err: any) {
        alert(`Gagal menolak dokumen: ${err.message}`);
      } finally {
        setRejecting(false);
      }
    };

    const calculateTotalSlaDays = (createdAtString: string, status: string, newTotalHoldDays: number, updatedAtString?: string | null) => {
      const created = new Date(createdAtString).getTime();
      const isFinal = status === 'Disetujui' || status === 'Ditolak';

      const endTime = (isFinal && updatedAtString)
        ? new Date(updatedAtString).getTime()
        : new Date().getTime();

      const totalElapsedDays = Math.floor((endTime - created) / (1000 * 60 * 60 * 24));

      const netSlaDays = totalElapsedDays - (newTotalHoldDays || 0);

      return netSlaDays <= 0 ? '1 Hari' : `${netSlaDays} Hari`;
    };

    const totalCount = requests.length;
    const unassignedCount = requests.filter(r => r.status === 'Dikirim').length;
    const processCount = requests.filter(r => r.status.startsWith('Dalam Proses')).length;
    const holdCount = requests.filter(r => r.status.startsWith('Sedang Ditangguhkan')).length;
    const archivedCount = requests.filter(r => r.status === 'Disetujui' || r.status === 'Ditolak').length;

    const getFilteredAndSortedRequests = () => {

      let filtered = [...requests];

      if (searchQuery.trim() !== '') {
        const cleanQuery = searchQuery.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

        filtered = filtered.filter((req) => {
          const cleanTicket = req.ticket_number.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
          return cleanTicket.includes(cleanQuery);
        });
      }
      if (!sortKey || !sortDirection) return filtered;

      return [...filtered].sort((a, b) => {
        let valA: any = '';
        let valB: any = '';

        if (sortKey === 'ticket') { valA = a.ticket_number; valB = b.ticket_number; }
        else if (sortKey === 'applicant') { valA = a.profiles?.full_name || ''; valB = b.profiles?.full_name || ''; }
        else if (sortKey === 'title') { valA = a.categories?.name; valB = b.categories?.name; }
        else if (sortKey === 'duration') { valA = new Date(a.created_at).getTime(); valB = new Date(b.created_at).getTime(); }
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
                  <Text size="xs" c="dimmed">Selamat datang di DocuTrack</Text>
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
                <Text fw={800} size="xl" lts="tight" c="ptpn4Green.9">DocuTrack.</Text>
              </Group>

              <Stack gap={4}>
                <Text size="xs" fw={700} c="slateClean.4" px="sm" mb={4} lts="0.5px">MENU</Text>
                <NavLink
                  label="Overview"
                  leftSection={<IconLayoutDashboard size={18} stroke={1.5} />}
                  active={activeMenu === 0}
                  onClick={() => setActiveMenu(0)}
                  py="sm"
                />

                <Text size="xs" fw={700} c="slateClean.4" px="sm" mt="xl" mb={4} lts="0.5px">SISTEM</Text>
                <NavLink label="Konfigurasi SLA" leftSection={<IconSettings size={18} stroke={1.5} />} py="sm" />
                <NavLink label="Keluar Aplikasi" leftSection={<IconLogout size={18} stroke={1.5} />} color="dimmed" py="sm" onClick={() => router.push('/login')} />
              </Stack>
            </Box>

          </Stack>
        </AppShell.Navbar>

        <AppShell.Main>
          <Box mb="xl">
            <Stack gap="sm">
              <Text size="28px" fw={800} c="slateClean.9" style={{ letterSpacing: '-0.5px' }}>Daftar Tiket</Text>
              <Text size="sm" c="dimmed">Pantau tiket yang masuk, ubah status, dan kelola penangguhan.</Text>
            </Stack>
          </Box>

          <SimpleGrid cols={{ base: 1, sm: 5 }} spacing="lg" mb="xl">
            <Paper bg="ptpn4Green.9" p="xl" style={{ position: 'relative', color: '#fff' }}>
              <Text size="xs" fw={700} c="ptpn4Green.2" lts="0.5px">TOTAL TIKET MASUK</Text>
              <Text size="36px" fw={800} my="xs">{loading ? '...' : totalCount}</Text>
              <Text size="xs" c="ptpn4Green.1" fw={500}>Seluruh riwayat berkas</Text>
            </Paper>

            <Paper p="xl"> 
              <Group justify="space-between" wrap="nowrap">
                <Text size="xs" fw={700} c="slateClean.4" lts="0.5px">TIKET MENUNGGU RESPON</Text>
              </Group>
              <Text size="36px" fw={800} my="xs" c={unassignedCount > 0 ? "slateClean.9" : "slateClean.9"}>
                {loading ? '...' : unassignedCount}
              </Text>
              <Text size="xs" c="#ef4444" fw={500}>Tiket belum diproses</Text>
            </Paper>

            <Paper p="xl">
              <Text size="xs" fw={700} c="slateClean.4" lts="0.5px">TIKET DALAM PROSES</Text>
              <Text size="36px" fw={800} my="xs" c="slateClean.9">{loading ? '...' : processCount}</Text>
              <Text size="xs" c="blue.6" fw={500}>Dalam proses peninjauan</Text>
            </Paper>

            <Paper p="xl">
              <Text size="xs" fw={700} c="slateClean.4" lts="0.5px">TIKET DITANGGUHKAN</Text>
              <Text size="36px" fw={800} my="xs" c="slateClean.9">{loading ? '...' : holdCount}</Text>
              <Text size="xs" c="orange.6" fw={500}>Penangguhan aktif</Text>
            </Paper>

            <Paper p="xl">
              <Text size="xs" fw={700} c="slateClean.4" lts="0.5px">TIKET SELESAI</Text>
              <Text size="36px" fw={800} my="xs" c="slateClean.9">{loading ? '...' : archivedCount}</Text>
              <Text size="xs" c="green.6" fw={500}>Telah diselesaikan</Text>
            </Paper>
          </SimpleGrid>

          <Paper p="xl">
            {loading ? (
              <Text size="sm" c="dimmed" ta="center" py="xl">Mengambil data pengajuan...</Text>
            ) : (

              <Box>
              <TextInput
                  placeholder="Cari Nomor Tiket..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  leftSection={<IconSearch size={16} stroke={1.5} color="#64748b" />}
                  mb="xl"
                  w={{ base: '100%', sm: 360 }}
                  styles={{ input: { backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' } }}
                />

              <Table verticalSpacing="md" horizontalSpacing="md" highlightOnHover variant="simple">
                <Table.Thead bg="slateClean.0">
                  <Table.Tr>
                    <Table.Th style={{ borderBottom: '1px solid #e2e8f0', cursor: 'pointer' }} onClick={() => handleSortRequest('ticket')}>
                      <Text size="xs" fw={700} c="slateClean.5">NO. TIKET{renderSortArrow('ticket')}</Text>
                    </Table.Th>
                    <Table.Th style={{ borderBottom: '1px solid #e2e8f0', cursor: 'pointer' }} onClick={() => handleSortRequest('applicant')}>
                      <Text size="xs" fw={700} c="slateClean.5">PENGAJU{renderSortArrow('applicant')}</Text>
                    </Table.Th>
                    <Table.Th style={{ borderBottom: '1px solid #e2e8f0', cursor: 'pointer' }} onClick={() => handleSortRequest('title')}>
                      <Text size="xs" fw={700} c="slateClean.5">JUDUL / JENIS{renderSortArrow('title')}</Text>
                    </Table.Th>
                    <Table.Th style={{ borderBottom: '1px solid #e2e8f0', cursor: 'pointer' }} onClick={() => handleSortRequest('duration')}>
                      <Text size="xs" fw={700} c="slateClean.5">DURASI{renderSortArrow('duration')}</Text>
                    </Table.Th>
                    <Table.Th style={{ borderBottom: '1px solid #e2e8f0', cursor: 'pointer' }} onClick={() => handleSortRequest('status')}>
                      <Text size="xs" fw={700} c="slateClean.5">STATUS{renderSortArrow('status')}</Text>
                    </Table.Th>
                    <Table.Th style={{ borderBottom: '1px solid #e2e8f0' }} w={320}>
                      <Text size="xs" fw={900} c="slateClean.5">AKSI</Text>
                    </Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>

                {getFilteredAndSortedRequests().length === 0 ? (
                    <Table.Tr>
                      <Table.Td colSpan={7} ta="center" py="xl" style={{ backgroundColor: '#ffffff' }}>
                        <Stack gap="xs" align="center" py="md">
                          <Text size="xl" style={{ fontSize: '24px' }}>🔍</Text>
                          <Text fw={700} c="slateClean.8" size="sm">
                            Nomor Tiket Tidak Ditemukan
                          </Text>
                          <Text size="xs" c="dimmed" w={300}>
                            Tidak ada data tiket yang cocok dengan kata kunci "{searchQuery}". Periksa kembali kombinasi huruf atau penomoran tiket Anda.
                          </Text>
                        </Stack>
                      </Table.Td>
                    </Table.Tr>
                  ) : (

                  getFilteredAndSortedRequests().map((req) => {
                    const isFinal = req.status === 'Disetujui' || req.status === 'Ditolak';
                    const isHoldState = req.status.startsWith('Sedang Ditangguhkan di');
                    const canHold = req.status.includes('PIC') || req.status.includes('Head Office') || req.status.includes('Holding') || req.status.includes('Konsultan') || req.status.startsWith('Dalam Proses oleh');
                    const isLockedByOtherPic = req.current_pic_id && req.current_pic_id !== currentPicId;

                    return (
                      <Table.Tr key={req.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <Table.Td>
                          <Tooltip label="Klik untuk melihat riwayat pengajuan" position="top" withArrow>
                            <Text
                              fw={700}
                              size="sm"
                              c="ptpn4Green.9"
                              style={{ cursor: 'pointer', display: 'inline-block' }}
                              onClick={() => handleOpenDetailAndLogs(req)}
                            >
                              {req.ticket_number} 📋
                            </Text>
                          </Tooltip>
                        </Table.Td>

                        <Table.Td>
                          <Text size="sm" fw={600} c="slateClean.8">{req.profiles?.full_name || 'Tanpa Nama'}</Text>
                          <Text size="xs" c="dimmed">{req.profiles?.division || 'Divisi Umum'}</Text>
                        </Table.Td>

                        <Table.Td>
                          <Text size="sm" fw={500} c="slateClean.7">{req.request_title}</Text>
                          <Text size="11px" c="dimmed">{req.categories?.name || 'Tidak Diketahui'} | Batas: {req.categories?.sla_days ?? 0} Hari</Text>
                        </Table.Td>

                        <Table.Td>
                          <Stack gap={2}>
                            <Text size="sm" fw={700} c="slateClean.8">
                              {calculateTotalSlaDays(req.created_at, req.status, req.total_hold_days, req.updated_at)}
                            </Text>
                            {req.total_hold_days >= 0 && (
                              <Text size="11px" color="orange.7" fw={600}>Penangguhan: {req.total_hold_days} Hari</Text>
                            )}
                          </Stack>
                        </Table.Td>

                        <Table.Td>
                          <Badge
                            color={isHoldState ? 'orange' : req.status === 'Disetujui' ? 'green' : req.status === 'Ditolak' ? 'red' : 'blue'}
                            variant="light"
                            radius="sm"
                            py="md"
                          >
                            {req.status}
                          </Badge>
                        </Table.Td>

                        <Table.Td>
                          <Group gap="xs" wrap="nowrap">

                            {isFinal ? (
                              <Text size="xs" c="slateClean.4" fw={500} style={{ fontStyle: 'italic' }}>
                                Pengajuan Selesai Diproses
                              </Text>
                            ) : isLockedByOtherPic ? (
                              <Badge color="gray.4" variant="outline" radius="sm" c="dimmed" size="sm" fw="500" style={{ borderStyle: 'dashed', textTransform: 'none' }}>
                                🔒 Ditangani oleh {req.pic?.full_name}
                              </Badge>
                            ) : (
                              <>
                                <Tooltip label={req.status === 'Dalam Proses oleh Konsultan' ? 'Upload Form_Final & Setujui Berkas' : 'Lanjutkan proses ke tahap berikutnya'} position="top" withArrow>
                                  <Button
                                    size="xs"
                                    variant="light"
                                    color="green"
                                    disabled={isHoldState}
                                    leftSection={<IconCheck size={14} />}
                                    onClick={() => {
                                      if (req.status === 'Dalam Proses oleh Konsultan') {
                                        handleNextStep(req);
                                      } else {
                                        setConfirmNextRequest(req);
                                      }
                                    }}
                                  >
                                    {req.status === 'Dalam Proses oleh Konsultan' ? 'Selesai' : 'Proses'}
                                  </Button>
                                </Tooltip>

                                {canHold && (
                                  <Tooltip label={isHoldState ? 'Lanjutkan proses ke tahap selanjutnya' : 'Tangguhkan pengajuan sementara'} position="top" withArrow>
                                    <Button
                                      size="xs"
                                      variant="light"
                                      color="orange"
                                      leftSection={<IconAlertCircle size={14} />}
                                      onClick={() => setConfirmHoldRequest(req)}
                                    >
                                      {isHoldState ? 'Lanjutkan' : 'Tangguhkan'}
                                    </Button>
                                  </Tooltip>
                                )}

                                <Tooltip label="Tolak pengajuan secara permanen" position="top" withArrow>
                                  <Button
                                    size="xs"
                                    variant="light"
                                    color="red"
                                    leftSection={<IconX size={14} />}
                                    onClick={() => setRejectRequest(req)}
                                  >
                                    Tolak
                                  </Button>
                                </Tooltip>
                              </>
                            )}
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    );
                  })
                )}
              </Table.Tbody>
              </Table>
              </Box>
            )}
          </Paper>

          <Modal
            opened={finalUploadRequest !== null}
            onClose={() => setFinalUploadRequest(null)}
            title="Unggah Berkas Final"
            centered
            radius="lg"
          >
            <form onSubmit={handleSubmitFinalDocument}>
              <Stack gap="md">
                <Text size="xs" c="dimmed">Untuk menyelesaikan tiket ini menjadi status Disetujui, Anda wajib melampirkan berkas PDF Form yang telah divalidasi.</Text>
                <FileInput
                  label="Dokumen Final (.PDF)"
                  placeholder="Pilih file PDF resmi"
                  accept="application/pdf"
                  required
                  value={finalFile}
                  onChange={(file) => setFinalFile(file)}
                  radius="md"
                />
                <Button type="submit" color="ptpn4Green.9" fullWidth loading={uploadingFinal} radius="md" mt="sm">
                  Simpan & Setujui Dokumen Secara Permanen
                </Button>
              </Stack>
            </form>
          </Modal>

          <Modal
            opened={rejectRequest !== null}
            onClose={() => { setRejectRequest(null); setRejectReason(''); }}
            title={<Text fw={700}>Konfirmasi Penolakan Dokumen</Text>}
            centered
            radius="lg"
          >
            <form onSubmit={handleRejectSubmit}>
              <Stack gap="md">
                <Text size="sm" c="slateClean.7">
                  Anda akan menolak permanen dokumen <b style={{ color: '#e53e3e' }}>{rejectRequest?.ticket_number}</b>. Tindakan ini tidak dapat dibatalkan.
                </Text>

                <Textarea
                  label="Alasan/Keterangan Penolakan"
                  placeholder="Berikan keterangan yang jelas (misal: Format berkas awal tidak valid...)"
                  required
                  rows={4}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  radius="md"
                />

                <Group justify="flex-end" mt="md">
                  <Button variant="default" onClick={() => setRejectRequest(null)} radius="md">Batal</Button>
                  <Button type="submit" color="red.8" loading={rejecting} radius="md">Tolak</Button>
                </Group>
              </Stack>
            </form>
          </Modal>

          <Modal
            opened={confirmNextRequest !== null}
            onClose={() => setConfirmNextRequest(null)}
            title={<Text fw={700} size="md">Konfirmasi Perubahan Status</Text>}
            centered
            radius="lg"
          >
            <Stack gap="md">
              <Text size="sm" c="slateClean.7">
                Anda akan memproses tiket <b>{confirmNextRequest?.ticket_number}</b> ke tahap berikutnya? Tindakan ini tidak dapat dibatalkan.
              </Text>
              <Group justify="flex-end" mt="md">
                <Button variant="default" onClick={() => setConfirmNextRequest(null)} radius="md">Batal</Button>
                <Button
                  color="green.8"
                  radius="md"
                  onClick={async () => {
                    if (confirmNextRequest) {
                      const tempReq = confirmNextRequest;
                      setConfirmNextRequest(null);
                      await handleNextStep(tempReq);
                    }
                  }}
                >
                  Konfirmasi
                </Button>
              </Group>
            </Stack>
          </Modal>

          <Modal
            opened={confirmHoldRequest !== null}
            onClose={() => setConfirmHoldRequest(null)}
            title={<Text fw={700} size="md">Konfirmasi Penangguhan</Text>}
            centered
            radius="lg"
          >
            <Stack gap="md">
              <Text size="sm" c="slateClean.7">
                {confirmHoldRequest?.status.startsWith('Sedang Ditangguhkan') ? (
                  <>Anda akan melepas status penangguhan pada tiket <b>{confirmHoldRequest?.ticket_number}</b>. Riwayat log penangguhan akan dicatat.</>
                ) : (
                  <>Anda akan menangguhkan sementara tiket <b>{confirmHoldRequest?.ticket_number}</b>. Riwayat log penangguhan akan dicatat.</>
                )}
              </Text>
              <Group justify="flex-end" mt="md">
                <Button variant="default" onClick={() => setConfirmHoldRequest(null)} radius="md">Batal</Button>
                <Button
                  color="orange.8"
                  radius="md"
                  onClick={async () => {
                    if (confirmHoldRequest) {
                      const tempReq = confirmHoldRequest;
                      setConfirmHoldRequest(null);
                      await handleToggleHold(tempReq);
                    }
                  }}
                >
                  Konfirmasi
                </Button>
              </Group>
            </Stack>
          </Modal>

        <Modal
          opened={confirmHoldRequest !== null}
          onClose={() => { setConfirmHoldRequest(null); setHoldReason(''); }}
          title={<Text fw={700} size="md">Konfirmasi Penangguhan</Text>}
          centered
          radius="lg"
        >
          <Stack gap="md">
            <Text size="sm" c="slateClean.7">
              {confirmHoldRequest?.status.startsWith('Sedang Ditangguhkan') ? (
                <>Anda akan melepas status penangguhan pada tiket <b>{confirmHoldRequest?.ticket_number}</b>.</>
              ) : (
                <>Anda akan menangguhkan sementara tiket <b>{confirmHoldRequest?.ticket_number}</b>.</>
              )}
            </Text>

            {confirmHoldRequest && !confirmHoldRequest.status.startsWith('Sedang Ditangguhkan') && (
              <Textarea
                label="Alasan Penangguhan"
                placeholder="Berikan alasan penangguhan yang jelas (misal: Perlu peninjauan lebih lanjut...)"
                required
                rows={3}
                value={holdReason}
                onChange={(e) => setHoldReason(e.target.value)}
                radius="md"
              />
            )}

            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={() => { setConfirmHoldRequest(null); setHoldReason(''); }} radius="md">Batal</Button>
              <Button
                color={confirmHoldRequest?.status.startsWith('Sedang Ditangguhkan') ? "green.8" : "orange.8"}
                radius="md"
                onClick={async () => {
                  if (confirmHoldRequest) {
                    const tempReq = confirmHoldRequest;
                    setConfirmHoldRequest(null);
                    await handleToggleHold(tempReq, holdReason);
                    setHoldReason('');
                  }
                }}
              >
                Konfirmasi
              </Button>
            </Group>
          </Stack>
        </Modal>

        <Drawer
          opened={selectedDetail !== null}
          onClose={() => setSelectedDetail(null)}
          title={
            <Group gap="xs">
              <Badge color="ptpn4Green.9" variant="filled" radius="sm">
                {selectedDetail?.ticket_number}
              </Badge>
              <Text fw={800} size="md" c="slateClean.9">Detail Berkas Permohonan</Text>
            </Group>
          }
          position="right"
          size="md"
          styles={{
            header: { borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' },
            content: { backgroundColor: '#ffffff' }
          }}
        >
          {selectedDetail && (
            <Stack gap="lg" mt="md">
              {}
              <Box p="sm" bg="slateClean.0" style={{ borderRadius: '8px' }}>
                <Text size="xs" c="dimmed" fw={600} mb={4}>INFORMASI PENGAJU</Text>
                <Text fw={700} size="sm" c="slateClean.8">{selectedDetail.profiles?.full_name}</Text>
                <Text size="xs" c="slateClean.5">{selectedDetail.profiles?.division} • {selectedDetail.profiles?.email}</Text>
              </Box>

              {}
              <Box>
                <Text size="xs" c="dimmed" fw={600} mb={2}>JUDUL PERMOHONAN</Text>
                <Text fw={700} size="md" c="slateClean.9" mb="xs">{selectedDetail.request_title}</Text>
                <Badge color="blue" variant="light">{selectedDetail.categories?.name}</Badge>
              </Box>

              {}
              <Box>
                <Text size="xs" c="dimmed" fw={600} mb={4}>DESKRIPSI & KETERANGAN DOKUMEN</Text>
                <Paper p="md" withBorder radius="md" bg="#f8fafc" style={{ borderColor: '#e2e8f0' }}>
                  <Text size="sm" c="slateClean.7" style={{ whiteSpace: 'pre-line', lineHeight: '1.6' }}>
                    {selectedDetail.description || 'Pengaju tidak menyertakan keterangan tertulis pada dokumen ini.'}
                  </Text>
                </Paper>
              </Box>

              {}
              {selectedDetail.file_url && (
                <Box>
                  <Text size="xs" c="dimmed" fw={600} mb={4}>BERKAS LAMPIRAN FISIK</Text>
                  <Button
                    component="a"
                    href={selectedDetail.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="outline"
                    color="ptpn4Green.9"
                    fullWidth
                    leftSection={<IconDownload size={16} />}
                  >
                    Buka / Unduh Dokumen PDF
                  </Button>
                </Box>
              )}

              {}
              <Divider my="sm" label={<Text size="10px" fw={700} c="slateClean.4" lts="0.5px">RIWAYAT ALUR DOKUMEN</Text>} labelPosition="center" />

              {loadingTimeline ? (
                <Text size="xs" ta="center" c="dimmed" py="sm">Membaca jejak log birokrasi...</Text>
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

        </AppShell.Main>
      </AppShell>
    );
  }
