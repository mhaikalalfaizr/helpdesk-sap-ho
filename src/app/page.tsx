'use client';

import { useEffect, useState } from 'react';
import { Button, Container, Title, Text, List, ThemeIcon } from '@mantine/core';
import { supabase } from '@/lib/supabase';

export default function Home() {
  const [categories, setCategories] = useState<any[]>([]);

  useEffect(() => {
    async function fetchCategories() {
      const { data, error } = await supabase.from('categories').select('*');
      if (error) {
        console.error('Gagal mengambil data:', error.message);
      } else if (data) {
        setCategories(data);
      }
    }
    fetchCategories();
  }, []);

  return (
    <Container size="sm" style={{ paddingTop: '40px' }}>
      <Title order={1} c="blue">DocuTrack PalmCo</Title>
      <Text my="md">Koneksi Supabase berhasil dipasang!</Text>
      
      <Text fw={700} mt="xl" mb="xs">Daftar Kategori Utama di Database:</Text>
      <List spacing="xs" size="sm" center>
        {categories.map((cat) => (
          <List.Item key={cat.id}>
            <b>{cat.name}</b> — Batas SLA: {cat.sla_days} Hari
          </List.Item>
        ))}
      </List>
    </Container>
  );
}