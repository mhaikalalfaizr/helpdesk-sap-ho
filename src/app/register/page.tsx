'use client';

import { useState } from 'react';
import { Container, Card, TextInput, PasswordInput, Button, Title, Text, Stack, Select } from '@mantine/core';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';

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
  const [message, setMessage] = useState('');

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

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

        if (profileError) {throw new Error(`Gagal Simpan Profil: ${profileError.message} (Kode: ${profileError.code})`);};

        setMessage('Registrasi sukses! Data divisi tersimpan. Mengalihkan ke login...');
        setTimeout(() => {
          router.push('/login');
        }, 2000);
      }
    } catch (error: any) {
      setMessage(`Eror: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container size="xs" style={{ paddingTop: '80px' }} suppressHydrationWarning>
      <Card shadow="md" padding="xl" radius="md" withBorder>
        <Title order={2} ta="center" c="blue" mb="xs">Daftar Akun Baru</Title>
        <Text size="sm" ta="center" c="dimmed" mb="lg">DocuTrack PalmCo System</Text>

        <form onSubmit={handleRegister}>
          <Stack>
            <TextInput
              label="Nama Lengkap"
              placeholder="Masukkan nama lengkap sesuai identitas"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
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

                styles={{
                    dropdown: {
                    backgroundColor: '#ffffff',
                    border: '1px solid #e2e8f0',
                    },
                    option: {
                    color: '#1a1a1a',
                    fw: 500,
                    '&[dataHovered]': {
                        backgroundColor: '#f1f5f9',
                    },
                    },
                }}
            />
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
              placeholder="Minimal 6 karakter"
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
              Daftar Sekarang
            </Button>
          </Stack>
        </form>
      </Card>
    </Container>
  );
}