import { useState, useMemo } from 'react';
import { getSlaMetrics, isTicketFinal, isTicketHold, isTicketUnassigned, isTicketInProcess } from '@/utils/helpers';

export function useTableFilters(requests: any[], publicHolidays: string[], currentPicId: string | null) {
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilter, setActiveFilter] = useState<string | null>(null);
    const [urgencyFilter, setUrgencyFilter] = useState<string | null>(null);
    const [sortKey, setSortKey] = useState<string | null>(null);
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>(null);
    const [showOnlyMine, setShowOnlyMine] = useState(false);
    const [page, setPage] = useState(1);
    const pageSize = 10;

    const slaDictionary = useMemo(() => {
        const dict: Record<string, { durationNum: number, displayString: string, isOverdue: boolean, finalHoldDays: number}> = {};
        requests.forEach(req => {
            const isFinal = isTicketFinal(req.status);
            const effectiveSlaDays = (req.categories?.name === 'Tiket Lainnya') ? (req.custom_sla_days ?? null) : 7;
            const metrics = getSlaMetrics(req.created_at, req.status, req.total_hold_days, effectiveSlaDays, req.updated_at, publicHolidays);

            dict[req.id] = {
                durationNum: parseInt(metrics.displayString.replace(/[^0-9]/g, '')) || 0,
                displayString: metrics.displayString,
                isOverdue: !isFinal && metrics.isOverdue,
                finalHoldDays: metrics.finalHoldDays
            };
        });
        return dict;
    }, [requests, publicHolidays]);

    const totalCount = requests.length;
    const unassignedCount = requests.filter(r => isTicketUnassigned(r.status)).length;
    const processCount = requests.filter(r => isTicketInProcess(r.status)).length;
    const holdCount = requests.filter(r => isTicketHold(r.status)).length;
    const archivedCount = requests.filter(r => isTicketFinal(r.status)).length;

    const overdueCount = requests.filter(r => slaDictionary[r.id]?.isOverdue).length;

    const filteredRequests = useMemo(() => {
        let filtered = [...requests];

        if (showOnlyMine && currentPicId) {
            filtered = filtered.filter(r => r.current_pic_id === currentPicId);
        }

        if (activeFilter === 'unassigned') {
            filtered = filtered.filter(r => isTicketUnassigned(r.status));
        } else if (activeFilter === 'process') {
            filtered = filtered.filter(r => isTicketInProcess(r.status));
        } else if (activeFilter === 'hold') {
            filtered = filtered.filter(r => isTicketHold(r.status));
        } else if (activeFilter === 'archived') {
            filtered = filtered.filter(r => isTicketFinal(r.status));
        } else if (activeFilter === 'overdue') {
            filtered = filtered.filter(r => slaDictionary[r.id]?.isOverdue);
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
            let valA: any = ''; let valB: any = '';

            if (sortKey === 'ticket') { valA = a.ticket_number; valB = b.ticket_number; }
            else if (sortKey === 'applicant') { valA = a.profiles?.full_name || ''; valB = b.profiles?.full_name || ''; }
            else if (sortKey === 'title') { valA = a.categories?.name || ''; valB = b.categories?.name || ''; }
            else if (sortKey === 'duration') { valA = slaDictionary[a.id]?.durationNum || 0; valB = slaDictionary[b.id]?.durationNum || 0; }
            else if (sortKey === 'status') { valA = a.status; valB = b.status; }

            if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });
    }, [requests, activeFilter, showOnlyMine, currentPicId, searchQuery, urgencyFilter, sortKey, sortDirection, publicHolidays]);

    const handleSortRequest = (key: string) => {
        if (sortKey === key) {
            if (sortDirection === 'asc') setSortDirection('desc');
            else if (sortDirection === 'desc') { setSortKey(null); setSortDirection(null); }
        } else {
            setSortKey(key);
            setSortDirection('asc');
        }
    };

    const paginatedRequests = filteredRequests.slice((page - 1) * pageSize, page * pageSize);
    const totalItems = filteredRequests.length;
    const startItem = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
    const endItem = Math.min(page * pageSize, totalItems);

    return {
        searchQuery, setSearchQuery,
        activeFilter, setActiveFilter,
        urgencyFilter, setUrgencyFilter,
        sortKey, sortDirection, handleSortRequest,
        showOnlyMine, setShowOnlyMine,
        page, setPage, pageSize, slaDictionary,
        paginatedRequests, totalItems, startItem, endItem, filteredRequests,
        totalCount, unassignedCount, processCount, holdCount, archivedCount, overdueCount
    };
}
