'use client';

import Link from 'next/link';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { notifications } from '@mantine/notifications';
import {
  Container, Paper, TextInput, PasswordInput, Button, Title, Text, Stack, Box, Group, Divider, Anchor, Select
} from '@mantine/core';
import { IconMail, IconLock, IconChecklist, IconAlertCircle, IconUser, IconBriefcase } from '@tabler/icons-react';

const divisionData = [
  { value: 'IT & ERP System', label: 'IT & ERP System' },
  { value: 'Operasional Pabrik (PKS)', label: 'Operasional Pabrik (PKS)' },
  { value: 'Tanaman & Budidaya', label: 'Tanaman & Budidaya' },
  { value: 'Akuntansi & Keuangan', label: 'Akuntansi & Keuangan' },
  { value: 'SDM', label: 'SDM' },
  { value: 'Umum', label: 'Umum' },
  { value: 'Pengadaan & Logistik', label: 'Pengadaan & Logistik' },
  { value: 'Legal & Tata Kelola (GCG)', label: 'Legal & Tata Kelola (GCG)' },
  { value: 'Manajemen Risiko (Risk Management)', label: 'Manajemen Risiko (Risk Management)' },
];

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [division, setDivision] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
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
            division: division,
            role: 'User',
          },
        ]);

        if (profileError) {
          throw new Error(`Gagal Simpan Profil: ${profileError.message} (Kode: ${profileError.code})`);
        }

        notifications.show({
          title: 'Registrasi Sukses',
          message: 'Akun Anda berhasil terdaftar. Mengalihkan...',
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
              <Text fw={900} size="24px" lts="tight" c="ptpn4Green.9">DocuTrack.</Text>
            </Group>
            <Text size="xs" c="dimmed" ta="center" fw={500}>
              PalmCo Request Monitoring System
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
                label="Divisi / Bagian"
                placeholder="Pilih atau cari divisi"
                data={divisionData}
                searchable
                clearable
                nothingFoundMessage="Divisi tidak ditemukan.."
                required
                value={division}
                onChange={(value) => setDivision(value || '')}
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
