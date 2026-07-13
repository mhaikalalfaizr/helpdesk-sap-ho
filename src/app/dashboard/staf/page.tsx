  'use client';

  import { useState, useEffect } from 'react';
  import { useRouter } from 'next/navigation';
  import { supabase } from '../../../lib/supabase';
  import { notifications } from '@mantine/notifications';
  import {
    AppShell, SimpleGrid, Paper, Text, Group, Badge, Avatar, Table, Menu, ActionIcon, TextInput, NumberInput,
    NavLink, Stack, Box, Kbd, Tooltip, Modal, Timeline, FileInput, Textarea, Button, Drawer, Divider, Select
  } from '@mantine/core';
  import {
    IconLayoutDashboard, IconFileText, IconClock, IconChecklist, IconSettings, IconLogout, IconSearch, IconBell, IconPencil,
    IconMail, IconDotsVertical, IconCheck, IconX, IconAlertCircle, IconArrowUpRight, IconDownload, IconEye, IconUserShare,
    IconPlayerPause, IconPlayerPlay, IconArrowRight, IconFileCheck
  } from '@tabler/icons-react';

  import { getSlaMetrics, countWorkingDays } from '../../../utils/helpers';

  interface RequestItem {
    id: string;
    ticket_number: string;
    request_title: string;
    description: string;
    status: string;
    total_hold_days: number;
    created_at: string;
    updated_at?: string | null;
    profiles: { full_name: string; unit_kerja: string; division: string; email?: string } | null;
    categories: { id: number; name: string; sla_days: number } | null;
    sub_categories?: { name: string; sla_days: number } | null;
    custom_sla_days?: number | null;
    file_url?: string | null;
    current_pic_id?: string | null;
    pic?: { full_name: string } | null;
    attachments?: { id: string; file_name: string; file_url: string; type: string }[] | null;
    urgency?: string | null;
  }

  interface HistoryLog {
    id: string;
    status_before: string;
    status_after: string;
    notes: string | null;
    created_at: string;
    profiles: { full_name: string } | null;
  }

  export default function PicDashboard() {
    const router = useRouter();

    const [currentPicId, setCurrentPicId] = useState<string | null>(null);
    const [currentUserName, setCurrentUserName] = useState('Staf');
    const [currentUserRole, setCurrentUserRole] = useState<string>('');
    const [requests, setRequests] = useState<RequestItem[]>([]);
    const [loading, setLoading] = useState(true);

    const [finalUploadRequest, setFinalUploadRequest] = useState<any | null>(null);
    const [finalFile, setFinalFile] = useState<File | null>(null);
    const [uploadingFinal, setUploadingFinal] = useState(false);

    const [selectedRequest, setSelectedRequest] = useState<RequestItem | null>(null);
    const [historyLogs, setHistoryLogs] = useState<HistoryLog[]>([]);
    const [loadingTimeline, setLoadingTimeline] = useState(false);

    const [rejectRequest, setRejectRequest] = useState<RequestItem | null>(null);
    const [rejectReason, setRejectReason] = useState('');
    const [rejecting, setRejecting] = useState(false);

    const [activeMenu, setActiveMenu] = useState(0);

    const [confirmNextRequest, setConfirmNextRequest] = useState<RequestItem | null>(null);
    const [confirmHoldRequest, setConfirmHoldRequest] = useState<RequestItem | null>(null);

    const [sortKey, setSortKey] = useState<string | null>('duration');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>('desc');

    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilter, setActiveFilter] = useState<string | null>(null);

    const [selectedDetail, setSelectedDetail] = useState<RequestItem | null>(null);

    const [holdReason, setHoldReason] = useState('');

    const [picList, setPicList] = useState<{ value: string; label: string; email: string }[]>([]);
    const [assignRequest, setAssignRequest] = useState<RequestItem | null>(null);
    const [selectedNewPicId, setSelectedNewPicId] = useState<string | null>(null);
    const [assigning, setAssigning] = useState(false);

    const [editingSlaId, setEditingSlaId] = useState<string | null>(null);
    const [newSlaValue, setNewSlaValue] = useState<number | ''>('');
    const [isSavingSla, setIsSavingSla] = useState(false);

    const [urgencyFilter, setUrgencyFilter] = useState<string | null>(null);
    const [publicHolidays, setPublicHolidays] = useState<string[]>([]);

    useEffect(() => {
      initPic();

      const channel = supabase
        .channel('schema-db-changes')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'requests' },
          () => {
            initPic();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }, [router]);

    const initPic = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setCurrentPicId(user.id);

      const { data: profileData } = await supabase
        .from('profiles')
        .select('full_name, role')
        .eq('id', user.id)
        .maybeSingle();

      if (!profileData || (profileData.role !== 'Koordinator' && profileData.role !== 'Staf')) {
        if (profileData?.role === 'Pengaju') {
          router.replace('/dashboard/pengajuan');
        } else {
          await supabase.auth.signOut();
          router.replace('/login');
        }
        return;
      }

      const profileName = profileData.full_name || 'Staf';
      setCurrentUserName(profileName);
      setCurrentUserRole(profileData.role);

      const { data } = await supabase
        .from('requests')
        .select(`
          id, ticket_number, request_title, description, status, total_hold_days, created_at, updated_at, file_url, current_pic_id, urgency, custom_sla_days,
          profiles:user_id (full_name, unit_kerja, division, email),
          categories:category_id (id, name, sla_days),
          sub_categories:sub_category_id (name, sla_days),
          pic:current_pic_id (full_name),
          attachments (id, file_name, file_url, type)
        `)
        .order('created_at', { ascending: false });

      if (data) setRequests(data as any);

      const { data: allPics } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('role', ['Koordinator', 'Staf'])
        .order('full_name', { ascending: true });

      if (allPics) {
        setPicList(allPics.map(p => ({
          value: p.id,
          label: p.full_name,
          email: p.email || ''
        })));
      }

      const { data: holidayData } = await supabase.from('public_holidays').select('holiday_date');
      if (holidayData) {
        setPublicHolidays(holidayData.map(h => h.holiday_date));
      }

      setLoading(false);
    };

  const handleDownloadSecureFile = async (rawUrl: string, providedFileName?: string) => {
    try {
      const pathSegments = rawUrl.split('/documents/');
      if (pathSegments.length < 2) throw new Error("Format URL tidak valid");

      const filePath = pathSegments[1];

      const { data, error } = await supabase.storage.from('documents').createSignedUrl(filePath, 60);

      if (error) throw error;

      if (data?.signedUrl) {
        const response = await fetch(data.signedUrl);
        if (!response.ok) throw new Error('Server gagal merespons file.');

        const blob = await response.blob();
        const objectUrl = window.URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = objectUrl;

        let finalName = providedFileName;

        if (!finalName || finalName === 'undefined') {
          const urlParts = rawUrl.split('/');
          finalName = urlParts[urlParts.length - 1] || 'Dokumen_Unduhan.pdf';
        }

        link.download = finalName;

        document.body.appendChild(link);
        link.click();

        document.body.removeChild(link);
        window.URL.revokeObjectURL(objectUrl);
      }
    } catch (err: any) {
      notifications.show({ title: 'Akses Ditolak', message: 'Gagal mengunduh dokumen: ' + err.message, color: 'red' });
    }
  };

    const getProjectedDate = (daysToAdd: number) => {
      if (!daysToAdd) return '-';
      const projected = new Date();
      projected.setDate(projected.getDate() + daysToAdd);
      return projected.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    };

    const handleOpenTimeline = async (req: RequestItem) => {
      setSelectedRequest(req);
      setLoadingTimeline(true);

      const { data } = await supabase
        .from('request_logs')
        .select(`
          id, status_before, status_after, notes, created_at,
          profiles:changed_by (full_name)
        `)
        .eq('request_id', req.id)
        .order('created_at', { ascending: true });

      if (data) setHistoryLogs(data as any);
      setLoadingTimeline(false);
    };

    const handleOpenDetailAndLogs = async (req: RequestItem) => {
      setSelectedDetail(req);
      setLoadingTimeline(true);

      const { data } = await supabase
        .from('request_logs')
        .select(`
          id, status_before, status_after, notes, created_at,
          profiles:changed_by (full_name)
        `)
        .eq('request_id', req.id)
        .order('created_at', { ascending: true });

      if (data) setHistoryLogs(data as any);
      setLoadingTimeline(false);
    };

    const handleAssignPic = async () => {
      if (!assignRequest) return;
      setAssigning(true);

      try {
        const previousPicName = assignRequest.pic?.full_name || 'Belum Ditentukan';
        const newPicTarget = picList.find(p => p.value === selectedNewPicId);
        const newPicName = newPicTarget ? newPicTarget.label : 'Belum Ditentukan (Unassigned)';

        const { error: updateError } = await supabase
          .from('requests')
          .update({
            current_pic_id: selectedNewPicId,
            updated_at: new Date().toISOString()
          })
          .eq('id', assignRequest.id);

        if (updateError) throw updateError;

        const logNotes = `Tiket dialihkan oleh ${currentUserName} dari [${previousPicName}] ke [${newPicName}]`;
        await supabase.from('request_logs').insert([
          {
            request_id: assignRequest.id,
            changed_by: currentPicId,
            status_before: assignRequest.status,
            status_after: assignRequest.status,
            notes: logNotes
          }
        ]);

        const emailPayloads = [];

        if (assignRequest.profiles?.email) {
          emailPayloads.push({
            recipientEmail: assignRequest.profiles.email,
            recipientName: assignRequest.profiles.full_name,
            notes: `Penanggung jawab tiket Anda telah diperbarui menjadi: ${newPicName}.`
          });
        }

        if (newPicTarget && selectedNewPicId !== currentPicId) {
          emailPayloads.push({
            recipientEmail: newPicTarget.email,
            recipientName: newPicTarget.label,
            notes: `Anda telah ditunjuk oleh ${currentUserName} untuk menangani tiket ini.`
          });
        }

        await Promise.all(
          emailPayloads.map(async (payload) => {
            try {
              const emailRes = await fetch('/api/send-email', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${process.env.NEXT_PUBLIC_INTERNAL_API_KEY}`
                },
                body: JSON.stringify({
                  ticketNumber: assignRequest.ticket_number,
                  title: assignRequest.request_title,
                  status: payload.recipientEmail === assignRequest.profiles?.email
                            ? 'Pembaruan Penanggung Jawab'
                            : 'Tugas Baru Dialokasikan',
                  notes: payload.notes,
                  recipientEmail: payload.recipientEmail,
                  recipientName: payload.recipientName
                }),
              });

              if (!emailRes.ok) {
                 const err = await emailRes.json();
                 console.error('Email notifikasi delegasi gagal dikirim:', err);
              }
            } catch (e) {
              console.error('Gagal mengirim sub-email notifikasi delegasi (jaringan terputus):', e);
            }
          })
        );

        setRequests(prev => prev.map(r => r.id === assignRequest.id ? {
          ...r,
          current_pic_id: selectedNewPicId,
          pic: newPicTarget ? { full_name: newPicTarget.label } : null
        } : r));

        notifications.show({
          title: 'Delegasi Berhasil',
          message: `Tiket ${assignRequest.ticket_number} sukses ditugaskan ke ${newPicName}.`,
          color: 'green'
        });

        setAssignRequest(null);
        setSelectedNewPicId(null);
      } catch (err: any) {
        notifications.show({ title: 'Gagal Mengalihkan Penugasan Tiket', message: err.message, color: 'red' });
      } finally {
        setAssigning(false);
      }
    };

    const updateDatabaseStatus = async (id: string, payload: any, logStatusName: string, notes: string = 'Sinkronisasi status birokrasi manual oleh Staf') => {
      try {
        const targetRequest = requests.find(r => r.id === id);

        const crucialStatuses = [
          'Sedang Ditangguhkan di Staf',
          'Sedang Ditangguhkan di Head Office',
          'Sedang Ditangguhkan di Holding',
          'Ditolak',
          'Selesai (Rilis PRD)',
          'Disetujui'
        ];

        if (targetRequest && crucialStatuses.includes(logStatusName)) {
          try {
            const emailRes = await fetch('/api/send-email', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.NEXT_PUBLIC_INTERNAL_API_KEY}`
              },
              body: JSON.stringify({
                ticketNumber: targetRequest.ticket_number,
                title: targetRequest.request_title,
                status: logStatusName,
                notes: notes,
                recipientEmail: targetRequest.profiles?.email,
                recipientName: targetRequest.profiles?.full_name
              }),
            });

            if (!emailRes.ok) {
              const errData = await emailRes.json();
              console.error('API menolak pengiriman email:', errData);
            }
          } catch (emailErr) {
            console.error('Jaringan terputus saat mengirim email notifikasi:', emailErr);
          }
        }

        const { data: updatedData, error: reqError } = await supabase
          .from('requests')
          .update({
            ...payload,
            current_pic_id: currentPicId,
            updated_at: new Date().toISOString()
          })
          .eq('id', id)
          .select();

        if (reqError) throw reqError;

        if (!updatedData || updatedData.length === 0) {
          throw new Error("Gagal menyimpan! Database menolak update status ini.");
        }

        await supabase.from('request_logs').insert([
          {
            request_id: id,
            changed_by: currentPicId,
            status_before: requests.find(r => r.id === id)?.status || null,
            status_after: logStatusName,
            notes: notes
          }
        ]);

        setRequests((prev) =>
          prev.map((r) => (r.id === id ? { ...r, ...payload } : r))
        );

        notifications.show({
          title: 'Status Berhasil Diperbarui',
          message: `Tiket berhasil dipindahkan ke fase: ${logStatusName}`,
          color: logStatusName === 'Ditolak' ? 'red' : 'green',
          autoClose: 4000,
        });

      } catch (err: any) {
        notifications.show({
          title: 'Sistem Gagal Memperbarui',
          message: err.message,
          color: 'red',
          autoClose: 5000,
        });
      }
    };

    const handleNextStep = async (req: RequestItem) => {
      let nextStatus = '';

      if (req.categories?.name === 'Tiket Lainnya' || req.categories?.id === 4) {
        switch (req.status) {
          case 'Dikirim': nextStatus = 'Dalam Proses oleh Staf'; break;
          case 'Dalam Proses oleh Staf': nextStatus = 'Dalam Tahap Elisitasi Kebutuhan Pengguna'; break;
          case 'Dalam Tahap Elisitasi Kebutuhan Pengguna': nextStatus = 'Dalam Tahap Pelaporan ke Konsultan'; break;
          case 'Dalam Tahap Pelaporan ke Konsultan': nextStatus = 'Dalam Tahap Pengembangan'; break;
          case 'Dalam Tahap Pengembangan': nextStatus = 'Dalam Tahap Pengujian Penerimaan Pengguna (UAT)'; break;
          case 'Dalam Tahap Pengujian Penerimaan Pengguna (UAT)': nextStatus = 'Selesai (Rilis PRD)'; break;
          default: return;
        }

        if (req.status === 'Dalam Tahap Pengujian Penerimaan Pengguna (UAT)') {
          await updateDatabaseStatus(req.id, { status: nextStatus }, nextStatus, 'Tiket selesai, PRD dirilis.');
          return;
        }
      }
      else {
        switch (req.status) {
          case 'Dikirim': nextStatus = 'Dalam Proses oleh Staf'; break;
          case 'Dalam Proses oleh Staf': nextStatus = 'Dalam Proses oleh Head Office'; break;
          case 'Dalam Proses oleh Head Office': nextStatus = 'Dalam Proses oleh Holding'; break;
          default: return;
        }
      }

      await updateDatabaseStatus(req.id, { status: nextStatus }, nextStatus, 'Maju ke tahap selanjutnya.');
    };

    const handleUpdateSla = async (reqId: string) => {
      if (newSlaValue === '' || newSlaValue <= 0) {
        notifications.show({ title: 'Invalid', message: 'Masukkan angka hari yang valid.', color: 'red' });
        return;
      }

      setIsSavingSla(true);
      try {
        const { error } = await supabase
          .from('requests')
          .update({ custom_sla_days: newSlaValue })
          .eq('id', reqId);

        if (error) throw error;

        notifications.show({ title: 'SLA Diperbarui', message: 'Target batas waktu penyelesaian berhasil diubah.', color: 'green' });
        setEditingSlaId(null);

        if (selectedDetail && selectedDetail.id === reqId) {
          setSelectedDetail({ ...selectedDetail, custom_sla_days: Number(newSlaValue) });
        }

      } catch (error: any) {
        notifications.show({ title: 'Gagal Update', message: error.message, color: 'red' });
      } finally {
        setIsSavingSla(false);
      }
    };

    const handleSubmitFinalDocument = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!finalUploadRequest || !finalFile || !currentPicId) return;
      setUploadingFinal(true);

      try {
          const fileExt = finalFile.name.split('.').pop();
          const fileName = `final-${finalUploadRequest.ticket_number}-${Date.now()}.${fileExt}`;
          const filePath = `final_docs/${fileName}`;

          const { error: uploadError } = await supabase.storage.from('documents').upload(filePath, finalFile);
          if (uploadError) throw uploadError;

          const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(filePath);

          const { error: attachError } = await supabase.from('attachments').insert([
          {
              request_id: finalUploadRequest.id,
              file_name: finalFile.name,
              file_url: publicUrl,
              uploaded_by: currentPicId,
              type: 'Dokumen_Final'
          }
          ]);
          if (attachError) throw attachError;

          await updateDatabaseStatus(finalUploadRequest.id, { status: 'Disetujui' }, 'Disetujui', 'Pengajuan disetujui. Dokumen akhir dilampirkan.');

          notifications.show({
            title: 'Pengajuan Disetujui',
            message: `Dokumen akhir untuk tiket nomor ${finalUploadRequest.ticket_number} sukses diunggah.`,
            color: 'green',
          });

          setFinalUploadRequest(null);
          setFinalFile(null);
      } catch (err: any) {
          notifications.show({
            title: 'Gagal Menyelesaikan Pengajuan',
            message: err.message,
            color: 'red',
          });
      } finally {
          setUploadingFinal(false);
      }
    };

    const handleToggleHold = async (req: RequestItem, notes: string = holdReason) => {
      const nowStr = new Date().toISOString();
      let nextStatus = '';

      if (req.status.startsWith('Dalam Proses oleh')) {
        if (req.status.includes('Staf')) nextStatus = 'Sedang Ditangguhkan di Staf';
        else if (req.status.includes('Head Office')) nextStatus = 'Sedang Ditangguhkan di Head Office';
        else if (req.status.includes('Holding')) nextStatus = 'Sedang Ditangguhkan di Holding';

        if (!nextStatus) {
          notifications.show({ title: 'Gagal Memproses', message: `Sub-status tidak dikenali dari "${req.status}"`, color: 'red' });
          return;
        }

        try {
          const { error: holdError } = await supabase.from('request_holds').insert([
            { request_id: req.id, hold_reason: `Penangguhan pengajuan pada fase ${req.status}`, hold_start: nowStr }
          ]);
          if (holdError) throw holdError;

          const { error: reqError } = await supabase.from('requests').update({ status: nextStatus, updated_at: nowStr }).eq('id', req.id);
          if (reqError) throw reqError;

          const { error: logError } = await supabase.from('request_logs').insert([
            { request_id: req.id, changed_by: currentPicId, status_before: req.status, status_after: nextStatus, notes: holdReason.trim() !== '' ? notes : 'Pengajuan ditangguhkan sementara' }
          ]);
          if (logError) throw logError;

          try {
            const emailRes = await fetch('/api/send-email', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.NEXT_PUBLIC_INTERNAL_API_KEY}`
              },
              body: JSON.stringify({
                ticketNumber: req.ticket_number,
                title: req.request_title,
                status: nextStatus,
                notes: 'Pengajuan dilanjutkan ke tahap berikutnya.',
                recipientEmail: req.profiles?.email,
                recipientName: req.profiles?.full_name
              }),
            });

            if (!emailRes.ok) {
               console.error('API Resend menolak pengiriman email saat melepas penangguhan.');
            }
          } catch (e) {
            console.error('Jaringan terputus saat email pelepasan penanggguhan:', e);
          }

          setRequests((prev) => prev.map((r) => (r.id === req.id ? { ...r, status: nextStatus, updated_at: nowStr } : r)));

          notifications.show({
            title: 'Pengajuan Berhasil Ditangguhkan',
            message: `Tiket nomor ${req.ticket_number} kini berstatus Ditangguhkan.`,
            color: 'orange',
          });

        } catch (err: any) {
          notifications.show({ title: 'Eror Supabase (Hold)', message: err.message, color: 'red' });
        }

      } else if (req.status.startsWith('Sedang Ditangguhkan di')) {
        if (req.status.includes('Staf')) nextStatus = 'Dalam Proses oleh Staf';
        else if (req.status.includes('Head Office')) nextStatus = 'Dalam Proses oleh Head Office';
        else if (req.status.includes('Holding')) nextStatus = 'Dalam Proses oleh Holding';

        if (!nextStatus) {
          notifications.show({ title: 'Gagal Memproses', message: `Sub-status tidak dikenali dari "${req.status}"`, color: 'red' });
          return;
        }

        try {
          const { data: holdRows, error: fetchHoldError } = await supabase
            .from('request_holds')
            .select('id, hold_start')
            .eq('request_id', req.id)
            .is('hold_end', null)
            .order('hold_start', { ascending: false });

          if (fetchHoldError) throw fetchHoldError;

          let diffDays = 0;

          if (holdRows && holdRows.length > 0) {
            const activeHold = holdRows[0];
            const startTime = new Date(activeHold.hold_start).getTime();
            const endTime = new Date().getTime();
            diffDays = countWorkingDays(startTime, endTime, publicHolidays);

            const { error: updateHoldError } = await supabase
              .from('request_holds')
              .update({ hold_end: nowStr, duration_days: diffDays })
              .eq('id', activeHold.id);

            if (updateHoldError) throw updateHoldError;

            if (holdRows.length > 1) {
              const duplicateIds = holdRows.slice(1).map(h => h.id);
              await supabase
                .from('request_holds')
                .update({ hold_end: nowStr, duration_days: 0, hold_reason: 'Pembersihan otomatis data ganda' })
                .in('id', duplicateIds);
            }
          }

          const newTotalHoldDays = (req.total_hold_days || 0) + diffDays;

          const { error: reqError } = await supabase
            .from('requests')
            .update({ status: nextStatus, total_hold_days: newTotalHoldDays, updated_at: nowStr })
            .eq('id', req.id);
          if (reqError) throw reqError;

          const actualNotes = notes.trim() !== '' ? notes : 'Proses kembali dilanjutkan.';

          const { error: logError } = await supabase.from('request_logs').insert([
            { request_id: req.id, changed_by: currentPicId, status_before: req.status, status_after: nextStatus, notes: actualNotes }
          ]);

          setRequests((prev) => prev.map((r) => (r.id === req.id ? { ...r, status: nextStatus, total_hold_days: newTotalHoldDays, updated_at: nowStr } : r)));

          notifications.show({
            title: 'Penangguhan Dilepas',
            message: `Proses Tiket ${req.ticket_number} kembali berjalan normal.`,
            color: 'green',
          });

        } catch (err: any) {
          notifications.show({ title: 'Eror Supabase (Unhold)', message: err.message, color: 'red' });
        }
      }
    };

    const handleRejectSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!rejectRequest || !rejectReason.trim()) return;
      setRejecting(true);

      try {
        await updateDatabaseStatus(
          rejectRequest.id,
          { status: 'Ditolak' },
          'Ditolak',
          `Alasan Penolakan: ${rejectReason}`
        );

        setRejectRequest(null);
        setRejectReason('');
      } catch (err: any) {
        alert(`Gagal menolak dokumen: ${err.message}`);
      } finally {
        setRejecting(false);
      }
    };

    const totalCount = requests.length;
    const unassignedCount = requests.filter(r => r.status === 'Dikirim').length;
    const processCount = requests.filter(r => r.status.startsWith('Dalam Proses')).length;
    const holdCount = requests.filter(r => r.status.startsWith('Sedang Ditangguhkan')).length;
    const archivedCount = requests.filter(r => r.status === 'Disetujui' || r.status === 'Ditolak').length;

    const getFilteredAndSortedRequests = () => {
      let filtered = [...requests];

      if (activeFilter === 'unassigned') {
        filtered = filtered.filter(r => r.status === 'Dikirim');
      } else if (activeFilter === 'process') {
        filtered = filtered.filter(r => r.status.startsWith('Dalam Proses'));
      } else if (activeFilter === 'hold') {
        filtered = filtered.filter(r => r.status.startsWith('Sedang Ditangguhkan'));
      } else if (activeFilter === 'archived') {
        filtered = filtered.filter(r => r.status === 'Disetujui' || r.status === 'Ditolak');
      }

      if (searchQuery.trim() !== '') {
        const cleanQuery = searchQuery.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        filtered = filtered.filter((req) => {
          const cleanTicket = req.ticket_number.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
          return cleanTicket.includes(cleanQuery);
        });
      }

      if (urgencyFilter) {
        filtered = filtered.filter(r => r.urgency === urgencyFilter);
      }

      if (!sortKey || !sortDirection) return filtered;

      return [...filtered].sort((a, b) => {
        let valA: any = '';
        let valB: any = '';

        if (sortKey === 'ticket') { valA = a.ticket_number; valB = b.ticket_number; }
        else if (sortKey === 'applicant') { valA = a.profiles?.full_name || ''; valB = b.profiles?.full_name || ''; }
        else if (sortKey === 'title') { valA = a.categories?.name; valB = b.categories?.name; }
        else if (sortKey === 'duration') { valA = new Date(a.created_at).getTime(); valB = new Date(b.created_at).getTime(); }
        else if (sortKey === 'status') { valA = a.status; valB = b.status; }

        if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    };

    const handleSortRequest = (key: string) => {
      if (sortKey === key) {
        if (sortDirection === 'asc') setSortDirection('desc');
        else if (sortDirection === 'desc') { setSortKey(null); setSortDirection(null); }
      } else {
        setSortKey(key);
        setSortDirection('asc');
      }
    };

    const renderSortArrow = (key: string) => {
      if (sortKey !== key) return <Text component="span" size="xs" c="slateClean.3" ml={5}> ↕</Text>;
      if (sortDirection === 'asc') return <Text component="span" size="xs" c="ptpn4Green.9" ml={5}> ▲</Text>;
      return <Text component="span" size="xs" c="ptpn4Green.9" ml={5}> ▼</Text>;
    };

    const handleLogout = async () => {
      await supabase.auth.signOut();
      router.replace('/login');
    };

    return (
      <AppShell
        header={{ height: 75 }}
        navbar={{ width: 280, breakpoint: 'sm' }}
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
                {holdCount > 0 && (
                  <Box style={{ position: 'absolute', top: 6, right: 6, width: 8, height: 8, backgroundColor: '#f59e0b', borderRadius: '50%' }} />
                )}
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
                  label="Overview"
                  leftSection={<IconLayoutDashboard size={18} stroke={1.5} />}
                  active={activeMenu === 0}
                  onClick={() => setActiveMenu(0)}
                  py="sm"
                />

                <Text size="xs" fw={700} c="slateClean.4" px="sm" mt="xl" mb={4} lts="0.5px">SISTEM</Text>
                <NavLink label="Konfigurasi SLA" leftSection={<IconSettings size={18} stroke={1.5} />} py="sm" />
                <NavLink label="Keluar Aplikasi" leftSection={<IconLogout size={18} stroke={1.5} />} color="dimmed" py="sm" onClick={handleLogout} />
              </Stack>
            </Box>

          </Stack>
        </AppShell.Navbar>

        <AppShell.Main>
          <Box mb="xl">
            <Stack gap="sm">
              <Text size="28px" fw={800} c="slateClean.9" style={{ letterSpacing: '-0.5px' }}>Daftar Tiket</Text>
              <Text size="sm" c="dimmed">Pantau tiket yang masuk, ubah status, dan kelola penangguhan.</Text>
            </Stack>
          </Box>

          <SimpleGrid cols={{ base: 1, sm: 2, lg: 5 }} spacing="lg" mb="xl">
            <Paper
              bg={activeFilter === null ? 'ptpn4Green.9' : 'slateClean.1'}
              p="xl"
              onClick={() => setActiveFilter(null)}
              style={{
                cursor: 'pointer',
                color: activeFilter === null ? '#fff' : '#475569',
                transition: 'all 0.2s ease',
                boxShadow: activeFilter === null ? '0 4px 12px rgba(14, 66, 42, 0.2)' : 'none'
              }}
            >
              <Text size="xs" fw={700} c={activeFilter === null ? 'ptpn4Green.2' : 'dimmed'} lts="0.5px" truncate="end">
                TOTAL TIKET MASUK
              </Text>
              <Text size="36px" fw={800} my="xs">{loading ? '...' : totalCount}</Text>
              <Text size="xs" c={activeFilter === null ? 'ptpn4Green.1' : 'dimmed'} fw={500}>Semua pengajuan</Text>
            </Paper>

            <Paper
              p="xl"
              onClick={() => setActiveFilter('unassigned')}
              style={{ cursor: 'pointer', outline: activeFilter === 'unassigned' ? '2px solid #ef4444' : 'none', transition: 'all 0.2s' }}
            >
              <Group justify="space-between" wrap="nowrap">
                <Text size="xs" fw={700} c="slateClean.4" lts="0.5px" truncate="end">
                  MENUNGGU RESPON
                </Text>
              </Group>
              <Text size="36px" fw={800} my="xs" c={unassignedCount > 0 ? "slateClean.9" : "slateClean.9"}>
                {loading ? '...' : unassignedCount}
              </Text>
              <Text size="xs" c="#ef4444" fw={500}>Tiket belum diproses</Text>
            </Paper>

            <Paper
              p="xl"
              onClick={() => setActiveFilter('process')}
              style={{ cursor: 'pointer', outline: activeFilter === 'process' ? '2px solid #228be6' : 'none', transition: 'all 0.2s' }}
            >
              <Text size="xs" fw={700} c="slateClean.4" lts="0.5px" truncate="end">
                DALAM PROSES
              </Text>
              <Text size="36px" fw={800} my="xs" c="slateClean.9">{loading ? '...' : processCount}</Text>
              <Text size="xs" c="blue.6" fw={500}>Sedang ditinjau</Text>
            </Paper>

            <Paper
              p="xl"
              onClick={() => setActiveFilter('hold')}
              style={{ cursor: 'pointer', outline: activeFilter === 'hold' ? '2px solid #f59e0b' : 'none', transition: 'all 0.2s' }}
            >
              <Text size="xs" fw={700} c="slateClean.4" lts="0.5px" truncate="end">
                DITANGGUHKAN
              </Text>
              <Text size="36px" fw={800} my="xs" c="slateClean.9">{loading ? '...' : holdCount}</Text>
              <Text size="xs" c="orange.6" fw={500}>Penangguhan aktif</Text>
            </Paper>

            <Paper
              p="xl"
              onClick={() => setActiveFilter('archived')}
              style={{ cursor: 'pointer', outline: activeFilter === 'archived' ? '2px solid #10b981' : 'none', transition: 'all 0.2s' }}
            >
              <Text size="xs" fw={700} c="slateClean.4" lts="0.5px" truncate="end">
                TIKET SELESAI
              </Text>
              <Text size="36px" fw={800} my="xs" c="slateClean.9">{loading ? '...' : archivedCount}</Text>
              <Text size="xs" c="green.6" fw={500}>Telah diselesaikan</Text>
            </Paper>
          </SimpleGrid>

          <Paper p="xl">
            {loading ? (
              <Text size="sm" c="dimmed" ta="center" py="xl">Mengambil data pengajuan...</Text>
            ) : (

              <Box>
                <Group mb="xl" gap="sm" align="center">
                    <TextInput
                    placeholder="Cari nomor tiket..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    leftSection={<IconSearch size={16} stroke={1.5} color="#64748b" />}
                    w={{ base: '100%', sm: 300 }}
                    styles={{ input: { backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' } }}
                  />

                  <Select
                    placeholder="Semua Urgensi"
                    data={[
                      { value: 'Tinggi', label: '🔴 Urgensi Tinggi' },
                      { value: 'Sedang', label: '🟡 Urgensi Sedang' },
                      { value: 'Rendah', label: '🟢 Urgensi Rendah' },
                    ]}
                    value={urgencyFilter}
                    onChange={setUrgencyFilter}
                    clearable
                    w={{ base: '100%', sm: 200 }}
                    styles={{ input: { backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' } }}
                  />

                  {(activeFilter || urgencyFilter) && (
                    <Button
                      variant="light"
                      color="gray"
                      size="sm"
                      radius="md"
                      onClick={() => {
                        setActiveFilter(null);
                        setUrgencyFilter(null);
                      }}
                      leftSection={<IconX size={14} />}
                    >
                      Hapus Filter
                    </Button>
                  )}
                  </Group>

              <Table.ScrollContainer minWidth={1000}>
              <Table verticalSpacing="md" horizontalSpacing="md" highlightOnHover variant="simple" striped >
                <Table.Thead bg="slateClean.0">
                  <Table.Tr>

                    <Table.Th style={{ borderBottom: '1px solid #e2e8f0', cursor: 'pointer' }} onClick={() => handleSortRequest('ticket')} w={230}>
                      <Text size="xs" fw={700} c="slateClean.5">NO. TIKET{renderSortArrow('ticket')}</Text>
                    </Table.Th>
                    <Table.Th style={{ borderBottom: '1px solid #e2e8f0', cursor: 'pointer' }} onClick={() => handleSortRequest('applicant')} w={320}>
                      <Text size="xs" fw={700} c="slateClean.5">PENGAJU{renderSortArrow('applicant')}</Text>
                    </Table.Th>
                    <Table.Th style={{ borderBottom: '1px solid #e2e8f0', cursor: 'pointer' }} onClick={() => handleSortRequest('title')} w={250}>
                      <Text size="xs" fw={700} c="slateClean.5">JUDUL / JENIS{renderSortArrow('title')}</Text>
                    </Table.Th>
                    <Table.Th style={{ borderBottom: '1px solid #e2e8f0', cursor: 'pointer' }} onClick={() => handleSortRequest('duration')} w={180}>
                      <Text size="xs" fw={700} c="slateClean.5">DURASI{renderSortArrow('duration')}</Text>
                    </Table.Th>
                    <Table.Th style={{ borderBottom: '1px solid #e2e8f0', cursor: 'pointer' }} onClick={() => handleSortRequest('status')} w={280}>
                      <Text size="xs" fw={700} c="slateClean.5">STATUS{renderSortArrow('status')}</Text>
                    </Table.Th>
                    <Table.Th style={{ borderBottom: '1px solid #e2e8f0' }} w={280}>
                      <Text size="xs" fw={900} c="slateClean.5">AKSI</Text>
                    </Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>

                {getFilteredAndSortedRequests().length === 0 ? (
                    <Table.Tr>
                      <Table.Td colSpan={7} ta="center" py="xl" style={{ backgroundColor: '#ffffff' }}>
                        <Stack gap="xs" align="center" py="md">
                          <Text size="xl" style={{ fontSize: '24px' }}>🔍</Text>
                          <Text fw={700} c="slateClean.8" size="sm">
                            Nomor Tiket Tidak Ditemukan
                          </Text>
                          <Text size="xs" c="dimmed" w={300}>
                            Tidak ada data tiket yang cocok dengan kata kunci "{searchQuery}". Periksa kembali kombinasi huruf atau penomoran tiket Anda.
                          </Text>
                        </Stack>
                      </Table.Td>
                    </Table.Tr>
                  ) : (

                  getFilteredAndSortedRequests().map((req) => {
                    const isFinal = req.status === 'Disetujui' || req.status === 'Ditolak' || req.status === 'Selesai (Rilis PRD)';
                      const isHoldState = req.status.startsWith('Sedang Ditangguhkan di');
                      const canHold = req.status.includes('Staf') || req.status.includes('Head Office') || req.status.includes('Holding') || req.status.startsWith('Dalam Proses oleh');
                      const isLockedByOtherPic = req.current_pic_id && req.current_pic_id !== currentPicId;
                      const canExecute = currentUserRole === 'Koordinator' || req.current_pic_id === currentPicId;

                      const effectiveSlaDays = (req.categories?.id === 4 || req.categories?.name === 'Tiket Lainnya')
                        ? (req.custom_sla_days ?? null) : 7;

                      const slaMetrics = getSlaMetrics(req.created_at, req.status, req.total_hold_days, effectiveSlaDays, req.updated_at, publicHolidays);

                      const getUrgencyColor = (urgency: string) => {
                        if (urgency === 'Tinggi') return 'red';
                        if (urgency === 'Sedang') return 'orange';
                        return 'gray';
                      };

                    return (
                      <Table.Tr key={req.id} style={{ borderBottom: '1px solid #f1f5f9',
                        backgroundColor: slaMetrics.isOverdue ? '#fff5f5' : 'undefined', transition: 'background-color 0.2s ease', }}>
                        <Table.Td>
                          <Stack gap={2} align="flex-start">
                          <Tooltip label="Klik untuk melihat riwayat pengajuan" position="top" withArrow>
                            <Text
                              fw={700}
                              size="sm"
                              c="ptpn4Green.9"
                              style={{ cursor: 'pointer', display: 'inline-block' }}
                              onClick={() => handleOpenDetailAndLogs(req)}
                            >
                              {req.ticket_number} 📋
                            </Text>
                          </Tooltip>

                        <Badge
                            color={getUrgencyColor(req.urgency || 'Sedang')}
                            variant="filled"
                            size="xs"
                            styles={{ root: { textTransform: 'none', height: '17px', padding: '0 4px' } }}
                          >
                            {req.urgency || 'Sedang'}
                        </Badge>
                        </Stack>
                        </Table.Td>

                        <Table.Td>
                          <Text size="sm" fw={600} c="slateClean.8">{req.profiles?.full_name || 'Tanpa Nama'}</Text>
                          <Text size="xs" c="dimmed">
                            {req.profiles?.unit_kerja === 'Head Office'
                            ? `${req.profiles.unit_kerja} | ${req.profiles.division || ''}`
                            : (req.profiles?.unit_kerja || 'Lokasi Kerja')}
                          </Text>
                        </Table.Td>

                        <Table.Td>
                          <Text size="sm" fw={500} c="slateClean.7">{req.request_title}</Text>
                            <Text size="11px" c="dimmed">
                              {req.categories?.name === 'Tiket Lainnya' && req.sub_categories?.name
                                ? req.sub_categories.name
                                : (req.categories?.name || 'Tidak Diketahui')}
                              {' '} | Batas: {effectiveSlaDays !== null ? `${effectiveSlaDays} Hari` : 'Belum Ditentukan'}
                            </Text>
                        </Table.Td>

                        <Table.Td>
                          <Stack gap={2}>
                            <Text size="sm" fw={700} c="slateClean.8">
                              {slaMetrics.displayString}
                            </Text>
                            {slaMetrics.finalHoldDays > 0 && (
                              <Text size="11px" color="orange.7" fw={600}>Penangguhan: {slaMetrics.finalHoldDays} Hari</Text>
                            )}
                          </Stack>
                        </Table.Td>

                        <Table.Td>
                          <Badge
                            color={
                              isHoldState
                              ? 'orange'
                              : (req.status === 'Disetujui' || req.status === 'Selesai (Rilis PRD)')
                              ? 'green'
                              : req.status === 'Ditolak'
                              ? 'red'
                              : req.status === 'Dikirim'
                              ? 'cyan'
                              : 'blue'}
                            variant="light"
                            radius="sm"
                            py="md"
                          >
                            {req.status}
                          </Badge>
                        </Table.Td>

                        <Table.Td>
                          <Group gap="xs" wrap="nowrap">

                            {isFinal ? (
                              <Text size="xs" c="slateClean.4" fw={500} style={{ fontStyle: 'italic' }}>
                                Pengajuan Selesai Diproses
                              </Text>
                            ) : isLockedByOtherPic && currentUserRole !== 'Koordinator' ? (
                              <Badge color="gray.4" variant="outline" radius="sm" c="dimmed" size="md" fw="500" style={{ borderStyle: 'dashed', textTransform: 'none' }}>
                                🔒 Ditangani oleh {req.pic?.full_name}
                              </Badge>
                            ) : !canExecute ? (
                              <Badge color="gray.4" variant="outline" radius="sm" c="dimmed" size="md" fw="500" style={{ borderStyle: 'dashed', textTransform: 'none' }}>
                                🔒 Menunggu Penugasan dari Koordinator
                              </Badge>
                            ) : (
                              <>
                                <Tooltip label={req.status === 'Dalam Proses oleh Holding' ? 'Upload Dokumen Akhir & Setujui Pengajuan' : 'Lanjutkan proses ke tahap berikutnya'} position="top" withArrow>
                                  <ActionIcon
                                    size="md"
                                    variant="light"
                                    color="green"
                                    disabled={isHoldState}
                                    onClick={() => {
                                      if (req.status === 'Dalam Proses oleh Holding') {
                                        setFinalUploadRequest(req);
                                      } else {
                                        setConfirmNextRequest(req);
                                      }
                                    }}
                                  >
                                    {req.status === 'Dalam Proses oleh Holding' ? <IconFileCheck size={18} /> : <IconArrowRight size={18} />}
                                  </ActionIcon>
                                </Tooltip>

                                <Tooltip label="Delegasikan ke Staf lain" position="top" withArrow>
                                  <ActionIcon
                                    size="md"
                                    variant="light"
                                    color="indigo"
                                    onClick={() => {
                                      setAssignRequest(req);
                                      if (req.current_pic_id) {
                                        setSelectedNewPicId(req.current_pic_id);
                                      }
                                    }}
                                  > <IconUserShare size={18} />
                                  </ActionIcon>
                                </Tooltip>

                                {canHold && (
                                  <Tooltip label={isHoldState ? 'Lanjutkan proses ke tahap selanjutnya' : 'Tangguhkan sementara'} position="top" withArrow>
                                    <ActionIcon
                                      size="md"
                                      variant="light"
                                      color="orange"
                                      onClick={() => setConfirmHoldRequest(req)}
                                    >
                                      {isHoldState ? <IconPlayerPlay size={18} /> : <IconPlayerPause size={18} />}
                                    </ActionIcon>
                                  </Tooltip>
                                )}

                                <Tooltip label="Tolak secara permanen" position="top" withArrow>
                                  <ActionIcon
                                    size="md"
                                    variant="light"
                                    color="red"
                                    onClick={() => setRejectRequest(req)}
                                  >
                                    <IconX size={18} />
                                  </ActionIcon>
                                </Tooltip>
                              </>
                            )}
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    );
                  })
                )}
              </Table.Tbody>
              </Table>
              </Table.ScrollContainer>
              </Box>
            )}
          </Paper>

          <Modal
            opened={finalUploadRequest !== null}
            onClose={() => setFinalUploadRequest(null)}
            title="Unggah Dokumen Final"
            centered
            radius="lg"
          >
            <form onSubmit={handleSubmitFinalDocument}>
              <Stack gap="md">
                <Text size="xs" c="dimmed">Untuk menyelesaikan tiket ini menjadi status Disetujui, Anda wajib melampirkan dokumen final yang telah divalidasi.</Text>
                <FileInput
                  label="Dokumen Final (.PDF)"
                  placeholder="Pilih berkas dokumen final..."
                  accept="application/pdf"
                  required
                  value={finalFile}
                  onChange={(file) => setFinalFile(file)}
                  radius="md"
                />
                <Button type="submit" color="ptpn4Green.9" fullWidth loading={uploadingFinal} radius="md" mt="sm">
                  Simpan & Setujui Dokumen Secara Permanen
                </Button>
              </Stack>
            </form>
          </Modal>

          <Modal
            opened={rejectRequest !== null}
            onClose={() => { setRejectRequest(null); setRejectReason(''); }}
            title={<Text fw={700}>Konfirmasi Penolakan Dokumen</Text>}
            centered
            radius="lg"
          >
            <form onSubmit={handleRejectSubmit}>
              <Stack gap="md">
                <Text size="sm" c="slateClean.7">
                  Anda akan menolak permanen dokumen <b style={{ color: '#e53e3e' }}>{rejectRequest?.ticket_number}</b>. Tindakan ini tidak dapat dibatalkan.
                </Text>

                <Textarea
                  label="Alasan/Keterangan Penolakan"
                  placeholder="Berikan keterangan yang jelas (misal: Format dokumen awal tidak valid...)"
                  required
                  rows={4}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  radius="md"
                />

                <Group justify="flex-end" mt="md">
                  <Button variant="default" onClick={() => setRejectRequest(null)} radius="md">Batal</Button>
                  <Button type="submit" color="red.8" loading={rejecting} radius="md">Tolak</Button>
                </Group>
              </Stack>
            </form>
          </Modal>

          <Modal
            opened={confirmNextRequest !== null}
            onClose={() => setConfirmNextRequest(null)}
            title={<Text fw={700} size="md">Konfirmasi Perubahan Status</Text>}
            centered
            radius="lg"
          >
            <Stack gap="md">
              <Text size="sm" c="slateClean.7">
                Anda akan memproses tiket <b>{confirmNextRequest?.ticket_number}</b> ke tahap berikutnya? Tindakan ini tidak dapat dibatalkan.
              </Text>
              <Group justify="flex-end" mt="md">
                <Button variant="default" onClick={() => setConfirmNextRequest(null)} radius="md">Batal</Button>
                <Button
                  color="green.8"
                  radius="md"
                  onClick={async () => {
                    if (confirmNextRequest) {
                      const tempReq = confirmNextRequest;
                      setConfirmNextRequest(null);
                      await handleNextStep(tempReq);
                    }
                  }}
                >
                  Konfirmasi
                </Button>
              </Group>
            </Stack>
          </Modal>

          <Modal
            opened={confirmHoldRequest !== null}
            onClose={() => setConfirmHoldRequest(null)}
            title={<Text fw={700} size="md">Konfirmasi Penangguhan</Text>}
            centered
            radius="lg"
          >
            <Stack gap="md">
              <Text size="sm" c="slateClean.7">
                {confirmHoldRequest?.status.startsWith('Sedang Ditangguhkan') ? (
                  <>Anda akan melepas status penangguhan pada tiket <b>{confirmHoldRequest?.ticket_number}</b>. Riwayat log penangguhan akan dicatat.</>
                ) : (
                  <>Anda akan menangguhkan sementara tiket <b>{confirmHoldRequest?.ticket_number}</b>. Riwayat log penangguhan akan dicatat.</>
                )}
              </Text>
              <Group justify="flex-end" mt="md">
                <Button variant="default" onClick={() => setConfirmHoldRequest(null)} radius="md">Batal</Button>
                <Button
                  color="orange.8"
                  radius="md"
                  onClick={async () => {
                    if (confirmHoldRequest) {
                      const tempReq = confirmHoldRequest;
                      setConfirmHoldRequest(null);
                      await handleToggleHold(tempReq);
                    }
                  }}
                >
                  Konfirmasi
                </Button>
              </Group>
            </Stack>
          </Modal>

        <Modal
          opened={confirmHoldRequest !== null}
          onClose={() => { setConfirmHoldRequest(null); setHoldReason(''); }}
          title={<Text fw={700} size="md">Konfirmasi Penangguhan</Text>}
          centered
          radius="lg"
        >
          <Stack gap="md">
            <Text size="sm" c="slateClean.7">
              {confirmHoldRequest?.status.startsWith('Sedang Ditangguhkan') ? (
                <>Anda akan melepas status penangguhan pada tiket <b>{confirmHoldRequest?.ticket_number}</b>.</>
              ) : (
                <>Anda akan menangguhkan sementara tiket <b>{confirmHoldRequest?.ticket_number}</b>.</>
              )}
            </Text>

            {confirmHoldRequest && !confirmHoldRequest.status.startsWith('Sedang Ditangguhkan') && (
              <Textarea
                label="Alasan Penangguhan"
                placeholder="Berikan alasan penangguhan yang jelas (misal: Perlu peninjauan lebih lanjut...)"
                required
                rows={3}
                value={holdReason}
                onChange={(e) => setHoldReason(e.target.value)}
                radius="md"
              />
            )}

            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={() => { setConfirmHoldRequest(null); setHoldReason(''); }} radius="md">Batal</Button>
              <Button
                color={confirmHoldRequest?.status.startsWith('Sedang Ditangguhkan') ? "green.8" : "orange.8"}
                radius="md"
                onClick={async () => {
                  if (confirmHoldRequest) {
                    const tempReq = confirmHoldRequest;
                    setConfirmHoldRequest(null);
                    await handleToggleHold(tempReq, holdReason);
                    setHoldReason('');
                  }
                }}
              >
                Konfirmasi
              </Button>
            </Group>
          </Stack>
        </Modal>

        <Modal
          opened={assignRequest !== null}
          onClose={() => { setAssignRequest(null); setSelectedNewPicId(null); }}
          title={<Text fw={700}>Delegasikan Penanggung Jawab Tiket</Text>}
          centered
          radius="lg"
        >
          <Stack gap="md">
            <Text size="sm" c="slateClean.7">
              Pilih staff Staf dari daftar di bawah ini untuk menangani tiket nomor <b>{assignRequest?.ticket_number}</b>.
            </Text>

            <Select
              label="Pilih Penanggung Jawab (Staf)"
              placeholder="Cari nama Staf..."
              data={picList}
              searchable
              clearable
              value={selectedNewPicId}
              onChange={setSelectedNewPicId}
              radius="md"
            />

            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={() => { setAssignRequest(null); setSelectedNewPicId(null); }} radius="md">
                Batal
              </Button>
              <Button
                color="indigo.8"
                loading={assigning}
                onClick={handleAssignPic}
                radius="md"
              >
                Simpan Perubahan
              </Button>
            </Group>
          </Stack>
        </Modal>

        <Drawer
          opened={selectedDetail !== null}
          onClose={() => setSelectedDetail(null)}
          title={
            <Group gap="xs">
              <Badge color="ptpn4Green.9" variant="filled" radius="sm">
                {selectedDetail?.ticket_number}
              </Badge>
              <Text fw={800} size="md" c="slateClean.9">Detail Dokumen Pengajuan</Text>
            </Group>
          }
          position="right"
          size="md"
          styles={{
            header: { borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' },
            content: { backgroundColor: '#ffffff' }
          }}
        >
          {selectedDetail && (
            <Stack gap="lg" mt="md">
              {}
              <Box p="sm" bg="slateClean.0" style={{ borderRadius: '8px' }}>
                <Text size="xs" c="dimmed" fw={600} mb={4}>INFORMASI PENGAJU</Text>
                <Text fw={700} size="sm" c="slateClean.8">{selectedDetail.profiles?.full_name}</Text>
                <Text size="xs" c="slateClean.5">
                  {selectedDetail.profiles?.unit_kerja === 'Head Office'
                    ? `${selectedDetail.profiles.unit_kerja} | ${selectedDetail.profiles.division || ''}`
                    : (selectedDetail.profiles?.unit_kerja || 'Lokasi Kerja')}
                  {selectedDetail.profiles?.email ? ` • ${selectedDetail.profiles.email}` : ''}
                </Text>
              </Box>

              {}
              <Box>
                <Text size="xs" c="dimmed" fw={600} mb={2}>JUDUL PENGAJUAN</Text>
                <Text fw={700} size="md" c="slateClean.9" mb="xs">{selectedDetail.request_title}</Text>
                <Badge color="blue" variant="light">
                  {selectedDetail.categories?.name === 'Tiket Lainnya' && selectedDetail.sub_categories?.name
                  ? selectedDetail.sub_categories.name
                  : (selectedDetail.categories?.name || 'Tidak Diketahui')}
                </Badge>
              </Box>

              <Box>
                <Text size="xs" c="dimmed" fw={600} mb={4}>TARGET BATAS WAKTU (SLA)</Text>

                {editingSlaId === selectedDetail.id ? (
                  <Group gap="xs">
                    <NumberInput
                      value={newSlaValue}
                      onChange={(val) => setNewSlaValue(val as number | '')}
                      min={1}
                      max={365}
                      size="xs"
                      w={100}
                      placeholder="Hari"
                    />

                    {newSlaValue !== '' && (
                      <Text size="xs" c="dimmed" mt={4}>
                        📅 Estimasi: <Text span fw={700} c="ptpn4Green.9">{getProjectedDate(Number(newSlaValue))}</Text>
                      </Text>
                    )}

                    <Button size="xs" color="ptpn4Green.9" loading={isSavingSla} onClick={() => handleUpdateSla(selectedDetail.id)}>
                      Simpan
                    </Button>
                    <Button size="xs" variant="subtle" color="gray" onClick={() => setEditingSlaId(null)}>
                      Batal
                    </Button>
                  </Group>
                ) : (
                  <Group gap="xs">
                    <Text size="sm" fw={600} c="slateClean.8">
                      {selectedDetail.categories?.id === 4 || selectedDetail.categories?.name === 'Tiket Lainnya'
                         ? (selectedDetail.custom_sla_days ? `${selectedDetail.custom_sla_days} Hari` : 'Belum Ditentukan')
                         : `${selectedDetail.categories?.sla_days} Hari`
                      }
                    </Text>

                    {(selectedDetail.categories?.id === 4 || selectedDetail.categories?.name === 'Tiket Lainnya') &&
                     (currentUserRole === 'Koordinator' || selectedDetail.current_pic_id === currentPicId) && (
                      <Tooltip label="Ubah batas waktu SLA" position="top">
                        <ActionIcon size="sm" variant="subtle" color="blue" onClick={() => {
                          setEditingSlaId(selectedDetail.id);
                          setNewSlaValue(selectedDetail.custom_sla_days || '');
                        }}>
                          <IconPencil size={14} />
                        </ActionIcon>
                      </Tooltip>
                    )}
                  </Group>
                )}
              </Box>

              {}
              <Box>
                <Text size="xs" c="dimmed" fw={600} mb={4}>DESKRIPSI & KETERANGAN DOKUMEN</Text>
                <Paper p="md" withBorder radius="md" bg="#f8fafc" style={{ borderColor: '#e2e8f0' }}>
                  <Text size="sm" c="slateClean.7" style={{ whiteSpace: 'pre-line', lineHeight: '1.6' }}>
                    {selectedDetail.description || 'Pengaju tidak menyertakan keterangan tertulis pada dokumen ini.'}
                  </Text>
                </Paper>
              </Box>

              {}
              {selectedDetail.attachments && selectedDetail.attachments.filter((a: any) => a.type === 'Dokumen_Awal').length > 0 ? (
                <Box>
                  <Text size="xs" c="dimmed" fw={600} mb={4}>
                    DOKUMEN LAMPIRAN AWAL ({selectedDetail.attachments.filter((a: any) => a.type === 'Dokumen_Awal').length} Dokumen)
                  </Text>
                  <Stack gap="xs">
                    {selectedDetail.attachments
                      .filter((att: any) => att.type === 'Dokumen_Awal')
                      .map((file: any, idx: number) => (
                        <Button
                          key={file.id || idx}
                          onClick={() => handleDownloadSecureFile(file.file_url, file.file_name)}
                          variant="outline"
                          color="ptpn4Green.9"
                          fullWidth
                          leftSection={<IconDownload size={16} />}
                          styles={{ inner: { justifyContent: 'flex-start' } }}
                        >
                          <Text size="xs" truncate style={{ maxWidth: '90%' }}>
                            {file.file_name || `Unduh Dokumen Lampiran ${idx + 1}`}
                          </Text>
                        </Button>
                      ))}
                  </Stack>
                </Box>
              ) : (

                selectedDetail.file_url && (
                  <Box>
                    <Text size="xs" c="dimmed" fw={600} mb={4}>BERKAS LAMPIRAN AWAL</Text>
                    <Button
                      component="a"
                      target="_blank"
                      rel="noopener noreferrer"
                      variant="outline"
                      color="ptpn4Green.9"
                      fullWidth
                      leftSection={<IconDownload size={16} />}
                    >
                      Buka Dokumen PDF
                    </Button>
                  </Box>
                )
              )}

              {}
              <Divider my="sm" label={<Text size="10px" fw={700} c="slateClean.4" lts="0.5px">RIWAYAT ALUR DOKUMEN</Text>} labelPosition="center" />

              {loadingTimeline ? (
                <Text size="xs" ta="center" c="dimmed" py="sm">Membaca jejak log birokrasi...</Text>
              ) : (
                <Timeline active={historyLogs.length - 1} bulletSize={18} lineWidth={1.5} color="ptpn4Green.9">
                  {historyLogs.map((log, index) => {
                    const isCurrentStatus = index === historyLogs.length - 1;

                    return (
                      <Timeline.Item
                        key={log.id}
                        title={
                          <Text
                            fw={700}
                            size="xs"
                            c={isCurrentStatus ? 'ptpn4Green.9' : 'slateClean.8'}
                            style={{
                              backgroundColor: isCurrentStatus ? '#ecfdf3' : 'transparent',
                              padding: isCurrentStatus ? '2px 6px' : '0',
                              borderRadius: isCurrentStatus ? '4px' : '0',
                              display: 'inline-block'
                            }}
                          >
                            {log.status_after}
                          </Text>
                        }
                      >
                        {log.notes && <Text size="11px" mt={2} c="slateClean.6" style={{ fontStyle: 'italic' }}>Keterangan: "{log.notes}"</Text>}
                        <Text size="9px" c={isCurrentStatus ? 'green.7' : 'ptpn4Green.8'} fw={600} mt={4}>
                          Oleh: {log.profiles?.full_name || 'System Auto'} • {new Date(log.created_at).toLocaleString('id-ID')}
                        </Text>
                      </Timeline.Item>
                    );
                  })}
                </Timeline>
              )}
            </Stack>
          )}
        </Drawer>

        </AppShell.Main>
      </AppShell>
    );
  }
