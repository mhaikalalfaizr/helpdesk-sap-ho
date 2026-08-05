'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getSlaMetrics, countWorkingDays } from '../../../../utils/helpers';
import {
  AppShell, Group, NavLink, Stack, Box, Avatar, ActionIcon,
  SimpleGrid, Paper, Text, LoadingOverlay, Grid, Center, ThemeIcon, Progress
} from '@mantine/core';
import {
  IconLayoutDashboard, IconPresentationAnalytics, IconSettings,
  IconLogout, IconBell, IconChecklist, IconChartBar, IconChartPie
} from '@tabler/icons-react';
import { DonutChart, BarChart, type BarChartProps } from '@mantine/charts';
import { SlaSegment, PicWorkloadRow, CategoryRow } from '@/utils/types';

const CHART_TOOLTIP_PROPS: BarChartProps['tooltipProps'] = {
  cursor: { fill: 'rgba(148, 163, 184, 0.08)', radius: 6 },
};

export default function StafAnalyticsPage() {
  const router = useRouter();
  const supabase = createClient();

  const [currentUserName, setCurrentUserName] = useState('Staf');
  const [holdCount, setHoldCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({ total: 0, finished: 0, active: 0, unassigned: 0, overdue: 0, hold: 0, inProcess: 0 });
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
            id, status, created_at, updated_at, total_hold_days, custom_sla_days, current_pic_id,
            categories(id, name),
            sub_categories:sub_category_id (name, sla_days),
            pic:current_pic_id(full_name)
          `);

        if (error) throw error;

        if (requests) {
          let onTimeCount = 0;
          let overdueCount = 0;
          let finishedCount = 0;
          let processCount = 0;
          let activeCount = 0;
          let suspendedCount = 0;
          let unassignedCount = 0;
          let activeOverdueCount = 0;

          const picMap: Record<string, { name: string; count: number }> = {};
          const categoryMap: Record<string, { total: number, days: number, finishedCount: number }> = {};

          requests.forEach((req: any) => {
            if (req.status.startsWith('Sedang Ditangguhkan')) suspendedCount++;

            const isFinal = req.status === 'Disetujui' || req.status === 'Ditolak' || req.status === 'Selesai (Rilis PRD)';
            const isUnassigned = req.status === 'Dikirim';
            const isHold = req.status.startsWith('Sedang Ditangguhkan');
            const isInProcess = !isFinal && !isUnassigned && !isHold;
            if (isFinal) finishedCount++;
            else if (isUnassigned) unassignedCount++;
            else if (isInProcess) processCount++;
            else if (isHold) suspendedCount++;

            const effectiveSlaDays = (req.categories?.name === 'Tiket Lainnya') ? (req.custom_sla_days ?? null) : 7;
            const metrics = getSlaMetrics(req.created_at, req.status, req.total_hold_days, effectiveSlaDays, req.updated_at, publicHolidays);
            if (isFinal) {
              if (metrics.isOverdue) overdueCount++;
              else onTimeCount++;
            } else {
              if (metrics.isOverdue) activeOverdueCount++;
            }

            if (!isFinal && req.current_pic_id) {
              const picName = req.pic?.full_name || 'Staf (Tidak Diketahui)';
              if (!picMap[req.current_pic_id]) {
                picMap[req.current_pic_id] = { name: picName, count: 0 };
              }
              picMap[req.current_pic_id].count += 1;
            }

            let catName = req.categories?.name || 'Tidak Diketahui';

            if ((req.categories?.name === 'Tiket Lainnya') && req.sub_categories?.name) {
              catName = req.sub_categories?.name;
            }

            if (!categoryMap[catName]) {
              categoryMap[catName] = { total: 0, days: 0, finishedCount: 0 };
            }
            categoryMap[catName].total += 1;

            if (isFinal) {
              const created = new Date(req.created_at).getTime();
              const updated = new Date(req.updated_at).getTime();

              const workingDays = countWorkingDays(created, updated, publicHolidays);

              const netDays = Math.max(0, workingDays - (req.total_hold_days || 0));

              categoryMap[catName].days += netDays;
              categoryMap[catName].finishedCount += 1;
            }
          });

          setHoldCount(suspendedCount);
          setSummary({ total: requests.length, finished: finishedCount, active: activeCount, unassigned: unassignedCount, overdue: activeOverdueCount, hold: suspendedCount, inProcess: processCount });

          setSlaComplianceData([
            { name: 'Tepat Waktu', value: onTimeCount, color: 'var(--mantine-color-ptpn4Green-5)' },
            { name: 'Terlambat', value: overdueCount, color: 'var(--mantine-color-red-6)' }
          ]);

          setPicWorkloadData(
            Object.values(picMap)
              .map(pic => ({ picName: pic.name, ticketCount: pic.count }))
              .sort((a, b) => b.ticketCount - a.ticketCount)
          );

          setCategoryData(
            Object.keys(categoryMap)
              .map(name => {
                const data = categoryMap[name];
                const avg = data.finishedCount > 0 ? (data.days / data.finishedCount) : 0;

                return {
                  categoryName: name,
                  totalTickets: data.total,
                  averageDays: Number(avg.toFixed(1))
                };
              })
              .sort((a, b) => b.totalTickets - a.totalTickets)
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

        { }
        <SimpleGrid cols={{ base: 2, sm: 3, lg: 6 }} spacing="lg" mb="xl">
          <Paper bg="ptpn4Green.9" p="xl" radius="md">
            <Text size="xs" fw={700} c="ptpn4Green.2" lts="0.5px" truncate="end">
              TOTAL TIKET MASUK
            </Text>
            <Text size="36px" fw={800} my="xs" c="white">{loading ? '...' : summary.total}</Text>
            <Text size="xs" c="ptpn4Green.1" fw={500}>Keseluruhan pengajuan</Text>
          </Paper>

          <Paper p="xl" radius="md" style={{ border: '1px solid var(--mantine-color-slateClean-2)' }}>
            <Text size="xs" fw={700} c="slateClean.4" lts="0.5px" truncate="end">
              MENUNGGU RESPON
            </Text>
            <Text size="36px" fw={800} my="xs" c="slateClean.9">{loading ? '...' : summary.unassigned}</Text>
            <Text size="xs" c="red.6" fw={500}>Tiket belum ditugaskan</Text>
          </Paper>

          <Paper p="xl" radius="md" style={{ border: '1px solid var(--mantine-color-slateClean-2)' }}>
            <Text size="xs" fw={700} c="slateClean.4" lts="0.5px" truncate="end">
              DALAM PROSES
            </Text>
            <Text size="36px" fw={800} my="xs">{loading ? '...' : summary.inProcess}</Text>
            <Text size="xs" c="blue.6" fw={500}>Sedang ditinjau</Text>
          </Paper>

          <Paper p="xl" radius="md" style={{ border: '1px solid var(--mantine-color-slateClean-2)' }}>
            <Text size="xs" fw={700} c="slateClean.4" lts="0.5px" truncate="end">
              DITANGGUHKAN
            </Text>
            <Text size="36px" fw={800} my="xs">{loading ? '...' : summary.hold}</Text>
            <Text size="xs" c="orange.6" fw={500}>Penangguhan aktif</Text>
          </Paper>

          <Paper p="xl" radius="md" style={{ border: '1px solid var(--mantine-color-slateClean-2)' }}>
            <Text size="xs" fw={700} c="slateClean.4" lts="0.5px" truncate="end">
              LEWAT BATAS WAKTU
            </Text>
            <Text size="36px" fw={800} my="xs" c="red.7">{loading ? '...' : summary.overdue}</Text>
            <Text size="xs" c="red.7" fw={600}>Melewati batas waktu</Text>
          </Paper>

          <Paper p="xl" radius="md" style={{ border: '1px solid var(--mantine-color-slateClean-2)' }}>
            <Text size="xs" fw={700} c="slateClean.4" lts="0.5px" truncate="end">
              TIKET SELESAI
            </Text>
            <Text size="36px" fw={800} my="xs">{loading ? '...' : summary.finished}</Text>
            <Text size="xs" c="green.6" fw={500}>Telah diselesaikan</Text>
          </Paper>
        </SimpleGrid>

        <Grid gap="lg">
          <Grid.Col span={{ base: 12, md: 5 }}>
            <Paper
              p="xl"
              radius="md"
              h="100%"
              style={{ border: '1px solid var(--mantine-color-slateClean-2)', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}
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
                    <Box mt={10} w={220} h={220} fw={1000} style={{ minWidth: 220, minHeight: 220 }}>
                      <DonutChart
                        data={slaComplianceData}
                        size={200}
                        thickness={30}
                        paddingAngle={3}
                        strokeWidth={2}
                        strokeColor="var(--mantine-color-white)"
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
              style={{ border: '1px solid var(--mantine-color-slateClean-2)', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}
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
                    dataKey="picName"
                    series={[{ name: 'ticketCount', label: 'Jumlah Tiket', color: 'ptpn4Green.7' }]}
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

          { }
          <Grid.Col span={{ base: 12, lg: 6 }}>
            <Paper
              p="xl"
              radius="md"
              h="100%"
              style={{ border: '1px solid var(--mantine-color-slateClean-2)', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}
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
                    dataKey="categoryName"
                    orientation="vertical"
                    series={[{ name: 'totalTickets', label: 'Total Tiket', color: 'blue.6' }]}
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

          { }
          <Grid.Col span={{ base: 12, lg: 6 }}>
            <Paper
              p="xl"
              radius="md"
              h="100%"
              style={{ border: '1px solid var(--mantine-color-slateClean-2)', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}
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
                    dataKey="categoryName"
                    orientation="vertical"
                    series={[{ name: 'averageDays', label: 'Rata-rata Waktu (Hari)', color: 'teal.6' }]}
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
