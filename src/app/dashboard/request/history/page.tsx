'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useMemo } from 'react';
import { notifications } from '@mantine/notifications';
import UserDetailDrawer from '../../../../components/UserDetailDrawer';
import {
  SimpleGrid, Paper, Text, Group, Badge, Avatar, Table, Stack, Box,
  Tooltip, Button, TextInput, Select, Pagination
} from '@mantine/core';
import {
  IconSearch, IconX, IconInfoCircle
} from '@tabler/icons-react';

import { getSlaMetrics, getStatusColor, handleDownloadSecureFile, isTicketUnassigned, isTicketInProcess, isTicketHold, isTicketFinal } from '../../../../utils/helpers';
import { RequestItem, RequestLog, CategoryOption } from '@/utils/types';


export default function UserDashboard() {
  const router = useRouter();
  const supabase = createClient();

  const [userProfile, setUserProfile] = useState<{ id: string; fullName: string; division: string; email: string } | null>(null);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [myRequests, setMyRequests] = useState<RequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserName, setCurrentUserName] = useState<string>('');

  const [selectedRequest, setSelectedRequest] = useState<RequestItem | null>(null);
  const [historyLogs, setHistoryLogs] = useState<RequestLog[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<string | null>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>('desc');

  const [urgencyFilter, setUrgencyFilter] = useState<string | null>(null);
  const [publicHolidays, setPublicHolidays] = useState<string[]>([]);

  const [page, setPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    setPage(1);
  }, [activeFilter, searchQuery, urgencyFilter]);

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

    if (!profile || profile.role !== 'Pengaju') {
      notifications.show({
        title: 'Akses Dialihkan',
        message: 'Membuka dashboard Staf...',
        color: 'blue',
      });
      router.push('/dashboard/staff');
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
        attachments (id, file_name, file_url, type)
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(500);

    if (data) setMyRequests(data as any);
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

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  const filteredRequests = useMemo(() => {
    let filtered = [...myRequests];

    if (activeFilter === 'unassigned') {
      filtered = filtered.filter(r => isTicketUnassigned(r.status))
    } else if (activeFilter === 'process') {
      filtered = filtered.filter(r => isTicketInProcess(r.status));
    } else if (activeFilter === 'hold') {
      filtered = filtered.filter(r => isTicketHold(r.status));
    } else if (activeFilter === 'archived') {
      filtered = filtered.filter(r => isTicketFinal(r.status));
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
      else if (sortKey === 'duration') { 
        valA = parseInt(getSlaMetrics(a.created_at, a.status, a.total_hold_days, 7, a.updated_at, publicHolidays).displayString.replace(/[^0-9]/g, '')) || 0; 
        valB = parseInt(getSlaMetrics(b.created_at, b.status, b.total_hold_days, 7, b.updated_at, publicHolidays).displayString.replace(/[^0-9]/g, '')) || 0; 
      }

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

  const totalCount = myRequests.length;
  const unassignedCount = myRequests.filter(r => isTicketUnassigned(r.status)).length;
  const processCount = myRequests.filter(r => isTicketInProcess(r.status)).length;
  const holdCount = myRequests.filter(r => isTicketHold(r.status)).length;
  const archivedCount = myRequests.filter(r => isTicketFinal(r.status)).length;

  if (loading || !userProfile) return null;

  const paginatedRequests = filteredRequests.slice((page - 1) * pageSize, page * pageSize);
  const startItem = filteredRequests.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, filteredRequests.length);
  const totalItems = filteredRequests.length;

  return (
    <Box>
      <Box mb="xl">
        <Stack gap="xs">
          <Text size="28px" fw={800} c="slateClean.9" style={{ letterSpacing: '-0.5px' }}>Monitoring & Pelacakan Dokumen</Text>
          <Text size="sm" c="dimmed">Pantau pengajuan anda.</Text>
        </Stack>
      </Box>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 5 }} spacing="lg" mb="xl">
        <Paper
          bg={activeFilter === null ? 'ptpn4Green.9' : 'slateClean.1'}
          p="xl"
          onClick={() => setActiveFilter(null)}
          style={{
            cursor: 'pointer',
            color: activeFilter === null ? 'var(--mantine-color-white)' : 'var(--mantine-color-slateClean-6)',
            transition: 'all 0.2s ease',
            boxShadow: activeFilter === null ? '0 4px 12px rgba(14, 66, 42, 0.2)' : 'none'
          }}
        >
          <Text size="xs" fw={700} c="slateClean.4" lts="0.5px" truncate="end">TIKET DALAM PROSES</Text>
          <Text size="36px" fw={800} my="xs">{loading ? '...' : totalCount}</Text>
          <Text size="xs" c={activeFilter === null ? 'ptpn4Green.1' : 'dimmed'} fw={500}>Seluruh riwayat pengajuan</Text>
        </Paper>

        <Paper
          p="xl"
          onClick={() => setActiveFilter('unassigned')}
          style={{ cursor: 'pointer', outline: activeFilter === 'unassigned' ? '2px solid var(--mantine-color-grape-6)' : 'none', transition: 'all 0.2s' }}
        >
          <Text size="xs" fw={700} c="slateClean.4" lts="0.5px" truncate="end">TIKET MENUNGGU</Text>
          <Text size="36px" fw={800} my="xs" c={unassignedCount > 0 ? "slateClean.9" : "slateClean.9"}>{loading ? '...' : unassignedCount}</Text>
          <Text size="xs" c="grape.6" fw={500}>Menunggu penugasan staf</Text>
        </Paper>

        <Paper
          p="xl"
          onClick={() => setActiveFilter('process')}
          style={{ cursor: 'pointer', outline: activeFilter === 'process' ? '2px solid var(--mantine-color-blue-5)' : 'none', transition: 'all 0.2s' }}
        >
          <Text size="xs" fw={700} c="slateClean.4" lts="0.5px" truncate="end">TIKET DALAM PROSES</Text>
          <Text size="36px" fw={800} my="xs" c="slateClean.9">{loading ? '...' : processCount}</Text>
          <Text size="xs" c="blue.6" fw={500}>Dalam peninjauan</Text>
        </Paper>

        <Paper
          p="xl"
          onClick={() => setActiveFilter('hold')}
          style={{ cursor: 'pointer', outline: activeFilter === 'hold' ? '2px solid var(--mantine-color-orange-5)' : 'none', transition: 'all 0.2s' }}
        >
          <Text size="xs" fw={700} c="slateClean.4" lts="0.5px" truncate="end">TIKET DITANGGUHKAN</Text>
          <Text size="36px" fw={800} my="xs" c="slateClean.9">{loading ? '...' : holdCount}</Text>
          <Text size="xs" c="orange.6" fw={500}>Penangguhan aktif</Text>
        </Paper>

        <Paper
          p="xl"
          onClick={() => setActiveFilter('archived')}
          style={{ cursor: 'pointer', outline: activeFilter === 'archived' ? '2px solid var(--mantine-color-teal-5)' : 'none', transition: 'all 0.2s' }}
        >
          <Text size="xs" fw={700} c="slateClean.4" lts="0.5px" truncate="end">TIKET SELESAI</Text>
          <Text size="36px" fw={800} my="xs" c="slateClean.9">{loading ? '...' : archivedCount}</Text>
          <Text size="xs" c="green.6" fw={500}>Telah diselesaikan</Text>
        </Paper>
      </SimpleGrid>

      <Paper p="xl">
        <Group mb="md" gap="sm" align="center" justify="space-between">
          <Group gap="sm">
            <TextInput
              placeholder="Cari nomor tiket..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              leftSection={<IconSearch size={16} stroke={1.5} color="var(--mantine-color-slateClean-5)" />}
              w={{ base: '100%', sm: 300 }}
              styles={{ input: { backgroundColor: 'var(--mantine-color-slateClean-0)', border: '1px solid var(--mantine-color-slateClean-2)', borderRadius: '8px' } }}
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
              styles={{ input: { backgroundColor: 'var(--mantine-color-slateClean-0)', border: '1px solid var(--mantine-color-slateClean-2)', borderRadius: '8px' } }}
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

          <Text size="sm" c="dimmed">
            Menampilkan <Text span fw={600} c="slateClean.8">{startItem}-{endItem}</Text> dari <Text span fw={600} c="slateClean.8">{totalItems}</Text> tiket
          </Text>

        </Group>

        <Table.ScrollContainer minWidth={1000}>
          <Table verticalSpacing="md" horizontalSpacing="md" highlightOnHover variant="simple" striped>
            <Table.Thead bg="slateClean.0">
              <Table.Tr>
                <Table.Th style={{ cursor: 'pointer' }} w="17%" onClick={() => handleSortRequest('ticket')}>
                  <Text size="xs" fw={700} c="slateClean.5">NO. TIKET{renderSortArrow('ticket')}</Text>
                </Table.Th>
                <Table.Th style={{ cursor: 'pointer' }} w="20%" onClick={() => handleSortRequest('title')}>
                  <Text size="xs" fw={700} c="slateClean.5">JUDUL / JENIS{renderSortArrow('title')}</Text>
                </Table.Th>
                <Table.Th style={{ cursor: 'pointer' }} w="10%" onClick={() => handleSortRequest('duration')}>
                  <Text size="xs" fw={700} c="slateClean.5">DURASI{renderSortArrow('duration')}</Text>
                </Table.Th>
                <Table.Th style={{ cursor: 'pointer' }} w="12%" onClick={() => handleSortRequest('date')}>
                  <Text size="xs" fw={700} c="slateClean.5">TANGGAL KIRIM{renderSortArrow('date')}</Text>
                </Table.Th>
                <Table.Th w="15%">
                  <Text size="xs" fw={700} c="slateClean.5">Staf PIC</Text>
                </Table.Th>
                <Table.Th style={{ cursor: 'pointer' }} w="20%" onClick={() => handleSortRequest('status')}>
                  <Text size="xs" fw={700} c="slateClean.5">STATUS{renderSortArrow('status')}</Text>
                </Table.Th>
              </Table.Tr>
            </Table.Thead>

            <Table.Tbody>
              {paginatedRequests.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={6} ta="center" py="xl">
                    <Stack gap="xs" align="center" py="md">
                      <IconInfoCircle size={24} color="var(--mantine-color-slateClean-4)" />
                      <Text fw={700} c="slateClean.8" size="sm">Data Tiket Tidak Ditemukan</Text>
                      <Text size="xs" c="dimmed" w={280}>Tidak ada tiket yang sesuai dengan filter pencarian.</Text>
                    </Stack>
                  </Table.Td>
                </Table.Tr>
              ) : (
                paginatedRequests.map((req) => {
                  const effectiveSlaDays = (req.categories?.name === 'Tiket Lainnya')
                    ? (req.custom_sla_days ?? null) : 7;

                  const slaMetrics = getSlaMetrics(req.created_at, req.status, req.total_hold_days, effectiveSlaDays, req.updated_at, publicHolidays);

                  return (
                    <Table.Tr key={req.id} style={{
                      borderBottom: '1px solid var(--mantine-color-slateClean-1)',
                      backgroundColor: slaMetrics.isOverdue ? 'var(--mantine-color-red-0)' : 'undefined',
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
                            Belum Diproses
                          </Badge>
                        )}
                      </Table.Td>

                      <Table.Td>
                        <Badge color={getStatusColor(req.status)} variant="light" radius="sm" py="md">
                          {req.status}
                        </Badge>
                      </Table.Td>
                    </Table.Tr>
                  );
                })
              )}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>

        {filteredRequests.length > 0 && (
          <Group justify="center" mt="xl" mb="sm">
            <Pagination
              total={Math.ceil(filteredRequests.length / pageSize)}
              value={page}
              onChange={setPage}
              color="ptpn4Green.9"
              radius="md"
            />
          </Group>
        )}

      </Paper>

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
