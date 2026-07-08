'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { notifications } from '@mantine/notifications';
import {
  Container, Paper, TextInput, PasswordInput, Button, Title, Text, Stack, Box, Group, Divider, Anchor, Select
} from '@mantine/core';
import { IconMail, IconLock, IconChecklist, IconAlertCircle, IconUser, IconBriefcase } from '@tabler/icons-react';

export default function RegisterPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');

  const [workUnitOptions, setWorkUnitOptions] = useState<{ value: string; label: string }[]>([]);
  const [divisionOptions, setDivisionOptions] = useState<{ value: string; label: string }[]>([]);

  const [workUnit, setWorkUnit] = useState<string | null>('');
  const [division, setDivision] = useState<string | null>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchWorkUnit = async () => {
      const { data, error } = await supabase
        .from('work_unit')
        .select('id, name');

      if (data) {
        setWorkUnitOptions(data.map(unit => ({
          value: unit.id,
          label: unit.name
        })));
      }
    };

    fetchWorkUnit();
  }, []);

  useEffect(() => {
    const fetchDivisions = async () => {
      if (workUnit === 'Head Office') {
        const { data, error } = await supabase
          .from('divisions')
          .select('code, name')
          .eq('work_unit_id', 'Head Office');

        if (data) {
          setDivisionOptions(data.map(div => ({
            value: div.name,
            label: `${div.code} - ${div.name}`
          })));
        }
      } else {
        setDivisionOptions([]);
        setDivision('');
      }
    };

    fetchDivisions();
  }, [workUnit]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!workUnit || (workUnit === 'Head Office' && !division)) {
        notifications.show({
          title: 'Data Belum Lengkap',
          message: 'Harap pilih Unit Kerja dan Divisi Anda.',
          color: 'orange'
        });
        setLoading(false);
        return;
      }

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (authError) throw authError;

      if (authData.user) {
        const { error: profileError } = await supabase.from('profiles').insert([
          {
            id: authData.user.id,
            email,
            full_name: fullName,
            unit_kerja: workUnit,
            division: workUnit === 'Head Office' ? division : ' ',
            role: 'User',
          },
        ]);

        if (profileError) {
          throw new Error(`Gagal Simpan Profil: ${profileError.message} (Kode: ${profileError.code})`);
        }

        notifications.show({
          title: 'Registrasi Sukses',
          message: 'Akun Anda berhasil terdaftar. Mengalihkan ke halaman login...',
          color: 'green',
          autoClose: 3000,
        });

        setTimeout(() => {
          router.push('/login');
        }, 2000);
      }
    } catch (error: any) {
      notifications.show({
        title: 'Registrasi Gagal',
        message: error.message || 'Terjadi kesalahan sistem saat mendaftarkan akun.',
        color: 'red',
        icon: <IconAlertCircle size={16} />,
        autoClose: 5000,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box style={{ backgroundColor: '#f8fafc', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }} px="md" suppressHydrationWarning>
      <Container size={650} w="100%">
        <Paper p="xl" radius="lg" shadow="md" withBorder style={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0' }}>

          <Stack align="center" gap="xs" mb="xl">
            <Box bg="ptpn4Green.0" p="xs" style={{ borderRadius: '12px', display: 'flex', alignItems: 'center' }}>
              <IconChecklist size={32} color="#0e422a" />
            </Box>
            <Group gap={4} mt={4}>
              <Text fw={900} size="24px" lts="tight" c="ptpn4Green.9">{process.env.NEXT_PUBLIC_APP_NAME}</Text>
            </Group>
            <Text size="xs" c="dimmed" ta="center" fw={500}>
              Sistem Pengajuan Dokumen HO
            </Text>
          </Stack>

          <Box mb="lg">
            <Title order={3} fw={800} c="slateClean.9" ta="left" style={{ letterSpacing: '-0.5px' }}>
              Daftar Akun Baru
            </Title>
            <Text size="xs" c="slateClean.5" ta="left" mt={2}>
              Lengkapi data di bawah ini untuk mendaftar.
            </Text>
          </Box>

          <form onSubmit={handleRegister}>
            <Stack gap="sm">
              <TextInput
                label="Nama Lengkap"
                placeholder="Masukkan nama lengkap sesuai identitas"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                leftSection={<IconUser size={16} stroke={1.5} color="#94a3b8" />}
                radius="md"
                styles={{
                  label: { fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' },
                  input: { backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }
                }}
              />

              <Select
                label="Unit Kerja"
                placeholder="Pilih atau cari unit kerja anda"
                data={workUnitOptions}
                searchable
                clearable
                nothingFoundMessage="Unit kerja tidak ditemukan.."
                required
                value={workUnit}
                onChange={(value) => {
                  setWorkUnit(value);
                }}
                leftSection={<IconBriefcase size={16} stroke={1.5} color="#94a3b8" />}
                radius="md"
                styles={{
                  label: { fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' },
                  input: { backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' },
                  dropdown: { backgroundColor: '#ffffff', border: '1px solid #e2e8f0' },
                  option: {
                    color: '#1a1a1a',
                    fontWeight: 500,
                    '&[dataHovered]': { backgroundColor: '#f1f5f9' },
                  },
                }}
              />

              {workUnit === 'Head Office' && (
                <Select
                  label="Divisi"
                  placeholder="Cari atau pilih divisi anda"
                  data={divisionOptions}
                  searchable
                  clearable
                  nothingFoundMessage="Divisi tidak ditemukan.."
                  required
                  value={division}
                  onChange={setDivision}
                  leftSection={<IconBriefcase size={16} stroke={1.5} color="#94a3b8" />}
                  radius="md"
                  styles={{
                    label: { fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' },
                    input: { backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' },
                    dropdown: { backgroundColor: '#ffffff', border: '1px solid #e2e8f0' }
                  }}
                />
              )}

              <TextInput
                label="Alamat Email"
                placeholder="nama@email.com"
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                leftSection={<IconMail size={16} stroke={1.5} color="#94a3b8" />}
                radius="md"
                styles={{
                  label: { fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' },
                  input: { backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }
                }}
              />

              <PasswordInput
                label="Kata Sandi"
                placeholder="Minimal 6 karakter"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                leftSection={<IconLock size={16} stroke={1.5} color="#94a3b8" />}
                radius="md"
                styles={{
                  label: { fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' },
                  input: { backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }
                }}
              />

              <Button
                type="submit"
                fullWidth
                loading={loading}
                mt="md"
                size="md"
                radius="md"
                color="ptpn4Green.9"
                style={{ fontSize: '14px', fontWeight: 600 }}
              >
                Daftar Sekarang
              </Button>
            </Stack>
          </form>

          <Text size="xs" ta="center" mt="xl" c="slateClean.5" fw={500}>
            Sudah memiliki akun?{' '}
            <Anchor
              component={Link}
              href="/login"
              fw={700}
              color="ptpn4Green.9"
              onClick={() => router.push('/login')}
              style={{ textDecoration: 'none' }}
            >
              Masuk
            </Anchor>
          </Text>

          <Divider my="xl" labelPosition="center" />
          <Text size="10px" c="dimmed" ta="center">
            Menerapkan enkripsi SSL end-to-end terhubung cloud storage Supabase.
          </Text>

        </Paper>
      </Container>
    </Box>
  );
}
