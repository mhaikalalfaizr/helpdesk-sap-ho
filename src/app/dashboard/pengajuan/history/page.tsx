'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useMemo } from 'react';
import { notifications } from '@mantine/notifications';
import UserDetailDrawer from '../../../../components/userDetailDrawer';
import {
  AppShell, SimpleGrid, Paper, Text, Group, Badge, Avatar, Table, NavLink, Stack, Box, Kbd, 
  Tooltip, Modal, Timeline, FileInput, Textarea, Button, TextInput, Select, ActionIcon, Divider, Loader, Center, Drawer
} from '@mantine/core';
import {
  IconLayoutDashboard, IconFileText, IconSettings, IconLogout, IconSearch, IconBell, IconMail,
  IconCheck, IconX, IconArrowUpRight, IconDownload, IconPlus, IconHistory, IconInfoCircle, IconChecklist, IconFilePlus
} from '@tabler/icons-react';

import { getSlaMetrics, getStatusColor, countWorkingDays, handleDownloadSecureFile } from '../../../../utils/helpers';

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
  custom_sla_days?: number | null;
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
  const supabase = createClient();

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
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<string | null>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>('desc');

  const [urgency, setUrgency] = useState<string | null>(null);
  const [urgencyFilter, setUrgencyFilter] = useState<string | null>(null);
  const [publicHolidays, setPublicHolidays] = useState<string[]>([]);

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
    if (!user)  {
      router.push('/login');
      return;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, division, email, role')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile || profile.role !== 'Pengaju') {
      notifications.show({
        title: 'Akses Dialihkan',
        message: 'Membuka dashboard Staf...',
        color: 'blue',
      });
      router.push('/dashboard/staf');
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

    const { data: holidayData } = await supabase.from('public_holidays').select('holiday_date');
    if (holidayData) {
      setPublicHolidays(holidayData.map(h => h.holiday_date));
    }

    setLoading(false);
  };

  const fetchUserRequests = async (userId: string) => {
    const { data } = await supabase
      .from('requests')
      .select(`
        id, ticket_number, request_title, description, status, total_hold_days, created_at, updated_at, file_url, urgency, custom_sla_days,
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
    let uploadedFilePaths: string[] = [];

    try {
      const ticketNumber = generateTicketNumber();
      const uploadedAttachments: { file_name: string; file_url: string; type: string }[] = [];

      let uploadedFileUrl = '';

      for (const currentFile of files) {
        const fileExt = currentFile.name.split('.').pop();
        const randomNonce = Math.random().toString(36).substring(7);
        const fileName = `${userProfile.id}-${Date.now()}-${randomNonce}.${fileExt}`;
        const filePath = `user_docs/${fileName}`;

        uploadedFilePaths.push(filePath);

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
            custom_sla_days: categoryId === '4' ? (subCategoryOptions.find(sub => sub.value === subCategory)?.label ? 7 : null) : null,
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
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ticketNumber: ticketNumber,
            title: requestTitle,
            status: 'Dikirim (Menunggu Antrean)',
            notes: 'Dokumen Anda berhasil dikirim ke sistem dan menunggu verifikasi oleh pihak Staf.',
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

      if (urgency === 'Tinggi') {
        try {
          const { data: koordinatorList } = await supabase
            .from('profiles')
            .select('email, full_name')
            .eq('role', 'Koordinator');

          if (koordinatorList && koordinatorList.length > 0) {
            for (const koor of koordinatorList) {
              if (!koor.email) continue;

              try {
                const emailRes = await fetch('/api/send-email', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    ticketNumber: ticketNumber,
                    title: `[TIKET PENTING] ${requestTitle}`,
                    status: 'Menunggu Antrean (Prioritas)',
                    notes: `Tiket prioritas tinggi dari ${userProfile?.fullName} masuk. Segera periksa dasbor.`,
                    recipientEmail: koor.email,
                    recipientName: koor.full_name
                  }),
                });

              if (!emailRes.ok) {
                const contentType = emailRes.headers.get("content-type");

                if (contentType && contentType.indexOf("application/json") !== -1) {
                  const errData = await emailRes.json();
                  console.error(`API menolak email ke ${koor.full_name}:`, errData);
                } else {
                  const errText = await emailRes.text();
                  console.error(`API Crash (Bukan JSON) saat kirim ke ${koor.full_name}. Status: ${emailRes.status}`);
                  console.log("Isi HTML Error:", errText.substring(0, 200));
                }
              }

              await new Promise(resolve => setTimeout(resolve, 1500));

            } catch (err) {
              console.error(`Gagal fetch ke API email untuk ${koor.full_name}:`, err);
            }
          };
        }

      } catch (emailBlastErr) {
        console.error('Jaringan terputus saat mengirimkan notifikasi ke Koordinator:', emailBlastErr);
      }
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
      setUrgency(null);

      fetchUserRequests(userProfile.id);
      setActiveMenu(1);

    } catch (error: any) {
      if (insertedRequestId) {
        await supabase.from('requests').delete().eq('id', insertedRequestId);
      }

      if (uploadedFilePaths.length > 0) {
        await supabase.storage.from('documents').remove(uploadedFilePaths);
      }

      notifications.show({ title: 'Gagal Membuat Pengajuan', message: error.message, color: 'red' });
    } finally {
      setFormLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  const filteredRequests = useMemo(() => {
    let filtered = [...myRequests];

    if (activeFilter === 'process') {
      filtered = filtered.filter(r => r.status.startsWith('Dalam Proses') || r.status === 'Dikirim');
    } else if (activeFilter === 'hold') {
      filtered = filtered.filter(r => r.status.startsWith('Sedang Ditangguhkan') || r.status.startsWith('Sedang Ditahan'));
    } else if (activeFilter === 'archived') {
      filtered = filtered.filter(r => r.status === 'Disetujui' || r.status === 'Ditolak' || r.status === 'Selesai (Rilis PRD)');
    }

    if (searchQuery.trim() !== '') {
      const cleanQuery = searchQuery.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      filtered = filtered.filter((req) => {
        const cleanTicket = req.ticket_number.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        return cleanTicket.includes(cleanQuery);
      });
    }

    if (urgencyFilter) {
      filtered = filtered.filter(r => r.urgency === urgencyFilter);
    }

    if (!sortKey || !sortDirection) return filtered;

    return filtered.sort((a, b) => {
      let valA: any = '';
      let valB: any = '';

      if (sortKey === 'ticket') { valA = a.ticket_number; valB = b.ticket_number; }
        else if (sortKey === 'title') { valA = a.request_title?.toLowerCase() || ''; valB = b.request_title?.toLowerCase() || ''; }
        else if (sortKey === 'date') { valA = new Date(a.created_at).getTime(); valB = new Date(b.created_at).getTime(); }
        else if (sortKey === 'status') { valA = a.status; valB = b.status; }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [myRequests, activeFilter, searchQuery, urgencyFilter, sortKey, sortDirection]);

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

  const getSlaMetrics = (createdAt: string, status: string, totalHoldDays: number, slaLimit: number | null, updatedAt?: string | null, publicHolidays?: string[]) => {
    const isFinal = status === 'Disetujui' || status === 'Ditolak' || status === 'Selesai (Rilis PRD)';
    const isCurrentlyHold = status.startsWith('Sedang Ditangguhkan') || status.startsWith('Sedang Ditahan');

    const createdDate = new Date(createdAt).getTime();
    const endTime = (isFinal && updatedAt) ? new Date(updatedAt).getTime() : new Date().getTime();

    const totalElapsedDays = Math.floor((endTime - createdDate) / (1000 * 60 * 60 * 24));

    let finalHoldDays = totalHoldDays || 0;
    if (isCurrentlyHold && updatedAt) {
      const holdStart = new Date(updatedAt).getTime();
      const currentHoldDuration = Math.floor((new Date().getTime() - holdStart) / (1000 * 60 * 60 * 24));
      finalHoldDays += currentHoldDuration;
    }

    const netSlaDays = totalElapsedDays - finalHoldDays;

    return {
      finalHoldDays,
      isOverdue: slaLimit !== null ? netSlaDays > slaLimit : false,
      displayString: netSlaDays <= 0 ? '1 Hari' : `${netSlaDays} Hari`
    };
  };

  const totalCount = myRequests.length;
  const processCount = myRequests.filter(r => r.status.startsWith('Dalam Proses') || r.status === 'Dikirim').length;
  const holdCount = myRequests.filter(r => r.status.startsWith('Sedang Ditangguhkan') || r.status.startsWith('Sedang Ditahan')).length;
  const archivedCount = myRequests.filter(r => r.status === 'Disetujui' || r.status === 'Ditolak').length;

  const activeCategoryLabel = categories.find(c => c.value === categoryId)?.label || '';
  const isTiketCategory = activeCategoryLabel.toLowerCase().includes('tiket');

  if (loading || !userProfile) return null;

  return (
    <Box px={{ base: 'xs', sm: 'md', lg: 'xl' }} py="md">
          <Box>
            <Box mb="xl">
              <Stack gap="xs">
                <Text size="28px" fw={800} c="slateClean.9" style={{ letterSpacing: '-0.5px' }}>Monitoring & Pelacakan Dokumen</Text>
                <Text size="sm" c="dimmed">Pantau pengajuan anda.</Text>
              </Stack>
            </Box>

            <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="lg" mb="xl">
              <Paper
                bg={activeFilter === null ? 'ptpn4Green.9' : 'slateClean.1'}
                p="xl"
                onClick={() => setActiveFilter(null)}
                style={{
                  cursor: 'pointer',
                  color: activeFilter === null ? '#fff' : '#475569',
                  transition: 'all 0.2s ease',
                  boxShadow: activeFilter === null ? '0 4px 12px rgba(14, 66, 42, 0.2)' : 'none'
                }}
              >
                <Text size="xs" fw={700} c="slateClean.4" lts="0.5px" truncate="end">TIKET DALAM PROSES</Text>
                <Text size="36px" fw={800} my="xs">{totalCount}</Text>
                <Text size="xs" c={activeFilter === null ? 'ptpn4Green.1' : 'dimmed'} fw={500}>Seluruh riwayat pengajuan</Text>
              </Paper>

              <Paper
                p="xl"
                onClick={() => setActiveFilter('process')}
                style={{ cursor: 'pointer', outline: activeFilter === 'process' ? '2px solid #228be6' : 'none', transition: 'all 0.2s' }}
              >
                <Text size="xs" fw={700} c="slateClean.4" lts="0.5px" truncate="end">TIKET DALAM PROSES</Text>
                <Text size="36px" fw={800} my="xs" c="slateClean.9">{processCount}</Text>
                <Text size="xs" c="blue.6" fw={500}>Dalam peninjauan</Text>
              </Paper>

              <Paper
                p="xl"
                onClick={() => setActiveFilter('hold')}
                style={{ cursor: 'pointer', outline: activeFilter === 'hold' ? '2px solid #f59e0b' : 'none', transition: 'all 0.2s' }}
              >
                <Text size="xs" fw={700} c="slateClean.4" lts="0.5px" truncate="end">TIKET DITANGGUHKAN</Text>
                <Text size="36px" fw={800} my="xs" c="slateClean.9">{holdCount}</Text>
                <Text size="xs" c="orange.6" fw={500}>Penangguhan aktif</Text>
              </Paper>

              <Paper
                p="xl"
                onClick={() => setActiveFilter('archived')}
                style={{ cursor: 'pointer', outline: activeFilter === 'archived' ? '2px solid #10b981' : 'none', transition: 'all 0.2s' }}
              >
                <Text size="xs" fw={700} c="slateClean.4" lts="0.5px" truncate="end">TIKET SELESAI</Text>
                <Text size="36px" fw={800} my="xs" c="slateClean.9">{archivedCount}</Text>
                <Text size="xs" c="green.6" fw={500}>Telah diselesaikan</Text>
              </Paper>
            </SimpleGrid>

            <Paper p="xl">
              <Group mb="xl" gap="sm" align="center">
                <TextInput
                  placeholder="Cari nomor tiket..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  leftSection={<IconSearch size={16} stroke={1.5} color="#64748b" />}
                  w={{ base: '100%', sm: 300 }}
                  styles={{ input: { backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' } }}
                />

                <Select
                  placeholder="Semua Urgensi"
                  data={[
                    { value: 'Tinggi', label: '🔴 Urgensi Tinggi' },
                    { value: 'Sedang', label: '🟡 Urgensi Sedang' },
                    { value: 'Rendah', label: '🟢 Urgensi Rendah' },
                  ]}
                  value={urgencyFilter}
                  onChange={setUrgencyFilter}
                  clearable
                  w={{ base: '100%', sm: 200 }}
                  styles={{ input: { backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' } }}
                />

                {(activeFilter || urgencyFilter) && (
                  <Button
                    variant="light"
                    color="gray"
                    size="sm"
                    radius="md"
                    onClick={() => {
                      setActiveFilter(null);
                      setUrgencyFilter(null);
                    }}
                    leftSection={<IconX size={14} />}
                  >
                    Hapus Filter
                  </Button>
                )}
              </Group>

              <Table.ScrollContainer minWidth={1000}>
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
                      <Text size="xs" fw={700} c="slateClean.5">Staf</Text>
                    </Table.Th>
                    <Table.Th w={300} style={{ cursor: 'pointer' }} onClick={() => handleSortRequest('status')}>
                      <Text size="xs" fw={700} c="slateClean.5">STATUS SAAT INI{renderSortArrow('status')}</Text>
                    </Table.Th>
                  </Table.Tr>
                </Table.Thead>

                <Table.Tbody>
                  {filteredRequests.length === 0 ? (
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
                    filteredRequests.map((req) => {
                      const finalAttachment = req.attachments?.find((att: any) => att.type === 'Dokumen_Final');

                      const effectiveSlaDays = (req.categories?.id === 4 || req.categories?.name === 'Tiket Lainnya')
                        ? (req.custom_sla_days ?? null) : 7;

                      const slaMetrics = getSlaMetrics(req.created_at, req.status, req.total_hold_days, effectiveSlaDays, req.updated_at, publicHolidays);

                      const getUrgencyColor = (urgency: string) => {
                        if (urgency === 'Tinggi') return 'red';
                        if (urgency === 'Sedang') return 'orange';
                        return 'gray';
                      };

                      return (
                        <Table.Tr key={req.id} style={{
                          borderBottom: '1px solid #f1f5f9',
                          backgroundColor: slaMetrics.isOverdue ? '#fff5f5' : 'undefined',
                          transition: 'background-color 0.2s ease'
                           }}>
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
                              {req.sub_categories?.name ? ` (${req.sub_categories.name}) ` : ' '}
                              | Batas: {effectiveSlaDays !== null ? `${effectiveSlaDays} Hari` : 'Belum Ditentukan'}
                            </Text>
                          </Table.Td>

                          <Table.Td>
                            <Stack gap={2}>
                              <Text size="sm" fw={700} c="slateClean.9">
                                {slaMetrics.displayString}
                              </Text>
                              {slaMetrics.finalHoldDays > 0 && (
                                <Text size="11px" color="orange.7" fw={600}>Total Hold: {slaMetrics.finalHoldDays} Hari</Text>
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
                                Belum Diproses Staf
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
                                  onClick={() => handleDownloadSecureFile(supabase, finalAttachment.file_url, finalAttachment.file_name)}
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
              </Table.ScrollContainer>
            </Paper>
          </Box>

        <UserDetailDrawer
          request={selectedRequest}
          historyLogs={historyLogs}
          loadingTimeline={loadingTimeline}
          onClose={() => setSelectedRequest(null)}
          onDownload={(url, name) => handleDownloadSecureFile(supabase, url, name)}
        />
    </Box>
  );
}
