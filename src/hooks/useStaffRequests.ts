import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { RequestItem } from '@/utils/types';

export function useStaffRequests() {
    const router = useRouter();

    const [supabase] = useState(() => createClient());

    const [currentPicId, setCurrentPicId] = useState<string | null>(null);
    const [currentUserName, setCurrentUserName] = useState('Staf');
    const [currentUserEmail, setCurrentUserEmail] = useState('');
    const [currentUserRole, setCurrentUserRole] = useState<string>('');
    const [requests, setRequests] = useState<RequestItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [picList, setPicList] = useState<{ value: string; label: string; email: string }[]>([]);
    const [publicHolidays, setPublicHolidays] = useState<string[]>([]);
    const [defaultConsultantTo, setDefaultConsultantTo] = useState('');
    const [defaultConsultantCc, setDefaultConsultantCc] = useState<string[]>([]);

    useEffect(() => {
        initPic();

        const channel = supabase
            .channel('schema-db-changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'requests' },
                (payload) => {
                    if (payload.new && 'id' in payload.new) {
                        fetchSingleUpdatedRequest(payload.new.id as string);
                    } else if (payload.old && 'id' in payload.old && payload.eventType === 'DELETE') {
                        setRequests(prev => prev.filter(r => r.id !== payload.old.id));
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [router, supabase]);

    const fetchSingleUpdatedRequest = async (requestId: string) => {
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
            .eq('id', requestId)
            .maybeSingle();

        if (data) {
            setRequests(prev => {
                const exists = prev.find(r => r.id === requestId);
                if (exists) return prev.map(r => r.id === requestId ? (data as unknown as RequestItem) : r);
                return [data as unknown as RequestItem, ...prev];
            });
        }
    };

    const initPic = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                router.push('/login');
                return;
            }
            setCurrentPicId(user.id);

            const { data: profileData } = await supabase
                .from('profiles')
                .select('full_name, role, email')
                .eq('id', user.id)
                .maybeSingle();

            if (!profileData || (profileData.role !== 'Koordinator' && profileData.role !== 'Staf')) {
                await supabase.auth.signOut();
                router.replace('/login');
                return;
            }

            setCurrentUserName(profileData.full_name || 'Staf');
            setCurrentUserRole(profileData.role);
            setCurrentUserEmail(profileData.email || '');

            const { data, error: reqError } = await supabase
                .from('requests')
                .select(`
            id, ticket_number, request_title, description, status, total_hold_days, created_at, updated_at, file_url, current_pic_id, urgency, custom_sla_days,
            profiles:user_id (full_name, unit_kerja, division, email),
            categories:category_id (id, name, sla_days),
            sub_categories:sub_category_id (name, sla_days),
            pic:current_pic_id (full_name),
            attachments (id, file_name, file_url, type)
        `)
                .order('created_at', { ascending: false })
                .limit(500);

            if (reqError) {
                console.error("GAGAL NARIK TIKET:", reqError);
                alert("Gagal narik tiket! Cek Console Browser!");
            }

            if (data) setRequests(data as unknown as RequestItem[]);

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

            const { data: consultantsData } = await supabase.from('consultants').select('name, email, type').eq('is_active', true);
            if (consultantsData) {
                const toEntry = consultantsData.find(c => c.type === 'to');
                const ccEntries = consultantsData.filter(c => c.type === 'cc');
                setDefaultConsultantTo(toEntry?.email || '');
                setDefaultConsultantCc(ccEntries.map(c => c.email));
            }

            const { data: holidayData } = await supabase.from('public_holidays').select('holiday_date');
            if (holidayData) {
                setPublicHolidays(holidayData.map(h => h.holiday_date));
            }

        } catch (err) {
            console.error('Error Fatal:', err);
        } finally {
            setLoading(false);
        }
    };

    return {
        currentPicId, currentUserName, currentUserEmail, currentUserRole,
        requests, setRequests, loading, picList, publicHolidays,
        defaultConsultantTo, defaultConsultantCc
    };
}
