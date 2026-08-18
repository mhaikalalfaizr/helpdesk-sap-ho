'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { notifications } from '@mantine/notifications';
import { Box, Stack, Text, Group, Button, Badge, Table, Select, Modal, ActionIcon, Tooltip, Paper, TextInput } from '@mantine/core';
import { IconPlus, IconEdit, IconUserOff, IconUserCheck, IconUsers, IconX, IconSearch } from '@tabler/icons-react';
import UserFormModal from '../../../../components/modals/UserFormModal';
import { UserProfile } from '@/utils/types';

type ManagedUser = UserProfile & { division?: string | null };

const ROLE_OPTIONS = [
  { value: 'Koordinator', label: 'Koordinator' },
  { value: 'Staf', label: 'Staf' },
  { value: 'Pengaju', label: 'Pengaju' },
];

const STATUS_OPTIONS = [
  { value: 'aktif', label: '🟢 Aktif' },
  { value: 'nonaktif', label: '⚫ Nonaktif' },
];

const selectStyles = { input: { backgroundColor: 'var(--mantine-color-slateClean-0)', border: '1px solid var(--mantine-color-slateClean-2)', borderRadius: '8px' } };
const thStyle = { borderBottom: '1px solid var(--mantine-color-slateClean-2)' };

export default function UserManagementPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [formModalOpened, setFormModalOpened] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [confirmToggleUser, setConfirmToggleUser] = useState<ManagedUser | null>(null);
  const [isToggling, setIsToggling] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => { initPage(); }, []);

  const initPage = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/login'); return; }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
      if (!profile || profile.role !== 'Koordinator') { router.replace('/dashboard/staff'); return; }
      setCurrentUserId(user.id);
      await fetchUsers();
    } catch (err) {
      console.error('Error inisialisasi halaman Manajemen Pengguna:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    const { data, error } = await supabase.from('profiles').select('id, full_name, email, unit_kerja, division, role, is_active, created_at').order('created_at', { ascending: false });
    if (error) {
      console.error('Gagal mengambil data pengguna:', error);
      notifications.show({ title: 'Gagal', message: 'Tidak dapat memuat daftar pengguna.', color: 'red' });
      return;
    }
    setUsers((data || []) as ManagedUser[]);
  };

  const handleOpenAdd = () => { setEditingUser(null); setFormModalOpened(true); };
  const handleOpenEdit = (user: ManagedUser) => { setEditingUser(user); setFormModalOpened(true); };

  const handleFormSuccess = (savedUser: ManagedUser) => {
    setUsers((prev) => {
      const exists = prev.some((user) => user.id === savedUser.id);
      return exists ? prev.map((user) => user.id === savedUser.id ? savedUser : user) : [savedUser, ...prev];
    });
  };

  const handleToggleConfirm = async () => {
    if (!confirmToggleUser) return;
    setIsToggling(true);
    try {
      const newStatus = !confirmToggleUser.is_active;
      const res = await fetch('/api/admin/toggle-user', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: confirmToggleUser.id, is_active: newStatus }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Gagal mengubah status pengguna.');
      setUsers((prev) => prev.map((user) => user.id === confirmToggleUser.id ? { ...user, is_active: newStatus } : user));
      notifications.show({ title: 'Berhasil', message: `Akun ${confirmToggleUser.full_name} berhasil ${newStatus ? 'diaktifkan' : 'dinonaktifkan'}.`, color: newStatus ? 'green' : 'orange', autoClose: 4000 });
      setConfirmToggleUser(null);
    } catch (err: any) {
      notifications.show({ title: 'Gagal', message: err?.message || 'Terjadi kesalahan saat mengubah status pengguna.', color: 'red', autoClose: 5000 });
    } finally {
      setIsToggling(false);
    }
  };

  const filteredUsers = users.filter((user) => {
    if (roleFilter && user.role !== roleFilter) return false;
    if (statusFilter === 'aktif' && !user.is_active) return false;
    if (statusFilter === 'nonaktif' && user.is_active) return false;
    
    const matchesSearch = 
      user.full_name?.toLowerCase().includes(searchQuery.toLowerCase())
      
    if (!matchesSearch) return false;
    return true;
  });

  const formatDate = (isoDate: string) => new Date(isoDate).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' });

  const getRoleBadgeColor = (role: string) => role === 'Koordinator' ? 'blue' : role === 'Staf' ? 'ptpn4Orange' : 'slateClean';

  const hasFilter = Boolean(roleFilter || statusFilter);

  return (
    <Box mb="xl">
      <Group justify="space-between" mb="xl" align="flex-end">
        <Stack gap="sm">
          <Text size="28px" fw={800} c="slateClean.9" style={{ letterSpacing: '-0.5px' }}>Manajemen Pengguna</Text>
          <Text size="sm" c="dimmed">Kelola akun pengguna sistem dengan tambah, edit, dan atur status akses.</Text>
        </Stack>
        <Button leftSection={<IconPlus size={16} />} color="ptpn4Green" size="sm" radius="md" onClick={handleOpenAdd}>Tambah Pengguna</Button>
      </Group>

      <Paper p="xl">
        {loading ? (
          <Text size="sm" c="dimmed" ta="center" py="xl">Mengambil data pengguna...</Text>
        ) : (
          <Box>
            <Group mb="md" gap="sm" align="center" justify="space-between">
              <Group gap="sm">
                <TextInput
                  placeholder="Cari nama pengguna"
                  leftSection={<IconSearch size={16} />}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.currentTarget.value)}
                  style={{ width: '300px' }}
                />
                <Select placeholder="Semua Peran" data={ROLE_OPTIONS} value={roleFilter} onChange={setRoleFilter} clearable w={{ base: '100%', sm: 200 }} styles={selectStyles} />
                <Select placeholder="Semua Status" data={STATUS_OPTIONS} value={statusFilter} onChange={setStatusFilter} clearable w={{ base: '100%', sm: 200 }} styles={selectStyles} />
                {hasFilter && (
                  <Button variant="light" color="gray" size="sm" radius="md" leftSection={<IconX size={14} />} onClick={() => { setRoleFilter(null); setStatusFilter(null); }}>Hapus Filter</Button>
                )}
              </Group>
              <Text size="sm" c="dimmed">
                Menampilkan <Text span fw={600} c="slateClean.8">{filteredUsers.length}</Text> dari <Text span fw={600} c="slateClean.8">{users.length}</Text> pengguna
              </Text>
            </Group>

            <Table.ScrollContainer minWidth={1000}>
              <Table verticalSpacing="md" horizontalSpacing="md" highlightOnHover variant="simple" striped>
                <Table.Thead bg="slateClean.0">
                  <Table.Tr>
                    <Table.Th style={thStyle} w="18%"><Text size="xs" fw={700} c="slateClean.5">NAMA LENGKAP</Text></Table.Th>
                    <Table.Th style={thStyle} w="20%"><Text size="xs" fw={700} c="slateClean.5">EMAIL</Text></Table.Th>
                    <Table.Th style={thStyle} w="17%"><Text size="xs" fw={700} c="slateClean.5">UNIT KERJA</Text></Table.Th>
                    <Table.Th style={thStyle} w="13%"><Text size="xs" fw={700} c="slateClean.5">ROLE</Text></Table.Th>
                    <Table.Th style={thStyle} w="13%"><Text size="xs" fw={700} c="slateClean.5">STATUS</Text></Table.Th>
                    <Table.Th style={thStyle} w="12%"><Text size="xs" fw={700} c="slateClean.5">TGL. DAFTAR</Text></Table.Th>
                    <Table.Th style={thStyle} w="7%"><Text size="xs" fw={700} c="slateClean.5">AKSI</Text></Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {filteredUsers.length === 0 ? (
                    <Table.Tr>
                      <Table.Td colSpan={7} ta="center" py="xl" style={{ backgroundColor: 'var(--mantine-color-white)' }}>
                        <Stack gap="xs" align="center" py="md">
                          <IconUsers size={28} stroke={1.5} color="var(--mantine-color-slateClean-4)" />
                          <Text fw={700} c="slateClean.8" size="sm">Pengguna Tidak Ditemukan</Text>
                          <Text size="xs" c="dimmed" ta="center" maw={420}>Tidak ada pengguna yang sesuai dengan filter yang digunakan. Periksa kembali filter role atau status.</Text>
                        </Stack>
                      </Table.Td>
                    </Table.Tr>
                  ) : (
                    filteredUsers.map((user) => (
                      <Table.Tr key={user.id} style={{ backgroundColor: !user.is_active ? 'var(--mantine-color-slateClean-0)' : 'undefined', transition: 'background-color 0.2s ease' }}>
                        <Table.Td><Text size="sm" fw={600} c="slateClean.8">{user.full_name}</Text></Table.Td>
                        <Table.Td><Text size="sm" c="slateClean.6">{user.email}</Text></Table.Td>
                        <Table.Td>
                          <Text size="sm" c="slateClean.6">{user.unit_kerja || '-'}</Text>
                          {user.unit_kerja === 'Head Office' && user.division && <Text size="xs" c="dimmed">{user.division}</Text>}
                        </Table.Td>
                        <Table.Td><Badge color={getRoleBadgeColor(user.role)} variant="light" py="md" radius="sm">{user.role}</Badge></Table.Td>
                        <Table.Td><Badge color={user.is_active ? 'green' : 'slateClean'} variant="light" py="md" radius="sm">{user.is_active ? '🟢 Aktif' : '⚫ Nonaktif'}</Badge></Table.Td>
                        <Table.Td><Text size="sm" c="slateClean.5">{formatDate(user.created_at)}</Text></Table.Td>
                        <Table.Td>
                          <Group gap="xs" wrap="nowrap">
                            <Tooltip label="Edit profil" position="top" withArrow>
                              <ActionIcon size="md" variant="light" color="blue" onClick={() => handleOpenEdit(user)}><IconEdit size={18} /></ActionIcon>
                            </Tooltip>
                            {user.id !== currentUserId && (
                              <Tooltip label={user.is_active ? 'Nonaktifkan user' : 'Aktifkan user'} position="top" withArrow>
                                <ActionIcon size="md" variant="light" color={user.is_active ? 'orange' : 'green'} onClick={() => setConfirmToggleUser(user)}>
                                  {user.is_active ? <IconUserOff size={18} /> : <IconUserCheck size={18} />}
                                </ActionIcon>
                              </Tooltip>
                            )}
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    ))
                  )}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Box>
        )}
      </Paper>

      <UserFormModal opened={formModalOpened} onClose={() => { setFormModalOpened(false); setEditingUser(null); }} editingUser={editingUser} onSuccess={handleFormSuccess} />

      <Modal opened={!!confirmToggleUser} onClose={() => { if (!isToggling) setConfirmToggleUser(null); }} title={<Text fw={700} size="md" c="slateClean.9">{confirmToggleUser?.is_active ? 'Nonaktifkan Pengguna?' : 'Aktifkan Pengguna?'}</Text>} centered radius="lg">
        <Stack gap="md">
          <Text size="sm" c="slateClean.7">
            {confirmToggleUser?.is_active
              ? <>Anda akan menonaktifkan akun <b>{confirmToggleUser?.full_name}</b>. Pengguna tidak akan dapat masuk sampai diaktifkan kembali. Data dan riwayat tiket mereka tetap tersimpan.</>
              : <>Anda akan mengaktifkan kembali akun <b>{confirmToggleUser?.full_name}</b>. Pengguna akan dapat masuk seperti biasa.</>}
          </Text>
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={() => setConfirmToggleUser(null)} radius="md" disabled={isToggling}>Batal</Button>
            <Button color={confirmToggleUser?.is_active ? 'orange.8' : 'green.8'} radius="md" onClick={handleToggleConfirm} loading={isToggling}>
              {confirmToggleUser?.is_active ? 'Konfirmasi' : 'Konfirmasi'}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Box>
  );
}