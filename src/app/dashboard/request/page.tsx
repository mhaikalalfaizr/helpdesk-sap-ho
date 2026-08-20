'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { notifications } from '@mantine/notifications';
import {
  Paper, Text, Group, Stack, Box,
  FileInput, Textarea, Button, TextInput, Select, Pill, Badge
} from '@mantine/core';
import { CategoryOption } from '@/utils/types';

export default function UserDashboard() {
  const router = useRouter();
  const supabase = createClient();

  const [userProfile, setUserProfile] = useState<{ id: string; fullName: string; division: string; email: string; work_unit: string } | null>(null);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [subCategoryOptions, setSubCategoryOptions] = useState<{ value: string; label: string }[]>([]);
  const [subCategory, setSubCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentUserName, setCurrentUserName] = useState<string>('');

  const [categoryId, setCategoryId] = useState<string>('');
  const [requestTitle, setRequestTitle] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [formLoading, setFormLoading] = useState(false);

  const [urgency, setUrgency] = useState<string | null>(null);


  useEffect(() => {

    initDashboard();

  }, [router]);

  useEffect(() => {
    const fetchSubCategories = async () => {
      if (!categoryId) {
        setSubCategoryOptions([]);
        setSubCategory(null);
        return;
      }
      const { data } = await supabase
        .from('sub_categories')
        .select('id, name')
        .eq('category_id', parseInt(categoryId));
      if (data && data.length > 0) {
        setSubCategoryOptions(data.map(sub => ({
          value: String(sub.id),
          label: sub.name
        })));
      } else {
        setSubCategoryOptions([]);
        setSubCategory(null);
      }
    };
    fetchSubCategories();
  }, [categoryId]);

  const initDashboard = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/login');
      return;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, division, email, role, work_unit')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile || profile.role !== 'Pengaju') {
      notifications.show({
        title: 'Akses Dialihkan',
        message: 'Membuka dashboard Staf...',
        color: 'blue',
      });
      router.push('/dashboard/staff');
      return;
    }

    if (profile) {
      setUserProfile({
        id: user.id,
        fullName: profile.full_name,
        division: profile.division,
        email: profile.email || '',
        work_unit: profile.work_unit || '',
      });
      setCurrentUserName(profile.full_name);
    }

    const { data: categoriesData } = await supabase.from('categories').select('id, name').order('id', { ascending: true });
    if (categoriesData) {
      setCategories(categoriesData.map((cat) => ({ value: String(cat.id), label: cat.name })));
    }



    setLoading(false);
  };

  const generateTicketNumber = () => {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const secureStr = crypto.randomUUID().split('-')[0].toUpperCase().substring(0, 6);
    return `REQ-${dateStr}-${secureStr}`;
  };

  const handleFilesChange = (payload: File[]) => {
    const MAX_SIZE_MB = 5;

    const oversizedFiles = payload.filter(file => file.size / (1024 * 1024) > MAX_SIZE_MB);

    if (oversizedFiles.length > 0) {
      notifications.show({
        title: 'Dokumen Terlalu Besar',
        message: `Ukuran dokumen melebihi ${MAX_SIZE_MB} MB.`,
        color: 'red',
      });
      return;
    }

    setFiles(payload);
  };

  const removeFile = (indexToRemove: number) => {
    setFiles(files.filter((_, index) => index !== indexToRemove));
  };

  const ValueComponent = ({ value }: { value: File | File[] | null }) => {
    if (value === null) return null;

    if (Array.isArray(value)) {
      return (
        <Group gap="xs">
          {value.map((file, index) => (
            <Badge
              key={index}
              variant="light"
              color="gray"
              radius="sm"
              style={{ textTransform: 'none', cursor: 'default' }}
              rightSection={
                <Text
                  component="span"
                  size="xs"
                  fw={900}
                  style={{ cursor: 'pointer', padding: '0 4px' }}
                  onClick={(e) => {
                    e.preventDefault(); 
                    e.stopPropagation();
                    removeFile(index);
                  }}
                >
                  ✕
                </Text>
              }
            >
              {file.name}
            </Badge>
          ))}
        </Group>
      );
    }
    return (
      <Badge variant="light" color="gray" radius="sm" style={{ textTransform: 'none' }}>
        {value.name}
      </Badge>
    );
  };

  const handleUploadAndSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile) return;

    if (!categoryId) {
      notifications.show({
        title: 'Data Belum Lengkap',
        message: 'Harap pilih Kategori Pengajuan.', color: 'orange'
      });
      return;
    }

    if (subCategoryOptions.length > 0 && !subCategory) {
      notifications.show({
        title: 'Data Belum Lengkap',
        message: 'Harap pilih sub-kategori tiket Anda sebelum mengirim.', color: 'orange'
      });
      return;
    }

    if (!requestTitle.trim()) {
      notifications.show({
        title: 'Data Belum Lengkap',
        message: 'Harap isi Judul Pengajuan Anda.', color: 'orange'
      });
      return;
    }

    if (!urgency) {
      notifications.show({
        title: 'Data Belum Lengkap',
        message: 'Harap tentukan Tingkat Urgensi pengajuan.', color: 'orange'
      });
      return;
    }

    if (!description.trim()) {
      notifications.show({
        title: 'Data Belum Lengkap',
        message: 'Harap isi Deskripsi Pengajuan Anda.', color: 'orange'
      });
      return;
    }

    if (!isHeadOffice && !isTiketCategory && files.length === 0) {
      notifications.show({
        title: 'Dokumen Wajib Dilampirkan',
        message: 'Silakan unggah dokumen pengajuan.', color: 'orange'
      });
      return;
    }

    setFormLoading(true);
    let insertedRequestId: string | null = null;
    let uploadedFilePaths: string[] = [];

    try {
      const ticketNumber = generateTicketNumber();
      const uploadedAttachments: { file_name: string; file_url: string; type: string }[] = [];



      for (const currentFile of files) {
        const fileExt = currentFile.name.split('.').pop();
        const randomNonce = Math.random().toString(36).substring(7);
        const fileName = `${userProfile.id}-${Date.now()}-${randomNonce}.${fileExt}`;
        const filePath = `user_docs/${fileName}`;

        uploadedFilePaths.push(filePath);

        const { error: uploadError } = await supabase.storage.from('documents').upload(filePath, currentFile);
        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(filePath);

        uploadedAttachments.push({
          file_name: currentFile.name,
          file_url: publicUrl,
          type: 'Dokumen_Awal'
        });
      }

      const primaryFileUrl = uploadedAttachments[0]?.file_url || null;

      const { data: newRequest, error: insertError } = await supabase
        .from('requests')
        .insert([
          {
            ticket_number: ticketNumber,
            user_id: userProfile.id,
            category_id: parseInt(categoryId),
            sub_category_id: subCategory ? parseInt(subCategory) : null,
            request_title: requestTitle,
            description: description,
            status: 'Dikirim',
            file_url: primaryFileUrl,
            custom_sla_days: subCategoryOptions.find(sub => sub.value === subCategory)?.label ? 7 : null,
            total_hold_days: 0,
            urgency: urgency,
          },
        ])
        .select()
        .single();

      if (insertError) throw insertError;

      insertedRequestId = newRequest.id;

      if (uploadedAttachments.length > 0) {
        const attachmentsPayload = uploadedAttachments.map((att) => ({
          request_id: newRequest.id,
          file_name: att.file_name,
          file_url: att.file_url,
          uploaded_by: userProfile.id,
          type: att.type
        }));

        const { error: attachError } = await supabase.from('attachments').insert(attachmentsPayload);
        if (attachError) throw attachError;
      }

      await supabase.from('request_logs').insert([
        { request_id: newRequest.id, changed_by: userProfile.id, status_before: null, status_after: 'Dikirim', notes: 'Dokumen berhasil diajukan ke antrean pusat' }
      ]);

      notifications.show({
        title: 'Pengajuan Berhasil Dikirim',
        message: `Tiket nomor ${ticketNumber} telah sukses dikirim ke sistem.`,
        color: 'green',
        autoClose: 5000,
      });

      setRequestTitle('');
      setDescription('');
      setCategoryId('');
      setFiles([]);
      setUrgency(null);
      setFormLoading(false);

      try {
        const emailRes = await fetch('/api/send-email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ticketNumber: ticketNumber,
            title: requestTitle,
            status: 'Dikirim (Menunggu Antrean)',
            notes: 'Dokumen Anda berhasil dikirim ke sistem dan menunggu verifikasi oleh pihak Staf.',
            recipientEmail: userProfile?.email,
            recipientName: userProfile?.fullName
          }),
        });

        if (!emailRes.ok) {
          console.warn('API Email menolak pengiriman:', await emailRes.json());
        }
      } catch (emailErr) {
        console.error('Jaringan terputus saat kirim notif email tiket baru:', emailErr);
      }

      if (urgency === 'Tinggi') {
        try {
          const { data: koordinatorList } = await supabase
            .from('profiles')
            .select('email, full_name')
            .eq('role', 'Koordinator');

          if (koordinatorList && koordinatorList.length > 0) {
            for (const koor of koordinatorList) {
              if (!koor.email) continue;

              try {
                const emailRes = await fetch('/api/send-email', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    ticketNumber: ticketNumber,
                    title: `[TIKET PENTING] ${requestTitle}`,
                    status: 'Menunggu Antrean (Prioritas)',
                    notes: `Tiket prioritas tinggi dari ${userProfile?.fullName} masuk. Segera periksa dasbor.`,
                    recipientEmail: koor.email,
                    recipientName: koor.full_name
                  }),
                });

                if (!emailRes.ok) {
                  const contentType = emailRes.headers.get("content-type");

                  if (contentType && contentType.indexOf("application/json") !== -1) {
                    const errData = await emailRes.json();
                    console.error(`API menolak email ke ${koor.full_name}:`, errData);
                  } else {
                    await emailRes.text();
                    console.error(`API Crash (Bukan JSON) saat kirim ke ${koor.full_name}. Status: ${emailRes.status}`);
                  }
                }

                await new Promise(resolve => setTimeout(resolve, 1500));

              } catch (err) {
                console.error(`Gagal fetch ke API email untuk ${koor.full_name}:`, err);
              }
            };
          }
          
        } catch (emailBlastErr) {
          console.error('Jaringan terputus saat mengirimkan notifikasi ke Staf:', emailBlastErr);
        }
      }

      router.push('/dashboard/request/history');

    } catch (error: any) {
      if (insertedRequestId) {
        await supabase.from('requests').delete().eq('id', insertedRequestId);
      }

      if (uploadedFilePaths.length > 0) {
        await supabase.storage.from('documents').remove(uploadedFilePaths);
      }

      notifications.show({ title: 'Gagal Membuat Pengajuan', message: error.message, color: 'red' });
    } finally {
      setFormLoading(false);
    }
  };



  const activeCategoryLabel = categories.find(c => c.value === categoryId)?.label || '';
  const isTiketCategory = activeCategoryLabel.toLowerCase().includes('tiket');
  const isHeadOffice = userProfile?.work_unit?.toLowerCase().includes('head office') || userProfile?.division?.toLowerCase().includes('head office');

  if (loading || !userProfile) return null;

  return (
    <Box style={{ maxWidth: '1700px', margin: '0 auto' }}>
      <Box mb="xl">
        <Stack gap="xs">
          <Text size="28px" fw={800} c="slateClean.9" style={{ letterSpacing: '-0.5px' }}>Formulir Pengajuan Dokumen</Text>
          <Text size="sm" c="dimmed">Isi kelengkapan data pada formulir berikut.</Text>
        </Stack>
      </Box>

      <Paper p="xl">
        <Group mb="sm" gap="xs">
          <Text fw={800} size="xl" c="slateClean.9">Detail Pengajuan</Text>
        </Group>

        <form onSubmit={handleUploadAndSubmit} noValidate>
          <Stack gap="md">
            <Select
              label="Kategori Pengajuan"
              placeholder="Pilih kategori yang sesuai"
              data={categories}
              required
              value={categoryId}
              onChange={(value) => setCategoryId(value || '')}
              radius="md"
            />
            {subCategoryOptions.length > 0 && (
              <Select
                label="Sub-Kategori Tiket"
                placeholder="Pilih tipe permasalahan yang sesuai"
                required
                searchable
                value={subCategory}
                onChange={setSubCategory}
                data={subCategoryOptions}
                radius="md"
              />
            )}
            <TextInput
              label="Judul Pengajuan"
              placeholder="Contoh: Pengajuan Akses Akun SAP"
              required
              value={requestTitle}
              onChange={(e) => setRequestTitle(e.target.value)}
              radius="md"
            />
            <Select
              label="Tingkat Urgensi"
              placeholder="Pilih tingkat urgensi dokumen"
              data={[
                { value: 'Rendah', label: '🟢 Rendah (Biasa)' },
                { value: 'Sedang', label: '🟡 Sedang (Butuh Perhatian)' },
                { value: 'Tinggi', label: '🔴 Tinggi (Prioritas Utama)' },
              ]}
              required
              value={urgency}
              onChange={setUrgency}
              radius="md"
            />
            <Textarea
              label="Deskripsi Pengajuan"
              placeholder="Berikan deskripsi secara singkat dan jelas"
              rows={5}
              value={description}
              required
              onChange={(e) => setDescription(e.target.value)}
              radius="md"
            />
            <FileInput
              label="Unggah Dokumen Pengajuan (PDF / .docx / .xlsx) - Maksimal 5 MB"
              placeholder={(!isHeadOffice && !isTiketCategory) ? "Pilih dokumen dari perangkat Anda" : "Opsional - Maksimal 5 MB"}
              required={!isTiketCategory && !isHeadOffice}
              value={files}
              onChange={handleFilesChange}
              accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,
                      application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              multiple
              radius="md"
              clearable
              valueComponent={ValueComponent}
            />
            <Button type="submit" loading={formLoading} color="ptpn4Green.9" fullWidth mt="lg" size="md" radius="md">
              Kirim Pengajuan
            </Button>
          </Stack>
        </form>
      </Paper>
    </Box>
  );
}
