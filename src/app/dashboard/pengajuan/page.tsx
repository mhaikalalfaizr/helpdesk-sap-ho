'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useMemo } from 'react';
import { notifications } from '@mantine/notifications';
import UserDetailDrawer from '../../../components/userDetailDrawer';
import {
  AppShell, SimpleGrid, Paper, Text, Group, Badge, Avatar, Table, NavLink, Stack, Box, Kbd,
  Tooltip, Modal, Timeline, FileInput, Textarea, Button, TextInput, Select, ActionIcon, Divider, Loader, Center, Drawer
} from '@mantine/core';
import {
  IconLayoutDashboard, IconFileText, IconSettings, IconLogout, IconSearch, IconBell, IconMail,
  IconCheck, IconX, IconArrowUpRight, IconDownload, IconPlus, IconHistory, IconInfoCircle, IconChecklist, IconFilePlus
} from '@tabler/icons-react';

import { getSlaMetrics, getStatusColor, countWorkingDays, handleDownloadSecureFile } from '../../../utils/helpers';

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
        (payload) => {
          if (payload.new && 'id' in payload.new) {
            fetchSingleUpdatedMyRequest(payload.new.id as string);
          } else if (payload.eventType === 'DELETE' && payload.old && 'id' in payload.old) {
            setMyRequests(prev => prev.filter(r => r.id !== payload.old.id));
          }
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

  const fetchSingleUpdatedMyRequest = async (requestId: string) => {
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
      .eq('id', requestId)
      .maybeSingle();

    if (data) {
      setMyRequests(prev => {
        const exists = prev.find(r => r.id === requestId);
        if (exists) return prev.map(r => r.id === requestId ? (data as any) : r);
        return [data as any, ...prev];
      });
    }
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

    </Box>
  );
}
