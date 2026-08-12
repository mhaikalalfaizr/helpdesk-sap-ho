'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { AppShell, Group, Avatar, Box, Text, Stack, NavLink, Badge, Divider } from '@mantine/core';
import { IconChecklist, IconLogout, IconFilePlus, IconHistory } from '@tabler/icons-react';

export default function PengajuanLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const [currentUserName, setCurrentUserName] = useState('Pengaju');
  const [processCount, setProcessCount] = useState(0);

  useEffect(() => {
    const initLayout = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
        if (profile) setCurrentUserName(profile.full_name || 'Pengaju');

        const { count } = await supabase
          .from('requests')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .or('status.ilike.%Dalam Proses%,status.eq.Dikirim');
        setProcessCount(count || 0);
      }
    };
    initLayout();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  return (
    <AppShell header={{ height: 75 }}
      navbar={{ width: 300, breakpoint: 'sm' }}
      padding="xl">

      <AppShell.Header bg="white" px="xl" style={{ borderBottom: '1px solid rgba(226, 232, 240, 0.8)' }}>
        <Group justify="space-between" h="100%">
          <Group gap="lg" h="100%">
            <Avatar src={null} alt="User" color="ptpn4Green.9" radius="xl" />
            <Box>
              <Text size="sm" fw={600} c="slateClean.9">Halo, {currentUserName}</Text>
              <Text size="xs" c="dimmed">Selamat datang di {process.env.NEXT_PUBLIC_APP_NAME}</Text>
            </Box>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md" bg="white" style={{ borderRight: '1px solid rgba(226, 232, 240, 0.8)' }}>
        <Stack justify="between" h="100%">
          <Box>
            <Group px="sm" py="md" mb="xl">
              <Box bg="ptpn4Green.0" p="xs" style={{ borderRadius: '12px', display: 'flex', alignItems: 'center' }}>
                <IconChecklist size={24} color="#0e422a" />
              </Box>
              <Text fw={800} size="xl" lts="tight" c="ptpn4Green.9">{process.env.NEXT_PUBLIC_APP_NAME}</Text>
            </Group>

            <Stack gap={4}>
              <Text size="xs" fw={700} c="slateClean.4" px="sm" mb={4} lts="0.5px">MENU UTAMA</Text>
              <NavLink
                label="Buat Pengajuan"
                leftSection={<IconFilePlus size={18} stroke={1.5} />}
                active={pathname === '/dashboard/request'}
                onClick={() => router.push('/dashboard/request')}
                style={{ borderRadius: '8px' }} py="sm"
              />
              <NavLink
                label="Lacak Status Tiket"
                leftSection={<IconHistory size={18} stroke={1.5} />}
                active={pathname === '/dashboard/request/history'}
                onClick={() => router.push('/dashboard/request/history')}
                style={{ borderRadius: '8px' }} py="sm"
                rightSection={processCount > 0 ? <Badge size="xs" color="ptpn4Green.9" variant="filled">{processCount}</Badge> : null}
              />
              <Divider my="sm" />
              <NavLink label="Keluar Aplikasi" leftSection={<IconLogout size={18} stroke={1.5} />} color="red" py="sm" onClick={handleLogout} style={{ borderRadius: '8px' }} />
            </Stack>
          </Box>
        </Stack>
      </AppShell.Navbar>

      <AppShell.Main>
        {children}
      </AppShell.Main>
    </AppShell>
  );
}
