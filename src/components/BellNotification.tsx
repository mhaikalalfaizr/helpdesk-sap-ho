'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Popover, ActionIcon, Indicator, Stack, Text, Box, ScrollArea, Group, ThemeIcon, Divider } from '@mantine/core';
import { IconBell, IconCheck, IconMessageCircle2 } from '@tabler/icons-react';

interface BellNotificationProps {
  userId: string;
  role: string;
}

const STORAGE_KEY_PREFIX = 'notif_seen_ids_';

export default function BellNotification({ userId, role }: BellNotificationProps) {
  const [supabase] = useState(() => createClient());
  const [notifications, setNotifications] = useState<any[]>([]);
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());
  const [unreadCount, setUnreadCount] = useState(0);
  const [opened, setOpened] = useState(false);

  const loadSeenIds = useCallback(() => {
    try {
      const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${userId}`);
      return raw ? new Set<string>(JSON.parse(raw)) : new Set<string>();
    } catch {
      return new Set<string>();
    }
  }, [userId]);

  const saveSeenIds = useCallback((ids: Set<string>) => {
    try {
      const arr = Array.from(ids).slice(-50);
      localStorage.setItem(`${STORAGE_KEY_PREFIX}${userId}`, JSON.stringify(arr));
    } catch { }
  }, [userId]);

  const fetchNotifications = useCallback(async () => {
    try {
      let requestIds: string[] = [];
      const isKoordinator = role === 'Koordinator';

      if (role === 'Pengaju') {
        const { data: myReqs } = await supabase.from('requests').select('id').eq('user_id', userId);
        requestIds = myReqs?.map(r => r.id) || [];
      } else if (role === 'Staf') {
        const { data: myAssigned } = await supabase.from('requests').select('id').eq('current_pic_id', userId);
        requestIds = myAssigned?.map(r => r.id) || [];
      }

      if (!isKoordinator && requestIds.length === 0) return;

      let query = supabase
        .from('request_logs')
        .select(`
          id, created_at, status_after, notes, changed_by,
          requests ( ticket_number, request_title ),
          profiles:changed_by ( full_name )
        `)
        .order('created_at', { ascending: false })
        .limit(20);

      if (!isKoordinator) {
        query = query.in('request_id', requestIds);
      }

      const { data: logs } = await query;

      if (logs) {
        const filtered = logs.filter(log => log.changed_by !== userId);
        setNotifications(filtered);

        const currentSeen = loadSeenIds();
        setSeenIds(currentSeen);
        const unread = filtered.filter(log => !currentSeen.has(log.id)).length;
        setUnreadCount(unread);
      }
    } catch (err) {
      console.error('Error fetching notifications:', err);
    }
  }, [userId, role, supabase, loadSeenIds]);

  useEffect(() => {
    if (!userId) return;

    fetchNotifications();

    const channelName = `bell-notif-${userId}`;
    const channel = supabase.channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requests' }, () => {
        setTimeout(fetchNotifications, 700);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, fetchNotifications]);

  const handleOpen = () => {
    setOpened(true);

    if (unreadCount > 0) {
      const newSeen = new Set(seenIds);
      notifications.forEach(n => newSeen.add(n.id));
      saveSeenIds(newSeen);
      setUnreadCount(0);
    }
  };

  const handleToggle = (isOpen: boolean) => {
    if (isOpen) {
      handleOpen();
    } else {
      setSeenIds(loadSeenIds());
      setOpened(false);
    }
  };

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleDateString('id-ID', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
    });
  };

  return (
    <Popover opened={opened} onChange={handleToggle} position="bottom-end" withArrow shadow="md" width={320}>
      <Popover.Target>
        <Indicator color="red" size={10} offset={4} disabled={unreadCount === 0} processing>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="lg"
            radius="xl"
            onClick={() => handleToggle(!opened)}
          >
            <IconBell size={20} stroke={1.5} />
          </ActionIcon>
        </Indicator>
      </Popover.Target>

      <Popover.Dropdown p={0} style={{ border: '1px solid var(--mantine-color-slateClean-2)', borderRadius: '12px', overflow: 'hidden' }}>
        <Box p="md" bg="slateClean.0" style={{ borderBottom: '1px solid var(--mantine-color-slateClean-2)' }}>
          <Group justify="space-between">
            <Text fw={700} size="sm" c="slateClean.9">Notifikasi</Text>
            {unreadCount > 0 && (
              <Text size="xs" fw={600} c="ptpn4Green.9">{unreadCount} Baru</Text>
            )}
          </Group>
        </Box>

        <ScrollArea h={350} type="hover">
          {notifications.length === 0 ? (
            <Stack align="center" gap="xs" py="xl" px="md">
              <IconCheck size={32} color="var(--mantine-color-slateClean-3)" />
              <Text size="sm" c="dimmed" ta="center">Tidak ada notifikasi untuk Anda.</Text>
            </Stack>
          ) : (
            notifications.map((notif, index) => {
              const isUnread = !seenIds.has(notif.id);

              return (
                <Box key={notif.id}>
                  <Box p="md" bg={isUnread ? 'green.0' : 'white'} style={{ transition: 'background-color 0.2s ease' }}>
                    <Group wrap="nowrap" align="flex-start" gap="sm">
                      <ThemeIcon variant="light" color={isUnread ? 'green' : 'gray'} size="md" radius="xl" mt={2}>
                        <IconMessageCircle2 size={16} />
                      </ThemeIcon>
                      <Box style={{ flex: 1 }}>
                        <Text size="xs" fw={700} c="slateClean.8">
                          {notif.requests?.ticket_number} — {notif.status_after}
                        </Text>
                        <Text size="xs" c="slateClean.6" mt={2} lineClamp={2}>
                          <Text span fw={600}>{notif.profiles?.full_name}</Text>: {notif.notes}
                        </Text>
                        <Text size="10px" c="dimmed" mt={6}>
                          {formatTime(notif.created_at)}
                        </Text>
                      </Box>
                    </Group>
                  </Box>
                  {index < notifications.length - 1 && <Divider color="slateClean.1" />}
                </Box>
              );
            })
          )}
        </ScrollArea>
      </Popover.Dropdown>
    </Popover>
  );
}
