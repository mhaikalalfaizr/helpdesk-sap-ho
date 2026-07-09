'use client';

import Link from 'next/link';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { notifications } from '@mantine/notifications';
import {
  Container, Paper, TextInput, PasswordInput, Button, Title, Text, Stack, Box, Group, Center, Divider, ActionIcon, Tooltip, Anchor
} from '@mantine/core';
import { IconMail, IconLock, IconChecklist, IconAlertCircle } from '@tabler/icons-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) throw authError;

      if (authData.user) {
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', authData.user.id)
          .maybeSingle();

        if (profileError) throw profileError;

        if (!profileData) {
          console.log("ID dari Auth yang dicari:", authData.user.id);
          notifications.show({
            title: 'Profil Tidak Ditemukan',
            message: `ID '${authData.user.id.substring(0, 8)}...' belum terdaftar.`,
            color: 'red',
            autoClose: 5000,
          });
          setLoading(false);
          return;
        }

        const userRole = (profileData.role || 'USER').toUpperCase();

        notifications.show({
          title: 'Autentikasi Berhasil',
          message: `Selamat datang kembali, ${profileData.full_name || 'Pengaju'}. Mengalihkan ke halaman ${userRole}...`,
          color: 'green',
          autoClose: 3000,
        });

        if (userRole === 'Staf' || userRole === 'Koordinator') {
          router.push('/dashboard/staf');
        } else {
          router.push('/dashboard/pengajuan');
        }
      }
    } catch (error: any) {
      notifications.show({
        title: 'Gagal Masuk',
        message: error.message || 'Email atau kata sandi yang Anda masukkan salah.',
        color: 'red',
        icon: <IconAlertCircle size={16} />,
        autoClose: 5000,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box style={{ backgroundColor: '#f8fafc', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }} px="md">
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
              Selamat Datang
            </Title>
            <Text size="xs" c="slateClean.5" ta="left" mt={2}>
              Silakan masukkan kredensial akun anda
            </Text>
          </Box>

          <form onSubmit={handleLogin}>
            <Stack gap="md">
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
                placeholder="Masukkan kata sandi Anda"
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
                Masuk
              </Button>
            </Stack>
          </form>

          <Text size="xs" ta="center" mt="xl" c="slateClean.5" fw={500}>
            Belum memiliki akun?{' '}
            <Anchor
              component={Link}
              href="/register"
              fw={700}
              color="ptpn4Green.9"
              onClick={() => router.push('/register')}
              style={{ textDecoration: 'none' }}
            >
              Daftar Akun Baru
            </Anchor>
          </Text>

          <Divider my="xl" labelPosition="center" />
          <Text size="10px" c="dimmed" ta="center">
            Menerapkan enkripsi SSL end-to-end terhubung dengan cloud storage Supabase.
          </Text>

        </Paper>
      </Container>
    </Box>
  );
}
