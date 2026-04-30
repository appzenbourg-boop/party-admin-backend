import { Event } from '../models/Event.js';
import { Booking } from '../models/booking.model.js';
import { cacheService } from '../services/cache.service.js';
import mongoose from 'mongoose';

export const getDashboardSummary = async (req, res, next) => {
    const hostId = req.user.id;

    try {
        const CACHE_KEY = `dashboard_stats_${hostId}`;

        // ⚡ Serve from cache — handle both object and legacy string formats
        const cached = await cacheService.get(CACHE_KEY);
        if (cached) {
            const payload = typeof cached === 'string' ? JSON.parse(cached) : cached;
            return res.status(200).json({ success: true, ...payload });
        }

        const hostObjId = new mongoose.Types.ObjectId(hostId);

        // ⚡ All 3 queries in parallel — no sequential waiting
        const [bookingStats, eventsStats, totalEvents] = await Promise.all([
            // Real booking counts — excludes cancelled/rejected
            Booking.aggregate([
                { $match: { hostId: hostObjId, status: { $nin: ['cancelled', 'rejected'] } } },
                {
                    $group: {
                        _id:          null,
                        totalBookings: { $sum: 1 },
                        totalGuests:  { $sum: { $ifNull: ['$guests', 1] } },
                        revenue:      { $sum: { $ifNull: ['$pricePaid', 0] } },
                        checkedIn:    { $sum: { $cond: [{ $eq: ['$status', 'checked_in'] }, 1, 0] } }
                    }
                }
            ]).allowDiskUse(true),

            // Total ticket capacity — inline array sum, no $unwind needed
            Event.aggregate([
                { $match: { hostId: hostObjId, status: { $nin: ['cancelled', 'ENDED'] } } },
                { $project: {
                    attendeeCount:  1,
                    ticketCapacity: { $sum: '$tickets.capacity' }
                }},
                { $group: {
                    _id: null,
                    totalCapacity:      { $sum: '$ticketCapacity' },
                    totalAttendeeCount: { $sum: '$attendeeCount' }
                }}
            ]).allowDiskUse(true),

            // Count of all non-cancelled events
            Event.countDocuments({ hostId, status: { $ne: 'cancelled' } })
        ]);

        const b = bookingStats[0] ?? { totalBookings: 0, totalGuests: 0, revenue: 0, checkedIn: 0 };
        const c = eventsStats[0]  ?? { totalCapacity: 0, totalAttendeeCount: 0 };

        // Effective capacity: prefer configured ticket capacity, fallback to attendeeCount
        const effectiveCapacity = c.totalCapacity > 0 ? c.totalCapacity : c.totalAttendeeCount;
        const rawPct = effectiveCapacity > 0
            ? Math.round((b.totalGuests / effectiveCapacity) * 100)
            : 0;
        const capacityUsage = Math.min(rawPct, 100) + '%'; // Cap at 100%

        const responsePayload = {
            stats: {
                totalBookings: b.totalBookings,
                totalEvents:   totalEvents ?? 0,
                revenue:       b.revenue,
                checkedIn:     b.checkedIn,
                capacityUsage
            }
        };

        // Fire-and-forget cache write — don't block the response
        cacheService.set(CACHE_KEY, responsePayload, 120).catch(() => {});

        return res.status(200).json({ success: true, ...responsePayload });
    } catch (error) {
        next(error);
    }
};
