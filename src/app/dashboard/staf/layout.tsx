'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { AppShell, Group, Avatar, Box, Text, ActionIcon, Stack, NavLink } from '@mantine/core';
import { IconLayoutDashboard, IconPresentationAnalytics, IconSettings, IconLogout, IconBell, IconChecklist } from '@tabler/icons-react';

export default function StafLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const [currentUserName, setCurrentUserName] = useState('Staf');

  useEffect(() => {
    const fetchProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
        if (data) setCurrentUserName(data.full_name || 'Staf');
      }
    };
    fetchProfile();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

return(
  <AppShell
          header={{ height: 75 }}
          navbar={{ width: 300, breakpoint: 'sm' }}
          padding="xl"
        >

          <AppShell.Header bg="white" px="xl" style={{ borderBottom: '1px solid rgba(226, 232, 240, 0.8)' }}>
            <Group justify="space-between" h="100%">
              <Group gap="lg" h="100%">
                <Avatar src={null} alt="Staf Monitor" color="ptpn4Green.9" radius="xl">Staf
                </Avatar>
                  <Box>
                    <Text size="sm" fw={600} c="slateClean.9">Halo, {currentUserName}</Text>
                    <Text size="xs" c="dimmed">Selamat datang di {process.env.NEXT_PUBLIC_APP_NAME}</Text>
                  </Box>
              </Group>
              <Group gap="lg" h="100%">
                <ActionIcon variant="subtle" color="gray" radius="xl" size="lg" style={{ position: 'relative' }}>
                  <IconBell size={20} stroke={1.5} />
                </ActionIcon>
              </Group>
            </Group>
          </AppShell.Header>

          <AppShell.Navbar p="md" bg="white" style={{ borderRight: 'none' }}>
            <Stack justify="between" h="100%">
              <Box>
                <Group px="sm" py="md" mb="xl">
                  <Box bg="ptpn4Green.0" p="xs" style={{ borderRadius: '12px', display: 'flex', alignItems: 'center' }}>
                    <IconChecklist size={24} color="#0e422a" />
                  </Box>
                  <Text fw={800} size="xl" lts="tight" c="ptpn4Green.9">{process.env.NEXT_PUBLIC_APP_NAME}</Text>
                </Group>

                <Stack gap={4}>
                  <Text size="xs" fw={700} c="slateClean.4" px="sm" mb={4} lts="0.5px">MENU</Text>
                  <NavLink
                    label="Antrean Tiket"
                    leftSection={<IconLayoutDashboard size={18} stroke={1.5} />}
                    active={pathname === '/dashboard/staf'}
                    onClick={() => router.push('/dashboard/staf')}
                    py="sm"
                  />
                  <NavLink
                    label="Analisis Kinerja"
                    leftSection={<IconPresentationAnalytics size={18} stroke={1.5} />}
                    active={pathname === '/dashboard/staf/analytics'}
                    onClick={() => router.push('/dashboard/staf/analytics')}
                    py="sm" style={{ borderRadius: '8px' }}
                  />

                  <Text size="xs" fw={700} c="slateClean.4" px="sm" mt="xl" mb={4} lts="0.5px">SISTEM</Text>
                  <NavLink
                    label="Konfigurasi SLA" leftSection={<IconSettings size={18} stroke={1.5} />} py="sm"
                    />
                  <NavLink
                    label="Keluar Aplikasi" leftSection={<IconLogout size={18} stroke={1.5} />} color="dimmed" py="sm" onClick={handleLogout}
                    />
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
