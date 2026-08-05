# PROJECT CONTEXT: SAP HO HELPDESK SYSTEM

## 1. Project Overview
**System Name:** SAP HO Helpdesk Ticketing System
**Project Type:** Enterprise Web Application (Internal Corporate System)
**Primary Objective:** Mendigitalisasi birokrasi pengajuan, pelaporan, dan eskalasi tiket IT/Sistem dari user internal ke tim Helpdesk, hingga diteruskan ke pihak Konsultan eksternal.
**Development Phase:** Advanced Feature Implementation & UI/UX Polishing.

## 2. Technology Stack
- **Framework:** Next.js (React) - App Router (`/src/app`)
- **Language:** TypeScript (Strict typing for components and API routes)
- **Database & Auth:** Supabase (PostgreSQL, Row Level Security, Storage Buckets)
- **UI Library:** Mantine UI (Component-driven, hooks, and notifications)
- **Email Service:** Resend API (Server-side email dispatching)
- **Styling:** CSS Modules / Mantine styling engine

## 3. Architecture & Security Standards (CRITICAL RULES FOR AI)
- **Server-Side Operations (Next.js API Routes):** Operasi yang melibatkan Secret Keys (seperti `SUPABASE_SERVICE_ROLE_KEY` atau `RESEND_API_KEY`) **HARUS** dilakukan di dalam route backend (`/app/api/...`), bukan di Client Components.
- **Row Level Security (RLS):** Database Supabase menggunakan RLS. Frontend hanya melakukan fetch menggunakan *anon key* berdasarkan sesi user yang sedang login. API Routes dapat mem-bypass RLS menggunakan *Service Role Key* hanya untuk tugas administratif (seperti download file aman atau email).
- **Anti-Overfetching:** Query database harus spesifik memilih kolom yang dibutuhkan (contoh: `.select('id, ticket_number, status')`), tidak menggunakan `select('*')` jika tidak perlu.
- **File Handling (Zero-Trust):** Dokumen sensitif disimpan di Supabase Storage (Private/Secure bucket). Sistem tidak mengekspos URL publik langsung ke pihak eksternal, melainkan menggunakan metode Server-Side Download -> Buffer -> Email Attachment.

## 4. Role-Based Access Control (RBAC)
Sistem memiliki beberapa entitas pengguna dengan hak akses berbeda:
1. **User Internal (Pemohon):** Membuat tiket, mengisi deksripsi, dan melampirkan dokumen awal.
2. **Kadept / Approver:** (Opsional/Jika ada) Melakukan validasi tiket di level departemen.
3. **Tim Helpdesk (Staf):** Menerima tiket, mengulas dokumen, dan memiliki otorisasi untuk melakukan **Eskalasi ke Konsultan**.
4. **Konsultan (Eksternal):** Tidak memiliki akun di dalam sistem. Hanya menerima laporan via Email otomatis dari sistem (termasuk lampiran dokumen final).

## 5. Core Database Schema (Abstract/Inferred)
Struktur relasional data utama dalam Supabase:

- `profiles`:
  - `id` (UUID, FK to auth.users)
  - `name`, `email`, `role`, `unit_kerja`
- `requests` (Tickets):
  - `id`, `ticket_number`, `request_title`, `description`, `status`, `created_at`, `user_id`
- `attachments`:
  - `id`, `request_id` (FK to requests), `file_name`, `file_url`, `created_at`
- `ticket_histories` (Audit Trail):
  - `id`, `ticket_id`, `action`, `actor_name`, `notes`, `created_at`

## 6. Key Features & Workflows

### A. Ticket Management (CRUD)
- Dashboard tabel menggunakan Mantine Table dengan filter dan paginasi.
- Detail tiket ditampilkan dalam Drawer/Modal untuk efisiensi ruang layar.
- Update status tiket secara real-time.

### B. Secure Attachment Handling
- Upload file ke Supabase Storage dengan metadata yang diikat ke `ticket_id`.
- Download file aman melalui authenticated session.

### C. Automated Escalation Email (Enterprise Workflow)
- **Trigger:** Tombol "Kirim ke Konsultan" di antarmuka Staf.
- **UI:** Menampilkan Mantine Modal berisi *template* teks yang *editable* dan status *attachment*.
- **Backend Pipeline:** 
  1. Frontend mengirim payload ke `/api/send-email-konsultan`.
  2. Server mengunduh file PDF dari Supabase menjadi `Buffer`.
  3. Resend API mengirimkan email beserta Buffer tersebut sebagai *attachment*.
  4. **Email Routing:** Menggunakan header `Reply-To` ke email Staf/User yang sedang mengeksekusi, sehingga jika Konsultan membalas email, komunikasi diteruskan langsung ke Staf yang bersangkutan, bukan ke no-reply bot.

## 7. AI Assistant Instructions
Saat memberikan saran kode untuk proyek ini, AI wajib mengikuti instruksi berikut:
1. Selalu gunakan komponen Mantine UI yang sesuai jika membuat/mengedit elemen visual.
2. Jaga *strict typing* TypeScript (jangan gunakan `any` sebisa mungkin, definisikan `interface` atau `type`).
3. Jika memberikan solusi terkait *fetching* atau mutasi data, pisahkan dengan jelas mana operasi yang aman dilakukan di Klien (Supabase JS Client) dan mana yang wajib dilempar ke *Server/API Route*.
4. Perhatikan penanganan *error* (Error Handling) menggunakan Blok Try-Catch dan Mantine Notifications untuk *feedback* ke *user*.