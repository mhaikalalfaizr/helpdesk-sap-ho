'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { TICKET_STATUS, type TicketStatus } from '../../../utils/constants';
import { getUrgencyColor } from '../../../utils/helpers';
import { createClient } from '@/lib/supabase/client';
import { notifications } from '@mantine/notifications';
import RejectModal from '../../../components/modals/RejectModal';
import DetailDrawer from '../../../components/DetailDrawer';
import EmailModal from '../../../components/modals/EmailModal';
import AssignModal from '../../../components/modals/AssignModal';
import FinalUploadModal from '../../../components/modals/FinalUploadModal';
import { useTableFilters } from '@/hooks/useTableFilters';
import { useStaffRequests } from '@/hooks/useStaffRequests';
import { RequestItem, RequestLog } from '@/utils/types';

import {
  SimpleGrid, Paper, Text, Group, Badge, Table, ActionIcon, TextInput,
  Stack, Box, Tooltip, Modal, Textarea, Button, Select, Pagination
} from '@mantine/core';
import {
  IconSearch, IconX, IconUserShare,
  IconPlayerPause, IconPlayerPlay, IconArrowRight, IconFileCheck, IconUser
} from '@tabler/icons-react';

import { countWorkingDays, handleDownloadSecureFile } from '../../../utils/helpers';

export default function PicDashboard() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());

  const [finalUploadRequest, setFinalUploadRequest] = useState<RequestItem | null>(null);

  const [selectedRequest, setSelectedRequest] = useState<RequestItem | null>(null);
  const [historyLogs, setHistoryLogs] = useState<RequestLog[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  const [rejectRequest, setRejectRequest] = useState<RequestItem | null>(null);

  const [confirmNextRequest, setConfirmNextRequest] = useState<RequestItem | null>(null);
  const [confirmHoldRequest, setConfirmHoldRequest] = useState<RequestItem | null>(null);

  const [selectedDetail, setSelectedDetail] = useState<RequestItem | null>(null);

  const [holdReason, setHoldReason] = useState('');

  const [assignRequest, setAssignRequest] = useState<RequestItem | null>(null);

  const [editingSlaId, setEditingSlaId] = useState<string | null>(null);
  const [newSlaValue, setNewSlaValue] = useState<number | ''>('');
  const [isSavingSla, setIsSavingSla] = useState(false);

  const [isProcessingNext, setIsProcessingNext] = useState(false);
  const [isProcessingHold, setIsProcessingHold] = useState(false);

  const {
    currentPicId, currentUserName, currentUserEmail, currentUserRole,
    requests, setRequests, loading, picList, publicHolidays,
    defaultConsultantTo, defaultConsultantCc
  } = useStaffRequests();

  const {
    searchQuery, setSearchQuery, activeFilter, setActiveFilter,
    urgencyFilter, setUrgencyFilter, sortKey, sortDirection, handleSortRequest,
    showOnlyMine, setShowOnlyMine, page, setPage, pageSize,
    paginatedRequests, totalItems, startItem, endItem, slaDictionary,
    totalCount, unassignedCount, processCount, holdCount, archivedCount, overdueCount, filteredRequests
  } = useTableFilters(requests, publicHolidays, currentPicId);

  const [selectedTicketForEmail, setSelectedTicketForEmail] = useState<RequestItem | null>(null);

  useEffect(() => {
    setPage(1);
  }, [activeFilter, showOnlyMine, searchQuery, urgencyFilter]);

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

    if (data) setHistoryLogs(data as unknown as RequestLog[]);
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

    if (data) setHistoryLogs(data as unknown as RequestLog[]);
    setLoadingTimeline(false);
  };

  const handleAssignPic = async (newPicId: string | null) => {
    if (!assignRequest) return;

    try {
      const previousPicName = assignRequest.pic?.full_name || 'Belum Ditentukan';
      const newPicTarget = picList.find(p => p.value === newPicId);
      const newPicName = newPicTarget ? newPicTarget.label : 'Belum Ditentukan (Unassigned)';
      const newStatus = assignRequest.status === TICKET_STATUS.DIKIRIM ? TICKET_STATUS.DITUGASKAN : assignRequest.status;

      const { error: updateError } = await supabase
        .from('requests')
        .update({
          current_pic_id: newPicId,
          status: newStatus,
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
          status_after: newStatus,
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

      if (newPicTarget && newPicId !== currentPicId) {
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
              },
              body: JSON.stringify({
                ticketNumber: assignRequest.ticket_number,
                status: payload.recipientEmail === assignRequest.profiles?.email
                  ? 'Pembaruan Penanggung Jawab'
                  : 'Tugas Baru Dialokasikan',
                notes: payload.notes
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
        current_pic_id: newPicId,
        status: newStatus,
        pic: newPicTarget ? { full_name: newPicTarget.label } : null
      } : r));

      notifications.show({
        title: 'Delegasi Berhasil',
        message: `Tiket ${assignRequest.ticket_number} sukses ditugaskan ke ${newPicName}.`,
        color: 'green'
      });

    } catch (err: unknown) {
      notifications.show({ title: 'Gagal Mengalihkan Penugasan Tiket', message: (err instanceof Error ? err.message : (typeof err === 'object' && err !== null && 'message' in err ? String((err as any).message) : String(err))), color: 'red' });
      throw err;
    }
  };

  const updateDatabaseStatus = async (id: string, payload: Partial<RequestItem>, logStatusName: TicketStatus, notes: string = 'Sinkronisasi status oleh Staf') => {
    try {
      const targetRequest = requests.find(r => r.id === id);

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
        throw new Error("Gagal menyimpan pembaruan, database menolak update status ini.");
      }

      await supabase.from('request_logs').insert([{
        request_id: id,
        changed_by: currentPicId,
        status_before: requests.find(r => r.id === id)?.status || null,
        status_after: logStatusName,
        notes: notes
      }]);

      setRequests((prev) =>
        prev.map((r) => (r.id === id ? { ...r, ...payload } : r))
      );

      const crucialStatuses: string[] = [
        TICKET_STATUS.HOLD_STAF,
        TICKET_STATUS.HOLD_HO,
        TICKET_STATUS.HOLD_HOLDING,
        TICKET_STATUS.DITOLAK,
        TICKET_STATUS.RILIS_PRD,
        TICKET_STATUS.DISETUJUI
      ];

      if (targetRequest && crucialStatuses.includes(logStatusName)) {
        try {
          const emailRes = await fetch('/api/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ticketNumber: targetRequest.ticket_number,
              status: logStatusName,
              notes: notes
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

      notifications.show({
        title: 'Status Berhasil Diperbarui',
        message: `Tiket berhasil dipindahkan ke fase: ${logStatusName}`,
        color: logStatusName === 'Ditolak' ? 'red' : 'green',
        autoClose: 4000,
      });

    } catch (err) {
      const message = err instanceof Error ? err.message : (typeof err === 'object' && err !== null && 'message' in err ? String((err as any).message) : String(err));
      notifications.show({
        title: 'Sistem Gagal Memperbarui',
        message: message,
        color: 'red',
        autoClose: 5000,
      });
    }
  };

  const getNextStatusText = (req: RequestItem | null) => {
    if (!req) return '';

    const isTiketLainnya = req.categories?.name === 'Tiket Lainnya' || req.categories?.id === 4;

    if (isTiketLainnya) {
      switch (req.status) {
        case TICKET_STATUS.DIKIRIM: return TICKET_STATUS.PROSES_STAF;
        case TICKET_STATUS.DITUGASKAN: return TICKET_STATUS.PROSES_STAF;
        case TICKET_STATUS.PROSES_STAF: return TICKET_STATUS.ELISITASI;
        case TICKET_STATUS.ELISITASI: return TICKET_STATUS.LAPOR_KONSULTAN;
        case TICKET_STATUS.LAPOR_KONSULTAN: return TICKET_STATUS.PENGEMBANGAN;
        case TICKET_STATUS.PENGEMBANGAN: return TICKET_STATUS.UAT;
        case TICKET_STATUS.UAT: return TICKET_STATUS.RILIS_PRD;
        default: return 'Tahap Selanjutnya';
      }
    } else {
      switch (req.status) {
        case TICKET_STATUS.DIKIRIM: return TICKET_STATUS.PROSES_STAF;
        case TICKET_STATUS.DITUGASKAN: return TICKET_STATUS.PROSES_STAF;
        case TICKET_STATUS.PROSES_STAF: return TICKET_STATUS.PROSES_HO;
        case TICKET_STATUS.PROSES_HO: return TICKET_STATUS.PROSES_HOLDING;
        default: return 'Tahap Selanjutnya';
      }
    }
  };

  const handleNextStep = async (req: RequestItem) => {
    let nextStatus: TicketStatus;

    if (req.categories?.name === 'Tiket Lainnya' || req.categories?.id === 4) {
      switch (req.status) {
        case TICKET_STATUS.DIKIRIM: nextStatus = TICKET_STATUS.PROSES_STAF; break;
        case TICKET_STATUS.DITUGASKAN: nextStatus = TICKET_STATUS.PROSES_STAF; break;
        case TICKET_STATUS.PROSES_STAF: nextStatus = TICKET_STATUS.ELISITASI; break;
        case TICKET_STATUS.ELISITASI: nextStatus = TICKET_STATUS.LAPOR_KONSULTAN; break;
        case TICKET_STATUS.LAPOR_KONSULTAN: nextStatus = TICKET_STATUS.PENGEMBANGAN; break;
        case TICKET_STATUS.PENGEMBANGAN: nextStatus = TICKET_STATUS.UAT; break;
        case TICKET_STATUS.UAT: nextStatus = TICKET_STATUS.RILIS_PRD; break;
        default: return;
      }

      if (req.status === TICKET_STATUS.UAT) {
        await updateDatabaseStatus(req.id, { status: nextStatus }, nextStatus, 'Tiket selesai, PRD dirilis.');
        return;
      }
    }
    else {
      switch (req.status) {
        case TICKET_STATUS.DIKIRIM: nextStatus = TICKET_STATUS.PROSES_STAF; break;
        case TICKET_STATUS.DITUGASKAN: nextStatus = TICKET_STATUS.PROSES_STAF; break;
        case TICKET_STATUS.PROSES_STAF: nextStatus = TICKET_STATUS.PROSES_HO; break;
        case TICKET_STATUS.PROSES_HO: nextStatus = TICKET_STATUS.PROSES_HOLDING; break;
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

    } catch (error: unknown) {
      notifications.show({ title: 'Gagal Update', message: (error instanceof Error ? error.message : (typeof error === 'object' && error !== null && 'message' in error ? String((error as any).message) : String(error))), color: 'red' });
    } finally {
      setIsSavingSla(false);
    }
  };

  const handleSubmitFinalDocument = async (files: File[], subject: string, body: string, to: string, cc: string[]) => {
    if (!finalUploadRequest || !files || !currentPicId) return;

    try {
      const uploadedAttachmentsData: { filePath: string; fileName: string }[] = [];
      for (const file of files) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${finalUploadRequest.id}-final-${Date.now()}-${file.name}`;
        const filePath = `final_docs/${fileName}`;
        const { error: uploadError } = await supabase.storage.from('documents').upload(filePath, file);
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(filePath);
        const { error: attachError } = await supabase.from('attachments').insert([{
          request_id: finalUploadRequest.id,
          file_name: file.name,
          file_url: publicUrl,
          uploaded_by: currentPicId,
          type: 'Dokumen_Final'
        }]);
        if (attachError) throw attachError;
        uploadedAttachmentsData.push({ filePath, fileName: file.name });
      }

      const catName = (finalUploadRequest.categories?.name || '').toLowerCase();
      const subCatName = (finalUploadRequest.sub_categories?.name || '').toLowerCase();
      const isAccessRequest = catName.includes('access') || subCatName.includes('access');

      const division = (finalUploadRequest.profiles?.division || '').toLowerCase();
      const workUnit = (finalUploadRequest.profiles?.unit_kerja || '').toLowerCase();
      const isHeadOffice = division.includes('head office') || workUnit.includes('head office') || division === 'ho' || workUnit === 'ho';
      const shouldSendEmail = isAccessRequest && isHeadOffice;

      if (shouldSendEmail) {
        if (!to) {
          notifications.show({ title: 'Konsultan Belum Dikonfigurasi', message: 'Hubungi administrator untuk mengatur data konsultan.', color: 'orange' });
          return;
        }

        const emailRes = await fetch('/api/send-email-konsultan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticketNumber: finalUploadRequest.ticket_number,
            subject: subject,
            emailBody: body,
            consultantTo: to,
            consultantCc: cc,
            replyToEmail: currentUserEmail,
            attachmentsData: uploadedAttachmentsData,
          }),
        });
        if (!emailRes.ok) {
          const err = await emailRes.json();
          throw new Error(`Email kepada konsultan gagal terkirim: ${err.error || 'Server Error'}`);
        }
        await updateDatabaseStatus(
          finalUploadRequest.id,
          { status: 'Disetujui' },
          'Disetujui',
          'Pengajuan disetujui. Dokumen final telah dilampirkan.'
        );
        notifications.show({ title: 'Selesai!', message: `Tiket ${finalUploadRequest.ticket_number} disetujui & email dikirim ke konsultan.`, color: 'green' });

      } else {
        await updateDatabaseStatus(
          finalUploadRequest.id,
          { status: 'Disetujui' },
          'Disetujui',
          'Pengajuan disetujui. Dokumen final telah dilampirkan.'
        );
        notifications.show({ title: 'Selesai!', message: `Tiket ${finalUploadRequest.ticket_number} disetujui dan dokumen final berhasil disimpan.`, color: 'green' });
      }

      setFinalUploadRequest(null);

    } catch (err) {
      const message = err instanceof Error ? err.message : (typeof err === 'object' && err !== null && 'message' in err ? String((err as any).message) : String(err));
      notifications.show({ title: 'Gagal Mengunggah Dokumen Final', message: message, color: 'red' });
      throw err;
    }
  };

  const handleToggleHold = async (req: RequestItem, notes: string = holdReason) => {

    if (!req.status.startsWith('Sedang Ditangguhkan') && holdReason.trim() === '') {
      notifications.show({
        title: 'Gagal',
        message: 'Alasan penangguhan wajib diisi!',
        color: 'red',
      });
      return false;
    }

    const nowStr = new Date().toISOString();
    let nextStatus = '';

    if (req.status.startsWith('Dalam Proses oleh')) {
      if (req.status.includes('Staf')) nextStatus = TICKET_STATUS.HOLD_STAF;
      else if (req.status.includes('Head Office')) nextStatus = TICKET_STATUS.HOLD_HO;
      else if (req.status.includes('Holding')) nextStatus = TICKET_STATUS.HOLD_HOLDING;

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
            },
            body: JSON.stringify({
              ticketNumber: req.ticket_number,
              status: nextStatus,
              notes: notes
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

      } catch (err: unknown) {
        notifications.show({ title: 'Eror Supabase (Hold)', message: (err instanceof Error ? err.message : (typeof err === 'object' && err !== null && 'message' in err ? String((err as any).message) : String(err))), color: 'red' });
      }

    } else if (req.status.startsWith('Sedang Ditangguhkan di')) {
      if (req.status.includes('Staf')) nextStatus = TICKET_STATUS.PROSES_STAF;
      else if (req.status.includes('Head Office')) nextStatus = TICKET_STATUS.PROSES_HO;
      else if (req.status.includes('Holding')) nextStatus = TICKET_STATUS.PROSES_HOLDING;

      try {
        await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticketNumber: req.ticket_number,
            status: nextStatus,
            notes: 'Penangguhan pada pengajuan Anda telah dilepas. Proses kembali berjalan normal.'
          }),
        });
      } catch (e) {
        console.error('Gagal kirim email saat melepas penangguhan:', e);
      }

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

      } catch (err: unknown) {
        notifications.show({ title: 'Eror Supabase (Unhold)', message: (err instanceof Error ? err.message : (typeof err === 'object' && err !== null && 'message' in err ? String((err as any).message) : String(err))), color: 'red' });
      }
    }
  };

  const handleRejectSubmit = async (reason: string) => {
    if (!rejectRequest) return;
    try {
      await updateDatabaseStatus(
        rejectRequest.id,
        { status: 'Ditolak' },
        'Ditolak',
        `Alasan Penolakan: ${reason}`
      );
      setRejectRequest(null);
    } catch (err: unknown) {
      alert(`Gagal menolak dokumen: ${(err instanceof Error ? err.message : (typeof err === 'object' && err !== null && 'message' in err ? String((err as any).message) : String(err)))}`);
      throw err;
    }
  };

  const renderSortArrow = (key: string) => {
    if (sortKey !== key) return <Text component="span" size="xs" c="slateClean.3" ml={5}> ↕</Text>;
    if (sortDirection === 'asc') return <Text component="span" size="xs" c="ptpn4Green.9" ml={5}> ▲</Text>;
    return <Text component="span" size="xs" c="ptpn4Green.9" ml={5}> ▼</Text>;
  };

  return (
    <>
      <Box mb="xl">
        <Stack gap="sm">
          <Text size="28px" fw={800} c="slateClean.9" style={{ letterSpacing: '-0.5px' }}>Daftar Tiket</Text>
          <Text size="sm" c="dimmed">Pantau tiket yang masuk, ubah status, dan kelola penangguhan.</Text>
        </Stack>
      </Box>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 6 }} spacing="lg" mb="xl">
        <Paper
          bg={activeFilter === null ? 'ptpn4Green.9' : 'slateClean.1'}
          p="xl"
          onClick={() => setActiveFilter(null)}
          style={{
            cursor: 'pointer',
            color: activeFilter === null ? 'var(--mantine-color-white)' : 'var(--mantine-color-slateClean-6)',
            transition: 'all 0.2s ease',
            boxShadow: activeFilter === null ? '0 4px 12px rgba(14, 66, 42, 0.2)' : 'none',
            border: '1px solid var(--mantine-color-slateClean-2)'
          }}
        >
          <Text size="xs" fw={700} c={activeFilter === null ? 'ptpn4Green.2' : 'dimmed'} lts="0.5px" truncate="end">
            TOTAL TIKET MASUK
          </Text>
          <Text size="36px" fw={800} my="xs">{loading ? '...' : totalCount}</Text>
          <Text size="xs" c={activeFilter === null ? 'ptpn4Green.1' : 'dimmed'} fw={500}>Keseluruhan pengajuan</Text>
        </Paper>

        <Paper
          p="xl"
          onClick={() => setActiveFilter('unassigned')}
          style={{ cursor: 'pointer', outline: activeFilter === 'unassigned' ? '2px solid var(--mantine-color-red-5)' : 'none', transition: 'all 0.2s', border: '1px solid var(--mantine-color-slateClean-2)' }}
        >
          <Text size="xs" fw={700} c="slateClean.4" lts="0.5px" truncate="end">
            MENUNGGU RESPON
          </Text>
          <Text size="36px" fw={800} my="xs" c={unassignedCount > 0 ? "slateClean.9" : "slateClean.9"}>
            {loading ? '...' : unassignedCount}
          </Text>
          <Text size="xs" c="red.6" fw={500}>Tiket belum ditugaskan</Text>
        </Paper>

        <Paper
          p="xl"
          onClick={() => setActiveFilter('process')}
          style={{ cursor: 'pointer', outline: activeFilter === 'process' ? '2px solid var(--mantine-color-blue-5)' : 'none', transition: 'all 0.2s', border: '1px solid var(--mantine-color-slateClean-2)' }}
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
          style={{ cursor: 'pointer', outline: activeFilter === 'hold' ? '2px solid var(--mantine-color-orange-5)' : 'none', transition: 'all 0.2s', border: '1px solid var(--mantine-color-slateClean-2)' }}
        >
          <Text size="xs" fw={700} c="slateClean.4" lts="0.5px" truncate="end">
            DITANGGUHKAN
          </Text>
          <Text size="36px" fw={800} my="xs" c="slateClean.9">{loading ? '...' : holdCount}</Text>
          <Text size="xs" c="orange.6" fw={500}>Penangguhan aktif</Text>
        </Paper>

        <Paper
          p="xl"
          onClick={() => setActiveFilter('overdue')}
          style={{ cursor: 'pointer', outline: activeFilter === 'overdue' ? '2px solid var(--mantine-color-red-6)' : 'none', transition: 'all 0.2s', backgroundColor: overdueCount > 0 ? 'var(--mantine-color-white)' : 'var(--mantine-color-white)', border: '1px solid var(--mantine-color-slateClean-2)' }}
        >
          <Text size="xs" fw={700} c="slateClean.4" lts="0.5px" truncate="end">
            LEWAT BATAS WAKTU
          </Text>
          <Text size="36px" fw={800} my="xs" c="red.6">{loading ? '...' : overdueCount}</Text>
          <Text size="xs" c="red.6" fw={500}>Melewati batas waktu</Text>
        </Paper>

        <Paper
          p="xl"
          onClick={() => setActiveFilter('archived')}
          style={{ cursor: 'pointer', outline: activeFilter === 'archived' ? '2px solid var(--mantine-color-teal-5)' : 'none', transition: 'all 0.2s', border: '1px solid var(--mantine-color-slateClean-2)' }}
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
            <Group mb="md" gap="sm" align="center" justify="space-between">
              <Group gap="sm">
                <TextInput
                  placeholder="Cari nomor tiket..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  leftSection={<IconSearch size={16} stroke={1.5} color="var(--mantine-color-slateClean-5)" />}
                  w={{ base: '100%', sm: 300 }}
                  styles={{ input: { backgroundColor: 'var(--mantine-color-slateClean-0)', border: '1px solid var(--mantine-color-slateClean-2)', borderRadius: '8px' } }}
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
                  styles={{ input: { backgroundColor: 'var(--mantine-color-slateClean-0)', border: '1px solid var(--mantine-color-slateClean-2)', borderRadius: '8px' } }}
                />

                <Tooltip label={showOnlyMine ? 'Klik untuk lihat semua tiket' : 'Klik untuk lihat tiket yang anda tangani'} withArrow>
                  <Button
                    variant={showOnlyMine ? 'outline' : 'default'}
                    color={showOnlyMine ? 'green.8' : 'gray'}
                    size="sm"
                    radius="md"
                    leftSection={<IconUser size={14} />}
                    onClick={() => setShowOnlyMine(prev => !prev)}
                  >
                    Tiket Saya
                  </Button>
                </Tooltip>

                {(activeFilter || urgencyFilter || showOnlyMine) && (
                  <Button
                    variant="light"
                    color="gray"
                    size="sm"
                    radius="md"
                    onClick={() => {
                      setActiveFilter(null);
                      setUrgencyFilter(null);
                      setShowOnlyMine(false);
                    }}
                    leftSection={<IconX size={14} />}
                  >
                    Hapus Filter
                  </Button>
                )}
              </Group>

              <Text size="sm" c="dimmed">
                Menampilkan <Text span fw={600} c="slateClean.8">{startItem}-{endItem}</Text> dari <Text span fw={600}
                  c="slateClean.8">{totalItems}</Text> tiket
              </Text>

            </Group>

            <Table.ScrollContainer minWidth={1000}>
              <Table verticalSpacing="md" horizontalSpacing="md" highlightOnHover variant="simple" striped >
                <Table.Thead bg="slateClean.0">
                  <Table.Tr>

                    <Table.Th style={{ borderBottom: '1px solid var(--mantine-color-slateClean-2)', cursor: 'pointer' }} w="14%" onClick={() => handleSortRequest('ticket')} >
                      <Text size="xs" fw={700} c="slateClean.5">NO. TIKET{renderSortArrow('ticket')}</Text>
                    </Table.Th>
                    <Table.Th style={{ borderBottom: '1px solid var(--mantine-color-slateClean-2)', cursor: 'pointer' }} w="15%" onClick={() => handleSortRequest('applicant')}>
                      <Text size="xs" fw={700} c="slateClean.5">PENGAJU{renderSortArrow('applicant')}</Text>
                    </Table.Th>
                    <Table.Th style={{ borderBottom: '1px solid var(--mantine-color-slateClean-2)', cursor: 'pointer' }} w="15%" onClick={() => handleSortRequest('title')}>
                      <Text size="xs" fw={700} c="slateClean.5">JUDUL / JENIS{renderSortArrow('title')}</Text>
                    </Table.Th>
                    <Table.Th style={{ borderBottom: '1px solid var(--mantine-color-slateClean-2)', cursor: 'pointer' }} w="6%" onClick={() => handleSortRequest('duration')}>
                      <Text size="xs" fw={700} c="slateClean.5">DURASI{renderSortArrow('duration')}</Text>
                    </Table.Th>
                    <Table.Th style={{ borderBottom: '1px solid var(--mantine-color-slateClean-2)', cursor: 'pointer' }} w="15%" onClick={() => handleSortRequest('status')}>
                      <Text size="xs" fw={700} c="slateClean.5">STATUS{renderSortArrow('status')}</Text>
                    </Table.Th>
                    <Table.Th style={{ borderBottom: '1px solid var(--mantine-color-slateClean-2)' }} w="13%">
                      <Text size="xs" fw={900} c="slateClean.5">AKSI</Text>
                    </Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>

                  {paginatedRequests.length === 0 ? (
                    <Table.Tr>
                      <Table.Td colSpan={7} ta="center" py="xl" style={{ backgroundColor: 'var(--mantine-color-white)' }}>
                        <Stack gap="xs" align="center" py="md">
                          <Text size="xl" style={{ fontSize: '24px' }}>🔍</Text>
                          <Text fw={700} c="slateClean.8" size="sm">
                            Tiket Tidak Ditemukan
                          </Text>
                          <Text size="xs" c="dimmed" w={600}>
                            Tidak ada data tiket yang cocok dengan kata kunci/filter yang digunakan. <br></br> Periksa kembali pencarian tiket Anda.
                          </Text>
                        </Stack>
                      </Table.Td>
                    </Table.Tr>
                  ) : (

                    paginatedRequests.map((req) => {
                      const isFinal = req.status === 'Disetujui' || req.status === 'Ditolak' || req.status === 'Selesai (Rilis PRD)';
                      const isHoldState = req.status.startsWith('Sedang Ditangguhkan di');
                      const canHold = req.status.includes('Staf') || req.status.includes('Head Office') || req.status.includes('Holding') || req.status.startsWith('Dalam Proses oleh');
                      const isLockedByOtherPic = req.current_pic_id && req.current_pic_id !== currentPicId;
                      const canExecute = currentUserRole === 'Koordinator' || req.current_pic_id === currentPicId;
                      const effectiveSlaDays = (req.categories?.id === 4 || req.categories?.name === 'Tiket Lainnya') ? (req.custom_sla_days ?? null) : 7;

                      return (
                        <Table.Tr key={req.id} style={{
                          borderBottom: '1px solid var(--mantine-color-slateClean-1)',
                          backgroundColor: slaDictionary[req.id]?.isOverdue ? 'var(--mantine-color-red-0)' : 'undefined', transition: 'background-color 0.2s ease',
                        }}>
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
                                {slaDictionary[req.id]?.displayString || '-'}
                              </Text>
                              {slaDictionary[req.id]?.finalHoldDays > 0 && (
                                <Text size="11px" color="orange.7" fw={600}>Penangguhan: {slaDictionary[req.id]?.finalHoldDays} Hari</Text>
                              )}
                            </Stack>
                          </Table.Td>

                          <Table.Td>
                            <Badge
                              color={
                                isHoldState
                                  ? 'orange'
                                  : (req.status === TICKET_STATUS.DISETUJUI || req.status === TICKET_STATUS.RILIS_PRD)
                                    ? 'green'
                                    : req.status === TICKET_STATUS.DITOLAK
                                      ? 'red'
                                      : req.status === TICKET_STATUS.DIKIRIM
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
                                  🔒 Menunggu Penugasan
                                </Badge>
                              ) : (
                                <>
                                  <Tooltip label={req.status === TICKET_STATUS.PROSES_HOLDING ? 'Upload Dokumen Akhir & Setujui Pengajuan'
                                  : req.status === TICKET_STATUS.UAT ? 'Selesaikan Pengajuan' : 'Lanjutkan proses ke tahap berikutnya'} position="top" withArrow>
                                    <ActionIcon
                                      size="md"
                                      variant="light"
                                      color="green"
                                      disabled={isHoldState}
                                      onClick={() => {
                                        if (req.status === TICKET_STATUS.PROSES_HOLDING) {
                                          setFinalUploadRequest(req);
                                        } else {
                                          setConfirmNextRequest(req);
                                        }
                                      }}
                                    >
                                      {req.status === TICKET_STATUS.PROSES_HOLDING || req.status === TICKET_STATUS.UAT ? <IconFileCheck size={18} /> : <IconArrowRight size={18} />}
                                    </ActionIcon>
                                  </Tooltip>

                                  <Tooltip label="Delegasikan ke Staf lain" position="top" withArrow>
                                    <ActionIcon
                                      size="md"
                                      variant="light"
                                      color="indigo"
                                      onClick={() => setAssignRequest(req)}
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

            {filteredRequests.length > 0 && (
              <Group justify="center" mt="xl" mb="sm">
                <Pagination
                  total={Math.ceil(filteredRequests.length / pageSize)}
                  value={page}
                  onChange={setPage}
                  color="ptpn4Green.9"
                  radius="md"
                />
              </Group>
            )}

          </Box>
        )}
      </Paper>

      <FinalUploadModal
        opened={!!finalUploadRequest}
        onClose={() => setFinalUploadRequest(null)}
        ticket={finalUploadRequest}
        currentUserName={currentUserName}
        defaultTo={defaultConsultantTo}
        defaultCc={defaultConsultantCc.join(', ')}
        onSubmit={handleSubmitFinalDocument}
      />

      <RejectModal
        opened={!!rejectRequest}
        onClose={() => setRejectRequest(null)}
        ticketNumber={rejectRequest?.ticket_number}
        onSubmit={handleRejectSubmit}
      />

      <Modal
        opened={confirmNextRequest !== null}
        onClose={() => setConfirmNextRequest(null)}
        title={<Text fw={700} size="md">Konfirmasi Perubahan Status</Text>}
        centered
        radius="lg"
      >
        <Stack gap="md">
          <Text size="sm" c="slateClean.7">
            Anda akan memproses tiket <b>{confirmNextRequest?.ticket_number}</b> ke {' '}
            <b>{getNextStatusText(confirmNextRequest)}</b>? Tindakan ini tidak dapat dibatalkan.
          </Text>
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={() => setConfirmNextRequest(null)} radius="md">Batal</Button>
            <Button
              color="green.8"
              radius="md"
              loading={isProcessingNext}
              onClick={async () => {
                if (confirmNextRequest) {
                  setIsProcessingNext(true);
                  try {
                    const tempReq = confirmNextRequest;
                    await handleNextStep(tempReq);
                    setConfirmNextRequest(null);
                  } finally {
                    setIsProcessingNext(false);
                  }
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
              loading={isProcessingHold}
              onClick={async () => {
                if (confirmHoldRequest) {
                  setIsProcessingHold(true);
                  try {
                    const isSuccess = await handleToggleHold(confirmHoldRequest, holdReason);
                    if (isSuccess !== false) {
                      setConfirmHoldRequest(null);
                      setHoldReason('');
                    }
                  } finally {
                    setIsProcessingHold(false);
                  }
                }
              }}
            >
              Konfirmasi
            </Button>
          </Group>
        </Stack>
      </Modal>

      <AssignModal
        opened={!!assignRequest}
        onClose={() => setAssignRequest(null)}
        ticketNumber={assignRequest?.ticket_number}
        picList={picList}
        currentPicId={assignRequest?.current_pic_id}
        onSubmit={handleAssignPic}
      />

      <EmailModal
        opened={!!selectedTicketForEmail}
        onClose={() => setSelectedTicketForEmail(null)}
        ticket={selectedTicketForEmail}
        currentUserName={currentUserName}
        currentUserEmail={currentUserEmail}
      />

      <DetailDrawer
        detail={selectedDetail}
        historyLogs={historyLogs}
        loadingTimeline={loadingTimeline}
        onClose={() => setSelectedDetail(null)}
        editingSlaId={editingSlaId}
        newSlaValue={newSlaValue}
        isSavingSla={isSavingSla}
        onEditSla={(id, currentVal) => {
          setEditingSlaId(id);
          setNewSlaValue(currentVal);
        }}
        onCancelEditSla={() => setEditingSlaId(null)}
        onSlaValueChange={(val) => setNewSlaValue(val)}
        onSaveSla={handleUpdateSla}
        currentUserRole={currentUserRole}
        currentPicId={currentPicId}
        onDownload={(url, name) => handleDownloadSecureFile(supabase, url, name)}
      />
    </>
  );
}
