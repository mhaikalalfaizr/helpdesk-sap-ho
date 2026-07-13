'use client';

import Link from 'next/link';
import { Container, Title, Text, Button, Group, Stack, Box } from '@mantine/core';
import { IconAlertCircle, IconHome } from '@tabler/icons-react';

export default function NotFoundPage() {

  return (
    <Box
      style={{
        backgroundColor: '#f8fafc',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <Container size="md">
        <Stack align="center" gap="md">
          <Box bg="gray.2" p="xl" style={{ borderRadius: '50%' }}>
            <IconAlertCircle size={64} color="#94a3b8" stroke={1.5} />
          </Box>

          <Title order={1} fw={900} style={{ fontSize: '64px', color: '#0e422a', lineHeight: 1 }}>
            404
          </Title>

          <Title order={2} fw={800} c="slateClean.9" ta="center">
            Halaman Tidak Ditemukan
          </Title>

          <Text c="dimmed" size="md" ta="center" maw={450}>
            Maaf, halaman yang Anda tuju tidak ditemukan, periksa kembali URL pencarian Anda.
          </Text>

          <Group mt="xl">
            <Button
              component={Link}
              href="/login"
              size="md"
              radius="md"
              color="ptpn4Green.9"
              leftSection={<IconHome size={18} />}
              style={{ fontWeight: 600 }}
            >
              Kembali ke Halaman Utama
            </Button>
          </Group>
        </Stack>
      </Container>
    </Box>
  );
}
