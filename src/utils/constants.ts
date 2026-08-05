export const TICKET_STATUS = {
  DIKIRIM: 'Dikirim',
  DITUGASKAN: 'Ditugaskan',
  PROSES_STAF: 'Dalam Proses oleh Staf',
  PROSES_HO: 'Dalam Proses oleh Head Office',
  PROSES_HOLDING: 'Dalam Proses oleh Holding',
  ELISITASI: 'Dalam Tahap Elisitasi Kebutuhan Pengguna',
  LAPOR_KONSULTAN: 'Dalam Tahap Pelaporan ke Konsultan',
  PENGEMBANGAN: 'Dalam Tahap Pengembangan',
  UAT: 'Dalam Tahap Pengujian Penerimaan Pengguna (UAT)',
  RILIS_PRD: 'Selesai (Rilis PRD)',
  DISETUJUI: 'Disetujui',
  DITOLAK: 'Ditolak',
  HOLD_STAF: 'Sedang Ditangguhkan di Staf',
  HOLD_HO: 'Sedang Ditangguhkan di Head Office',
  HOLD_HOLDING: 'Sedang Ditangguhkan di Holding',
} as const;

export type TicketStatus = typeof TICKET_STATUS[keyof typeof TICKET_STATUS];