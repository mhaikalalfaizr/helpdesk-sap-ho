'use client';

import { useState } from 'react';
import { Container, Card, TextInput, PasswordInput, Button, Title, Text, Stack } from '@mantine/core';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

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
          setMessage(`Eror: ID '${authData.user.id.substring(0, 8)}...' gak ketemu di tabel profiles. Cek konsol browser!`);
          setLoading(false);
          return;
        }

        const userRole = (profileData.role || 'USER').toUpperCase();

        setMessage(`Login sukses! Role anda: ${profileData.role || 'Tidak Ada'}. Mengalihkan...`);

        if (userRole === 'PIC') {
            router.push('/dashboard/pic');
            } else {
            router.push('/dashboard/user');
        }
      }
    } catch (error: any) {
      setMessage(`Eror: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container size="xs" style={{ paddingTop: '100px' }} suppressHydrationWarning>
      <Card shadow="md" padding="xl" radius="md" withBorder>
        <Title order={2} ta="center" c="blue" mb="xs">Masuk ke DocuTrack</Title>
        <Text size="sm" ta="center" c="dimmed" mb="lg">PalmCo Request Tracking System</Text>

        <form onSubmit={handleLogin}>
          <Stack>
            <TextInput
              label="Email"
              placeholder="nama@ptpn4.go.id"
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <PasswordInput
              label="Kata Sandi"
              placeholder="Masukkan kata sandi"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            {message && (
              <Text size="xs" c={message.startsWith('Eror') ? 'red' : 'green'} ta="center" fw={500}>
                {message}
              </Text>
            )}

            <Button type="submit" fullWidth loading={loading} mt="md">
              Login
            </Button>
          </Stack>
        </form>
      </Card>
    </Container>
  );
}