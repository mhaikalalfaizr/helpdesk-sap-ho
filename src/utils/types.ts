export interface RequestLog {
    id: string;
    status_before: string | null;
    status_after: string;
    notes: string | null;
    created_at: string;
    profiles?: { full_name: string };
}

export interface RequestItem {
    id: string;
    ticket_number: string;
    request_title: string;
    description: string;
    status: string;
    total_hold_days: number;
    created_at: string;
    updated_at: string;
    file_url?: string;
    urgency?: string;
    custom_sla_days?: number | null;
    current_pic_id?: string | null;
    user_profile?: { full_name: string; division: string; email: string };
    categories?: { id: number; name: string; sla_days: number };
    sub_categories?: { name: string; sla_days: number };
    pic?: { full_name: string } | null;
    attachments?: { id: string; file_url: string; type: string; file_name?: string }[];
    profiles: { full_name: string; unit_kerja: string; division: string; email?: string } | null;
}

export interface CategoryOption {
    value: string;
    label: string;
}

export interface SlaSegment {
    name: string;
    value: number;
    color: string;
}

export interface PicWorkloadRow {
    picName: string;
    ticketCount: number;
}

export interface CategoryRow {
    categoryName: string;
    totalTickets: number;
    averageDays: number;
}

export interface UserProfile {
    id: string;
    full_name: string;
    email: string;
    unit_kerja: string | null;
    division: string | null;
    role: 'Koordinator' | 'Staf' | 'Pengaju';
    is_active: boolean;
    created_at: string;
}
