'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { notifications } from '@mantine/notifications';
import { Modal, TextInput, Select, Button, Stack, Group, Text } from '@mantine/core';
import { IconBriefcase, IconLock, IconMail, IconUser} from '@tabler/icons-react';
import { UserProfile } from '@/utils/types';

type ManagedUser = UserProfile & {
  division?: string | null;
};

interface UserFormModalProps {
  opened: boolean;
  onClose: () => void;
  editingUser: ManagedUser | null;
  onSuccess: (savedUser: ManagedUser) => void;
}

const ROLE_OPTIONS = [
  { value: 'Koordinator', label: 'Koordinator' },
  { value: 'Staf', label: 'Staf' },
  { value: 'Pengaju', label: 'Pengaju' },
];

const inputStyles = {
  label: { fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' },
  input: {
    backgroundColor: '#f8fafc',
    border: '1px solid #e2e8f0',
  },
  dropdown: {
    backgroundColor: '#ffffff',
    border: '1px solid #e2e8f0',
  },
  option: {
    color: '#1a1a1a',
    fontWeight: 500,
    '&[dataHovered]': { backgroundColor: '#f1f5f9' },
  },
};

export default function UserFormModal({ opened, onClose, editingUser, onSuccess }: UserFormModalProps) {
  const supabase = createClient();
  const isEditMode = editingUser !== null;

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [workUnit, setWorkUnit] = useState<string | null>('');
  const [division, setDivision] = useState<string | null>('');
  const [role, setRole] = useState<string | null>('Pengaju');

  const [workUnitOptions, setWorkUnitOptions] = useState<{ value: string; label: string }[]>([]);
  const [divisionOptions, setDivisionOptions] = useState<{ value: string; label: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingWorkUnits, setLoadingWorkUnits] = useState(false);
  const [loadingDivisions, setLoadingDivisions] = useState(false);

  useEffect(() => {
    if (!opened) return;

    const fetchWorkUnits = async () => {
      setLoadingWorkUnits(true);

      const { data, error } = await supabase
        .from('work_unit')
        .select('id, name')
        .order('name', { ascending: true });

      if (error) {
        console.error('Gagal mengambil unit kerja:', error);
        notifications.show({
          title: 'Gagal',
          message: 'Tidak dapat mengambil daftar unit kerja.',
          color: 'red',
        });
      } else {
        setWorkUnitOptions(
          (data || []).map((unit) => ({
            value: unit.id,
            label: unit.name,
          }))
        );
      }

      setLoadingWorkUnits(false);
    };

    fetchWorkUnits();
  }, [opened]);

  useEffect(() => {
    const fetchDivisions = async () => {
      if (workUnit !== 'Head Office') {
        setDivisionOptions([]);
        setDivision('');
        return;
      }

      setLoadingDivisions(true);

      const { data, error } = await supabase
        .from('divisions')
        .select('code, name')
        .eq('work_unit_id', 'Head Office')
        .order('name', { ascending: true });

      if (error) {
        console.error('Gagal mengambil divisi:', error);
        notifications.show({
          title: 'Gagal',
          message: 'Tidak dapat mengambil daftar divisi.',
          color: 'red',
        });
        setDivisionOptions([]);
      } else {
        setDivisionOptions(
          (data || []).map((div) => ({
            value: div.name,
            label: `${div.code} - ${div.name}`,
          }))
        );
      }

      setLoadingDivisions(false);
    };

    fetchDivisions();
  }, [workUnit]);

  useEffect(() => {
    if (!opened) return;

    if (editingUser) {
      setFullName(editingUser.full_name || '');
      setEmail(editingUser.email || '');
      setWorkUnit(editingUser.work_unit || '');
      setDivision(editingUser.work_unit === 'Head Office' ? editingUser.division || '' : '');
      setRole(editingUser.role || 'Pengaju');
      setPassword('');
      setConfirmPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    } else {
      setFullName('');
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setWorkUnit('');
      setDivision('');
      setRole('Pengaju');
    }
  }, [editingUser, opened]);

  const handleSubmit = async () => {
    const cleanName = fullName.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanWorkUnit = workUnit?.trim() || null;
    const cleanDivision = cleanWorkUnit === 'Head Office' ? division?.trim() || '' : '-';

    if (!cleanName) {
      notifications.show({ title: 'Data Belum Lengkap', message: 'Nama lengkap wajib diisi.', color: 'red' });
      return;
    }

    if (!isEditMode && !cleanEmail) {
      notifications.show({ title: 'Data Belum Lengkap', message: 'Email wajib diisi.', color: 'red' });
      return;
    }

    if (!cleanWorkUnit) {
      notifications.show({ title: 'Data Belum Lengkap', message: 'Unit kerja wajib dipilih.', color: 'red' });
      return;
    }

    if (cleanWorkUnit === 'Head Office' && !cleanDivision) {
      notifications.show({ title: 'Data Belum Lengkap', message: 'Divisi wajib dipilih untuk Head Office.', color: 'red' });
      return;
    }

    if (!isEditMode && password.length < 8) {
      notifications.show({ title: 'Data Belum Lengkap', message: 'Kata sandi minimal 8 karakter.', color: 'red' });
      return;
    }

    if (!isEditMode && password !== confirmPassword) {
      notifications.show({ title: 'Data Belum Lengkap', message: 'Konfirmasi kata sandi tidak cocok.', color: 'red' });
      return;
    }

    if (isEditMode && newPassword && newPassword.length < 8) {
      notifications.show({ title: 'Data Belum Lengkap', message: 'Kata sandi baru minimal 8 karakter.', color: 'red' });
      return;
    }

    if (isEditMode && newPassword && newPassword !== confirmNewPassword) {
      notifications.show({ title: 'Data Belum Lengkap', message: 'Konfirmasi kata sandi baru tidak cocok.', color: 'red' });
      return;
    }

    if (!role) {
      notifications.show({ title: 'Data Belum Lengkap', message: 'Role wajib dipilih.', color: 'red' });
      return;
    }

    setLoading(true);

    try {
      if (isEditMode) {
        const { error } = await supabase
          .from('profiles')
          .update({
            full_name: cleanName,
            work_unit: cleanWorkUnit,
            division: cleanDivision,
            role,
          })
          .eq('id', editingUser.id);

        if (error) throw new Error(error.message);

        if (newPassword.trim()) {
          const res = await fetch('/api/admin/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              targetUserId: editingUser.id,
              newPassword,
            }),
          });

          const json = await res.json();

          if (!res.ok) {
            throw new Error(json.error || 'Gagal mereset password.');
          }
        }

        onSuccess({
          ...editingUser,
          full_name: cleanName,
          work_unit: cleanWorkUnit,
          division: cleanDivision,
          role: role as UserProfile['role'],
        });

        notifications.show({
          title: 'Pembaruan Berhasil',
          message: `Profil ${cleanName} berhasil diperbarui.`,
          color: 'green',
        });
      } else {
        const res = await fetch('/api/admin/create-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            full_name: cleanName,
            email: cleanEmail,
            password,
            work_unit: cleanWorkUnit,
            division: cleanDivision,
            role,
          }),
        });

        const json = await res.json();

        if (!res.ok) {
          throw new Error(json.error || 'Gagal membuat akun pengguna baru.');
        }

        onSuccess({
          id: json.userId,
          full_name: cleanName,
          email: cleanEmail,
          work_unit: cleanWorkUnit,
          division: cleanDivision,
          role: role as UserProfile['role'],
          is_active: true,
          created_at: new Date().toISOString(),
        });

        notifications.show({
          title: 'Pengguna Ditambahkan',
          message: `Akun untuk ${cleanName} berhasil dibuat.`,
          color: 'green',
        });
      }

      onClose();
    } catch (err: any) {
      notifications.show({
        title: 'Gagal',
        message: err?.message || 'Terjadi kesalahan.',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={<Text fw={700} size="md" c="slateClean.9">{isEditMode ? `Edit Pengguna: ${editingUser?.full_name}` : 'Tambah Pengguna Baru'}</Text>}
      size="md"
      radius="md"
      centered
    >
      <Stack gap="sm">

        <TextInput
          label="Alamat Email"
          placeholder="nama@email.com"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.currentTarget.value)}
          required={!isEditMode}
          disabled={isEditMode}
          leftSection={<IconMail size={16} stroke={1.5} color="#94a3b8" />}
          description={isEditMode ? 'Email tidak dapat diubah.' : undefined}
          radius="md"
          styles={inputStyles}
        />  

        <TextInput
          label="Nama Lengkap"
          placeholder="Masukkan nama lengkap sesuai identitas"
          value={fullName}
          onChange={(e) => setFullName(e.currentTarget.value)}
          leftSection={<IconUser size={16} stroke={1.5} color="#94a3b8" />}
          required
          radius="md"
          styles={inputStyles}
        />

        {!isEditMode && (
          <>
            <TextInput
              label="Kata Sandi"
              placeholder="Minimal 8 karakter"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              leftSection={<IconLock size={16} stroke={1.5} color="#94a3b8" />}
              required
              radius="md"
              styles={inputStyles}
            />
            <TextInput
              label="Konfirmasi Kata Sandi"
              placeholder="Ketik ulang kata sandi"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.currentTarget.value)}
              leftSection={<IconLock size={16} stroke={1.5} color="#94a3b8" />}
              required
              radius="md"
              styles={inputStyles}
            />
          </>
        )}

        <Select
          label="Unit Kerja"
          placeholder="Pilih atau cari unit kerja"
          data={workUnitOptions}
          searchable
          clearable
          nothingFoundMessage="Unit kerja tidak ditemukan."
          value={workUnit}
          onChange={setWorkUnit}
          leftSection={<IconBriefcase size={16} stroke={1.5} color="#94a3b8" />}
          rightSection={loadingWorkUnits ? undefined : undefined}
          required
          radius="md"
          disabled={loadingWorkUnits}
          styles={inputStyles}
        />

        {workUnit === 'Head Office' && (
          <Select
            label="Divisi"
            placeholder="Cari atau pilih divisi"
            data={divisionOptions}
            searchable
            clearable
            nothingFoundMessage="Divisi tidak ditemukan."
            value={division}
            onChange={setDivision}
            leftSection={<IconBriefcase size={16} stroke={1.5} color="#94a3b8" />}
            required
            radius="md"
            disabled={loadingDivisions}
            styles={inputStyles}
          />
        )}

        {isEditMode && (
          <>
            <TextInput
              label="Kata Sandi Baru"
              placeholder="Kosongkan jika tidak ingin mengubah kata sandi"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.currentTarget.value)}
              leftSection={<IconLock size={16} stroke={1.5} color="#94a3b8" />}
              description="Minimal 8 karakter. Kosongkan jika tidak perlu diganti."
              radius="md"
              styles={inputStyles}
            />
            {newPassword && (
              <TextInput
                label="Konfirmasi Kata Sandi Baru"
                placeholder="Ketik ulang kata sandi baru"
                type="password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.currentTarget.value)}
                leftSection={<IconLock size={16} stroke={1.5} color="#94a3b8" />}
                required
                radius="md"
                styles={inputStyles}
              />
            )}
          </>
        )}

        <Select
          label="Peran"
          placeholder="Pilih peran pengguna"
          data={ROLE_OPTIONS}
          value={role}
          onChange={setRole}
          required
          radius="md"
          styles={inputStyles}
        />

        <Group justify="flex-end" gap="sm" mt="sm">
          <Button variant="default" size="sm" radius="md" onClick={onClose} disabled={loading}>Batal</Button>
          <Button color="ptpn4Green" size="sm" radius="md" onClick={handleSubmit} loading={loading}>
            {isEditMode ? 'Simpan Perubahan' : 'Tambah Pengguna'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
