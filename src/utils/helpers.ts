export const countWorkingDays = (startDate: number, endDate: number, publicHolidays: string[]) => {
  let count = 0;
  const curDate = new Date(startDate);
  const end = new Date(endDate);

  curDate.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  while (curDate < end) {
    const dayOfWeek = curDate.getDay();
    const year = curDate.getFullYear();
    const month = String(curDate.getMonth() + 1).padStart(2, '0');
    const day = String(curDate.getDate()).padStart(2, '0');
    const formattedDate = `${year}-${month}-${day}`;

    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    const isHoliday = publicHolidays.includes(formattedDate);

    if (!isWeekend && !isHoliday) {
      count++;
    }
    curDate.setDate(curDate.getDate() + 1);
  }
  return count;
};

export const getSlaMetrics = (createdAt: string, status: string, totalHoldDays: number, slaLimit: number | null, updatedAt: string | null | undefined, publicHolidays: string[]) => {
  const isFinal = status === 'Disetujui' || status === 'Ditolak' || status === 'Selesai (Rilis PRD)';
  const isCurrentlyHold = status.startsWith('Sedang Ditangguhkan') || status.startsWith('Sedang Ditahan');

  const createdDate = new Date(createdAt).getTime();
  const endTime = (isFinal && updatedAt) ? new Date(updatedAt).getTime() : new Date().getTime();

  const totalElapsedDays = countWorkingDays(createdDate, endTime, publicHolidays);

  let finalHoldDays = totalHoldDays || 0;
  if (isCurrentlyHold && updatedAt) {
    const holdStart = new Date(updatedAt).getTime();
    const currentHoldDuration = countWorkingDays(holdStart, new Date().getTime(), publicHolidays);
    finalHoldDays += currentHoldDuration;
  }

  const netSlaDays = totalElapsedDays - finalHoldDays;

  return {
    finalHoldDays: Math.floor(Math.max(0, finalHoldDays)),
    isOverdue: slaLimit !== null ? netSlaDays > slaLimit : false,
    displayString: netSlaDays <= 0 ? '1 Hari' : `${netSlaDays} Hari`
  };
};

export const getStatusColor = (status: string) => {
  if (status.startsWith('Sedang Ditangguhkan') || status.startsWith('Sedang Ditahan')) return 'orange';
  if (status === 'Disetujui' || status === 'Disetujui Seluruh Pihak' || status === 'Selesai (Rilis PRD)') return 'green';
  if (status === 'Ditolak') return 'red';
  if (status === 'Dikirim') return 'cyan';
  return 'blue';
};
