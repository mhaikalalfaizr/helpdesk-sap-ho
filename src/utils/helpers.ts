import { SupabaseClient } from '@supabase/supabase-js';
import { TICKET_STATUS } from './constants';

export const isTicketFinal = (status: string) => {
  return status === TICKET_STATUS.DISETUJUI || status === TICKET_STATUS.DITOLAK || status === TICKET_STATUS.RILIS_PRD;
};

export const isTicketHold = (status: string) => {
  return status.startsWith(TICKET_STATUS.HOLD_HO) || status.startsWith(TICKET_STATUS.HOLD_STAF) || status.startsWith(TICKET_STATUS.HOLD_HOLDING);
};

export const isTicketUnassigned = (status: string) => {
  return status === TICKET_STATUS.DIKIRIM;
};

export const isTicketInProcess = (status: string) => {
  return !isTicketFinal(status) && !isTicketHold(status) && !isTicketUnassigned(status);
};

export const countWorkingDays = (startDate: number, endDate: number, publicHolidays: string[]) => {
  let count = 0;

  const getLocalTime = (ms: number) =>
    new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
  const startStr = getLocalTime(startDate);
  const endStr = getLocalTime(endDate);
  let currentMs = new Date(`${startStr}T00:00:00+07:00`).getTime();
  const endMs = new Date(`${endStr}T00:00:00+07:00`).getTime();
  while (currentMs < endMs) {
    const formattedDate = getLocalTime(currentMs);
    const weekday = new Date(currentMs).toLocaleDateString('en-US', { timeZone: 'Asia/Jakarta', weekday: 'short' });

    const isWeekend = weekday === 'Sun' || weekday === 'Sat';
    const isHoliday = publicHolidays.includes(formattedDate);
    if (!isWeekend && !isHoliday) {
      count++;
    }
    currentMs += 24 * 60 * 60 * 1000;
  }
  return count;
};

export const handleDownloadSecureFile = async (supabase: SupabaseClient, rawUrl: string, providedFileName?: string) => {
  try {
    const pathSegments = rawUrl.split('/documents/');
    if (pathSegments.length < 2) throw new Error("Format URL tidak valid");

    const filePath = decodeURIComponent(pathSegments[1]);

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
    }
  } catch (err) {
    console.error('Download error:', err);
    alert(err instanceof Error ? err.message : 'Gagal mengakses dokumen');
  }
};

export const getSlaMetrics = (createdAt: string, status: string, totalHoldDays: number, slaLimit: number | null, updatedAt: string | null | undefined, publicHolidays: string[]) => {
  const isFinal = isTicketFinal(status);
  const isCurrentlyHold = isTicketHold(status);

  const createdDate = new Date(createdAt).getTime();
  const endTime = (isFinal && updatedAt) ? new Date(updatedAt).getTime() : new Date().getTime();

  const totalElapsedDays = countWorkingDays(createdDate, endTime, publicHolidays);

  let finalHoldDays = totalHoldDays || 0;
  let addedHold = 0;
  if (isCurrentlyHold && updatedAt) {
    const holdStart = new Date(updatedAt).getTime();
    addedHold = countWorkingDays(holdStart, new Date().getTime(), publicHolidays);
    finalHoldDays += addedHold;
  }

  const netSlaDays = totalElapsedDays - finalHoldDays;

  return {
    finalHoldDays: Math.floor(Math.max(0, finalHoldDays)),
    isOverdue: slaLimit !== null ? netSlaDays > slaLimit : false,
    displayString: netSlaDays <= 0 ? '1 Hari' : `${netSlaDays} Hari`
  };
};

export const getStatusColor = (status: string) => {
  if (isTicketHold(status)) return 'orange';
  if (isTicketFinal(status)) return 'green';
  if (status === 'Ditolak') return 'red';
  if (isTicketUnassigned(status)) return 'cyan';
  return 'blue';
};

export const getUrgencyColor = (urgency: string) => {
  if (urgency === 'Tinggi') return 'red';
  if (urgency === 'Sedang') return 'orange';
  return 'gray';
};

export const formatDate = (dateString: string | number | Date) => {
  return new Date(dateString).toLocaleDateString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric'
  });
};

export const getProjectedDate = (slaDays: number, startDateMs?: number) => {
  const start = startDateMs ? new Date(startDateMs) : new Date();
  start.setDate(start.getDate() + slaDays);
  return start.toLocaleDateString('id-ID', {
    day: 'numeric', month: 'long', year: 'numeric'
  });
};
