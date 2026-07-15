'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getSlaMetrics } from '../../../../utils/helpers';
import {
  AppShell, Group, NavLink, Stack, Box, Avatar, ActionIcon,
  SimpleGrid, Paper, Text, LoadingOverlay, Grid, Center, ThemeIcon, Progress
} from '@mantine/core';
import {
  IconLayoutDashboard, IconPresentationAnalytics, IconSettings,
  IconLogout, IconBell, IconChecklist, IconChartBar, IconChartPie
} from '@tabler/icons-react';
import { DonutChart, BarChart, type BarChartProps } from '@mantine/charts';

interface SlaSegment {
  name: string;
  value: number;
  color: string;
}

interface PicWorkloadRow {
  staf: string;
  'Jumlah Tiket': number;
}

interface CategoryRow {
  kategori: string;
  Total: number;
  'Rata-rata Waktu (Hari)': number;
}

const CHART_TOOLTIP_PROPS: BarChartProps['tooltipProps'] = {
  cursor: { fill: 'rgba(148, 163, 184, 0.08)', radius: 6 },
};

export default function StafAnalyticsPage() {
  const router = useRouter();
  const supabase = createClient();

  const [currentUserName, setCurrentUserName] = useState('Staf');
  const [holdCount, setHoldCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({ total: 0, finished: 0, active: 0 });
  const [slaComplianceData, setSlaComplianceData] = useState<SlaSegment[]>([]);
  const [picWorkloadData, setPicWorkloadData] = useState<PicWorkloadRow[]>([]);
  const [categoryData, setCategoryData] = useState<CategoryRow[]>([]);

  useEffect(() => {
    const fetchAndProcessAnalytics = async () => {
      setLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();

        if (user) {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', user.id)
            .maybeSingle();
          if (profileData) setCurrentUserName(profileData.full_name || 'Staf');
        }

        const { data: holidayData } = await supabase.from('public_holidays').select('holiday_date');
        const publicHolidays = holidayData ? holidayData.map(h => h.holiday_date) : [];

        const { data: requests, error } = await supabase
          .from('requests')
          .select(`
            id, status, created_at, updated_at, total_hold_days, custom_sla_days,
            categories(id, name),
            sub_categories:sub_category_id (name, sla_days),
            pic:current_pic_id(full_name)
          `);

        if (error) throw error;

        if (requests) {
          let onTimeCount = 0;
          let overdueCount = 0;
          let finishedCount = 0;
          let activeCount = 0;
          let suspendedCount = 0;

          const picMap: Record<string, number> = {};
          const categoryMap: Record<string, { total: number, days: number, finishedCount: number }> = {};

          requests.forEach((req: any) => {
            if (req.status.startsWith('Sedang Ditangguhkan')) suspendedCount++;

            const isFinal = req.status === 'Disetujui' || req.status === 'Ditolak' || req.status === 'Selesai (Rilis PRD)';
            if (isFinal) finishedCount++;
            else activeCount++;

            const effectiveSlaDays = (req.categories?.id === 4 || req.categories?.name === 'Tiket Lainnya')
              ? (req.custom_sla_days ?? 7) : 7;
            const metrics = getSlaMetrics(req.created_at, req.status, req.total_hold_days, effectiveSlaDays, req.updated_at, publicHolidays);

            if (isFinal){
                if (metrics.isOverdue) overdueCount++;
            else onTimeCount++;
            }

            if (!isFinal && req.pic?.full_name) {
              picMap[req.pic.full_name] = (picMap[req.pic.full_name] || 0) + 1;
            }

            let catName = req.categories?.name || 'Tidak Diketahui';

            if ((catName === 'Tiket Lainnya' || req.categories?.id === 4) && req.sub_categories?.name) {
              catName = req.sub_categories?.name;
            }

            if (!categoryMap[catName]) {
              categoryMap[catName] = { total: 0, days: 0, finishedCount: 0 };
            }
            categoryMap[catName].total += 1;

            if (isFinal) {
              const created = new Date(req.created_at);
              const updated = new Date(req.updated_at);
              const diffMs = updated.getTime() - created.getTime();

              let diffDays = diffMs / (1000 * 60 * 60 * 24);
              diffDays = Math.max(0, diffDays - (req.total_hold_days || 0));

              categoryMap[catName].days += diffDays;
              categoryMap[catName].finishedCount += 1;
            }
          });

          setHoldCount(suspendedCount);
          setSummary({ total: requests.length, finished: finishedCount, active: activeCount });

          setSlaComplianceData([
            { name: 'Tepat Waktu', value: onTimeCount, color: '#41a877' },
            { name: 'Terlambat', value: overdueCount, color: '#fa5252' }
          ]);

          setPicWorkloadData(
            Object.keys(picMap)
              .map(name => ({ staf: name, 'Jumlah Tiket': picMap[name] }))
              .sort((a, b) => b['Jumlah Tiket'] - a['Jumlah Tiket'])
          );

          setCategoryData(
            Object.keys(categoryMap)
              .map(name => {
                const data = categoryMap[name];
                const avg = data.finishedCount > 0 ? (data.days / data.finishedCount) : 0;

                return {
                  kategori: name,
                  Total: data.total,
                  'Rata-rata Waktu (Hari)': Number(avg.toFixed(1))
                };
              })
              .sort((a, b) => b.Total - a.Total)
          );
        }
      } catch (err) {
        console.error('Gagal memproses data analitik:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAndProcessAnalytics();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  const slaTotal = useMemo(
    () => slaComplianceData.reduce((sum, item) => sum + item.value, 0),
    [slaComplianceData]
  );
  const onTimeCount = slaComplianceData.find(d => d.name === 'Tepat Waktu')?.value ?? 0;
  const complianceRate = slaTotal > 0 ? Math.round((onTimeCount / slaTotal) * 100) : 0;
  const hasSlaData = slaTotal > 0;

  return (
    <>
        <Box mb="xl" pos="relative">

          <Stack gap="sm" mb="xl">
            <Text size="28px" fw={800} c="slateClean.9" style={{ letterSpacing: '-0.5px' }}>Dashboard Analitik Kinerja</Text>
            <Text size="sm" c="dimmed">Visualisasi data operasional untuk membantu pengambilan keputusan.</Text>
          </Stack>

          {}
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="lg" mb="xl">
            <Paper
              bg="ptpn4Green.9"
              p="xl"
              radius="md"
              style={{ boxShadow: '0 4px 12px rgba(14, 66, 42, 0.2)' }}
            >
              <Text size="xs" fw={700} c="ptpn4Green.2" lts="0.5px" truncate="end">
                TOTAL TIKET MASUK
              </Text>
              <Text size="36px" fw={800} my="xs" c="#fff">{loading ? '...' : summary.total}</Text>
              <Text size="xs" c="ptpn4Green.1" fw={500}>Keseluruhan pengajuan</Text>
            </Paper>

            <Paper p="xl" radius="md">
              <Text size="xs" fw={700} c="slateClean.4" lts="0.5px" truncate="end">
                TIKET SELESAI
              </Text>
              <Text size="36px" fw={800} my="xs" c="slateClean.9">{loading ? '...' : summary.finished}</Text>
              <Text size="xs" c="green.6" fw={500}>Telah diselesaikan</Text>
            </Paper>

            <Paper p="xl" radius="md">
              <Text size="xs" fw={700} c="slateClean.4" lts="0.5px" truncate="end">
                DALAM PROSES
              </Text>
              <Text size="36px" fw={800} my="xs" c="slateClean.9">{loading ? '...' : summary.active}</Text>
              <Text size="xs" c="blue.6" fw={500}>Sedang ditangani PIC</Text>
            </Paper>

            <Paper p="xl" radius="md">
              <Text size="xs" fw={700} c="slateClean.4" lts="0.5px" truncate="end">
                DITANGGUHKAN
              </Text>
              <Text size="36px" fw={800} my="xs" c="slateClean.9">{loading ? '...' : holdCount}</Text>
              <Text size="xs" c="orange.6" fw={500}>Penangguhan aktif</Text>
            </Paper>
          </SimpleGrid>

          <Grid gap="lg">
            <Grid.Col span={{ base: 12, md: 5 }}>
              <Paper
                p="xl"
                radius="md"
                h="100%"
                style={{ border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}
              >
                <Group gap="sm" mb="lg">
                  <ThemeIcon size={36} radius="md" color="ptpn4Green" variant="light">
                    <IconChartPie size={18} />
                  </ThemeIcon>
                  <Box>
                    <Text size="md" fw={700} c="slateClean.8">Tingkat Kepatuhan SLA</Text>
                    <Text size="xs" c="dimmed">Perbandingan tiket tepat waktu vs terlambat</Text>
                  </Box>
                </Group>

                {hasSlaData && !loading ? (
                  <>
                    <Center>
                      <Box mt={10} w={220} h={220} fw = {1000} style={{ minWidth: 220, minHeight: 220 }}>
                        <DonutChart
                          data={slaComplianceData}
                          size={200}
                          thickness={30}
                          paddingAngle={3}
                          strokeWidth={2}
                          strokeColor="#ffffff"
                          tooltipDataSource="segment"
                          chartLabel={`${complianceRate}%`}
                          withLabels={false}
                          withTooltip

                          styles={{
                            label: {
                            fontSize: '28px',
                            fontWeight: 500,
                            fill: 'var(--mantine-color-slateClean-8)',
                            }
                        }}
                        />
                      </Box>
                    </Center>

                    <Text ta="center" size="xs" c="dimmed" mt="xs" mb="lg">Tingkat kepatuhan SLA</Text>

                    <Stack gap="md">
                      {slaComplianceData.map((item) => {
                        const pct = slaTotal > 0 ? Math.round((item.value / slaTotal) * 100) : 0;
                        return (
                          <Box key={item.name}>
                            <Group justify="space-between" mb={6}>
                              <Group gap="xs">
                                <Box w={10} h={10} style={{ borderRadius: '50%', backgroundColor: item.color }} />
                                <Text size="sm" fw={500} c="slateClean.7">{item.name}</Text>
                              </Group>
                              <Text size="sm" fw={700} c="slateClean.8">{item.value} ({pct}%)</Text>
                            </Group>
                            <Progress
                              value={pct}
                              size="sm"
                              radius="xl"
                              color={item.name === 'Tepat Waktu' ? 'ptpn4Green' : 'red'}
                            />
                          </Box>
                        );
                      })}
                    </Stack>
                  </>
                ) : (
                  <Center h={280}>
                    <Stack align="center" gap="xs">
                      <ThemeIcon size={48} radius="xl" color="gray" variant="light">
                        <IconChartPie size={24} />
                      </ThemeIcon>
                      <Text size="sm" c="dimmed" fs="italic">Belum ada data SLA untuk ditampilkan.</Text>
                    </Stack>
                  </Center>
                )}
              </Paper>
            </Grid.Col>

            <Grid.Col span={{ base: 12, md: 7 }}>
              <Paper
                p="xl"
                radius="md"
                h="100%"
                style={{ border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}
              >
                <Group gap="sm" mb="lg">
                  <ThemeIcon size={36} radius="md" color="ptpn4Green" variant="light">
                    <IconChartBar size={18} />
                  </ThemeIcon>
                  <Box>
                    <Text size="md" fw={700} c="slateClean.8">Beban Kerja PIC Aktif</Text>
                    <Text size="xs" c="dimmed">Distribusi tiket yang sedang dipegang oleh staf saat ini</Text>
                  </Box>
                </Group>

                {picWorkloadData.length > 0 && !loading ? (
                  <Box w="100%" mt={40} style={{ minWidth: 0 }}>
                    <BarChart
                      h={Math.max(330, picWorkloadData.length * 48)}
                      data={picWorkloadData}
                      dataKey="staf"
                      series={[{ name: 'Jumlah Tiket', color: 'ptpn4Green.7' }]}
                      tickLine="y"
                      gridAxis="y"
                      gridColor="slateClean.2"
                      textColor="slateClean.6"
                      strokeDasharray="4 4"
                      barProps={{ radius: [6, 6, 0, 0], maxBarSize: 48 }}
                      yAxisProps={{ allowDecimals: false, width: 36 }}
                      xAxisProps={{ tickMargin: 8 }}
                      tooltipProps={CHART_TOOLTIP_PROPS}
                      valueFormatter={(value) => `${value}`}
                    />
                  </Box>
                ) : (
                  <Center h={260}>
                    <Stack align="center" gap="xs">
                      <ThemeIcon size={48} radius="xl" color="gray" variant="light">
                        <IconChartBar size={24} />
                      </ThemeIcon>
                      <Text size="sm" c="dimmed" fs="italic">Tidak ada tiket aktif yang sedang didelegasikan.</Text>
                    </Stack>
                  </Center>
                )}
              </Paper>
            </Grid.Col>

            {}
            <Grid.Col span={{ base: 12, lg: 6 }}>
              <Paper
                p="xl"
                radius="md"
                h="100%"
                style={{ border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}
              >
                <Group gap="sm" mb="lg">
                  <ThemeIcon size={36} radius="md" color="blue" variant="light">
                    <IconChartBar size={18} />
                  </ThemeIcon>
                  <Box>
                    <Text size="md" fw={700} c="slateClean.8">Volume Tiket per Kategori</Text>
                    <Text size="xs" c="dimmed">Jumlah pengajuan yang masuk</Text>
                  </Box>
                </Group>

                {categoryData.length > 0 && !loading ? (
                  <Box w="100%" style={{ minWidth: 0 }}>
                    <BarChart
                      h={Math.max(280, categoryData.length * 44)}
                      data={categoryData}
                      dataKey="kategori"
                      orientation="vertical"
                      series={[{ name: 'Total', color: 'blue.6' }]}
                      tickLine="x"
                      gridAxis="x"
                      gridColor="slateClean.2"
                      textColor="slateClean.6"
                      strokeDasharray="4 4"
                      barProps={{ radius: [0, 6, 6, 0], maxBarSize: 28 }}
                      yAxisProps={{ width: 120, tickMargin: 8 }}
                      xAxisProps={{ allowDecimals: false }}
                      tooltipProps={CHART_TOOLTIP_PROPS}
                      valueFormatter={(value) => `${value} tiket`}
                    />
                  </Box>
                ) : (
                  <Center h={280}>
                    <Text size="sm" c="dimmed" fs="italic">Data belum tersedia.</Text>
                  </Center>
                )}
              </Paper>
            </Grid.Col>

            {}
            <Grid.Col span={{ base: 12, lg: 6 }}>
              <Paper
                p="xl"
                radius="md"
                h="100%"
                style={{ border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}
              >
                <Group gap="sm" mb="lg">
                  <ThemeIcon size={36} radius="md" color="teal" variant="light">
                    <IconPresentationAnalytics size={18} />
                  </ThemeIcon>
                  <Box>
                    <Text size="md" fw={700} c="slateClean.8">Kecepatan Penyelesaian</Text>
                    <Text size="xs" c="dimmed">Rata-rata hari untuk menyelesaikan tiket (di luar penangguhan)</Text>
                  </Box>
                </Group>

                {categoryData.length > 0 && !loading ? (
                  <Box w="100%" style={{ minWidth: 0 }}>
                    <BarChart
                      h={Math.max(280, categoryData.length * 44)}
                      data={categoryData}
                      dataKey="kategori"
                      orientation="vertical"
                      series={[{ name: 'Rata-rata Waktu (Hari)', color: 'teal.6' }]}
                      tickLine="x"
                      gridAxis="x"
                      gridColor="slateClean.2"
                      textColor="slateClean.6"
                      strokeDasharray="4 4"
                      barProps={{ radius: [0, 6, 6, 0], maxBarSize: 28 }}
                      yAxisProps={{ width: 120, tickMargin: 8 }}
                      xAxisProps={{ allowDecimals: false }}
                      tooltipProps={CHART_TOOLTIP_PROPS}
                      valueFormatter={(value) => `${value} Hari`}
                    />
                  </Box>
                ) : (
                  <Center h={280}>
                    <Text size="sm" c="dimmed" fs="italic">Belum ada tiket selesai.</Text>
                  </Center>
                )}
              </Paper>
            </Grid.Col>
          </Grid>
        </Box>
    </>
  );
}
