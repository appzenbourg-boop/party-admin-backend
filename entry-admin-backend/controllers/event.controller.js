import mongoose from 'mongoose';
import { Event } from '../models/Event.js';
import { Report } from '../models/Report.js';
import { Booking } from '../models/booking.model.js';
import { Venue } from '../models/Venue.js';
import { MenuItem } from '../models/MenuItem.js';
import { Gift } from '../models/Gift.js';
import { Floor } from '../models/Floor.js';
import { cacheService } from '../services/cache.service.js';
import { getIO } from '../socket.js';
import { User } from '../models/user.model.js';
import { Host } from '../models/Host.js';
import { bookEventSchema } from '../validators/user.validator.js';

const checkIsEventExpired = (event) => {
    if (!event || !event.date) return false;
    try {
        const now = new Date();
        const baseDate = event.endDate ? new Date(event.endDate) : new Date(event.date);
        
        if (event.endTime) {
            const match = event.endTime.match(/(\d+):(\d+)\s*(AM|PM)?/i);
            if (match) {
                let hours = parseInt(match[1], 10);
                const minutes = parseInt(match[2], 10);
                const modifier = match[3] ? match[3].toUpperCase() : null;
                
                if (modifier === 'PM' && hours < 12) hours += 12;
                if (modifier === 'AM' && hours === 12) hours = 0;
                
                let endTimestamp = new Date(baseDate);
                endTimestamp.setHours(hours, minutes, 0, 0);
                
                if (hours <= 6 && !event.endDate) {
                    endTimestamp.setDate(endTimestamp.getDate() + 1);
                }
                
                return now > endTimestamp;
            }
        }
        
        const endOfEvent = new Date(baseDate);
        endOfEvent.setDate(endOfEvent.getDate() + 1);
        endOfEvent.setHours(6, 0, 0, 0);
        return now > endOfEvent;
    } catch(e) {
        return false;
    }
};

export const createEvent = async (req, res, next) => {
    try {
        console.log(`[createEvent] Creating new event for host: ${req.user.id}`);

        const { 
            title, description, date, endDate, startTime, endTime, coverImage, images, 
            houseRules, attendeeCount, floorCount, tickets, status,
            locationVisibility, revealTime, allowNonTicketView, locationData,
            bookingOpenDate
        } = req.body;

        const event = new Event({
            hostId: req.user.id,
            hostModel: req.user.role?.toUpperCase() === 'HOST' ? 'Host' : 'User',
            title,
            description,
            date: new Date(date),
            endDate: endDate ? new Date(endDate) : undefined,
            startTime,
            endTime,
            coverImage,
            images,
            houseRules,
            attendeeCount: attendeeCount || 0,
            floorCount: floorCount || 1,
            locationVisibility: locationVisibility || 'public',
            revealTime: locationVisibility === 'delayed' && revealTime ? new Date(revealTime) : undefined,
            isLocationRevealed: locationVisibility === 'public', // Auto-reveal if public
            allowNonTicketView: allowNonTicketView || false,
            locationData,
            tickets,
            status: status || 'DRAFT',
            bookingOpenDate: bookingOpenDate ? new Date(bookingOpenDate) : undefined
        });

        await event.save();
        console.log(`[createEvent] Event created successfully: ${event._id}`);

        // If directly published, notify
        if (status === 'LIVE') {
            const { sendNotification } = await import('../services/notification.service.js');
            await sendNotification(req.user.id, {
                title: 'Event Published! 🎉',
                message: `Your event "${title}" is now live and accepting bookings.`,
                type: 'SYSTEM'
            });
        }

        return res.status(201).json({
            success: true,
            eventId: event._id,
            message: "Experience Launched Successfully!"
        });
    } catch (error) {
        console.error(`[createEvent] Error:`, error);
        next(error);
    }
};

export const updateEvent = async (req, res, next) => {
    try {
        const { eventId } = req.params;
        const updated = await Event.findByIdAndUpdate(eventId, req.body, { new: true });
        return res.status(200).json({ success: true, eventId: updated._id });
    } catch (error) {
        next(error);
    }
};

export const getEventById = async (req, res, next) => {
    try {
        const { eventId } = req.params;
        const item = await Event.findById(eventId).lean();
        if (!item) {
            return res.status(404).json({ success: false, message: 'Event not found' });
        }

        if (item.status === 'LIVE' && checkIsEventExpired(item)) {
            item.status = 'EXPIRED';
            Event.updateOne({ _id: item._id }, { status: 'EXPIRED' }).catch(() => {});
        }

        // Privacy Masking (Synchronized with user controller)
        let canViewLocation = true;
        
        if (item.locationVisibility === 'hidden') {
            if (!item.isLocationRevealed) canViewLocation = false;
        } else if (item.locationVisibility === 'delayed') {
            const revealTime = item.revealTime ? new Date(item.revealTime) : null;
            const now = new Date();
            if (!item.isLocationRevealed && (!revealTime || now < revealTime)) {
                canViewLocation = false;
            }
        }

        if (!canViewLocation) {
            item.locationData = null;
            item.isLocationMasked = true;
        }

        res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
        return res.status(200).json({ success: true, data: item });
    } catch (error) {
        next(error);
    }
};

export const updateEventStatus = async (req, res, next) => {
    try {
        const { eventId } = req.params;
        const { status }  = req.body;

        // Whitelist allowed statuses
        const VALID = ['LIVE', 'PAUSED', 'DRAFT', 'ENDED'];
        if (!VALID.includes(status)) {
            return res.status(400).json({ success: false, message: `Invalid status. Allowed: ${VALID.join(', ')}` });
        }
        if (!mongoose.Types.ObjectId.isValid(eventId)) {
            return res.status(400).json({ success: false, message: 'Invalid event ID' });
        }

        const updated = await Event.findOneAndUpdate(
            { _id: eventId, hostId: req.user.id }, // ownership check
            { status },
            { new: true, select: '_id title status' }
        );

        if (!updated) return res.status(404).json({ success: false, message: 'Event not found or unauthorised' });

        // ⚡ Bust host events cache so changes show immediately on Manage Events screen
        cacheService.delete(`host_events_${req.user.id}`).catch(() => {});
        cacheService.delete(`dashboard_stats_${req.user.id}`).catch(() => {});

        // Notify host on publish (non-blocking)
        if (status === 'LIVE') {
            const { sendNotification } = await import('../services/notification.service.js');
            sendNotification(req.user.id, {
                title:   'Event Published!',
                message: `Your event "${updated.title}" is now live and accepting bookings.`,
                type:    'SYSTEM'
            }).catch(() => {});
        }

        return res.status(200).json({ success: true, status: updated.status });
    } catch (error) {
        next(error);
    }
};

export const deleteEvent = async (req, res, next) => {
    try {
        const { eventId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(eventId)) {
            return res.status(400).json({ success: false, message: 'Invalid event ID' });
        }

        // Ownership check — host can only delete their own events
        const deleted = await Event.findOneAndDelete({ _id: eventId, hostId: req.user.id });
        if (!deleted) {
            return res.status(404).json({ success: false, message: 'Event not found or unauthorised' });
        }

        // Bust caches
        cacheService.delete(`host_events_${req.user.id}`).catch(() => {});
        cacheService.delete(`dashboard_stats_${req.user.id}`).catch(() => {});

        return res.status(200).json({ success: true, message: 'Event cancelled' });
    } catch (error) {
        next(error);
    }
};

export const getEvents = async (req, res, next) => {
    try {
        const hostId = req.user.id;
        const CACHE_KEY = `host_events_${hostId}`;
        
        // ⚡ Cache-first
        const cached = await cacheService.get(CACHE_KEY);
        if (cached) return res.status(200).json({ success: true, events: cached });

        const events = await Event.find({ hostId })
            .select('title date endDate startTime endTime coverImage status attendeeCount tickets locationVisibility isLocationRevealed displayPrice revealTime bookingOpenDate')
            .sort({ date: -1 })
            .lean();

        // Early exit — no events, skip aggregation
        if (!events.length) {
            cacheService.set(CACHE_KEY, [], 60).catch(() => {});
            return res.status(200).json({ success: true, events: [] });
        }

        // Auto-expire check for host view
        events.forEach(e => {
            if (e.status === 'LIVE' && checkIsEventExpired(e)) {
                e.status = 'EXPIRED';
                Event.updateOne({ _id: e._id }, { status: 'EXPIRED' }).catch(() => {});
            }
        });

        // ── Real booking stats from Booking collection ─────────────────────
        // ticket.sold is never auto-updated — we aggregate from actual Booking docs
        const eventIds = events.map(e => e._id);
        const bookingStats = await Booking.aggregate([
            { $match: { eventId: { $in: eventIds }, status: { $nin: ['cancelled', 'rejected'] } } },
            { $group: {
                _id:          '$eventId',
                totalBooked:  { $sum: { $ifNull: ['$guests', 1] } },
                totalRevenue: { $sum: { $ifNull: ['$pricePaid', 0] } }
            }}
        ]).allowDiskUse(true);

        // O(1) lookup map
        const statsMap = Object.fromEntries(
            bookingStats.map(s => [s._id.toString(), { totalBooked: s.totalBooked, totalRevenue: s.totalRevenue }])
        );

        const eventsWithStats = events.map(event => ({
            ...event,
            _bookingStats: statsMap[event._id.toString()] ?? { totalBooked: 0, totalRevenue: 0 }
        }));

        // Fire-and-forget cache — don't block response
        cacheService.set(CACHE_KEY, eventsWithStats, 120).catch(() => {});
        
        return res.status(200).json({ success: true, events: eventsWithStats });
    } catch (error) {
        next(error);
    }
};

export const reportEvent = async (req, res, next) => {
    try {
        const { eventId } = req.params;
        const { reason, details } = req.body;

        const event = await Event.findById(eventId);
        if (!event) return res.status(404).json({ success: false, message: 'Event not found' });

        const existingReport = await Report.findOne({ reportedBy: req.user.id, eventId });
        if (existingReport) {
            return res.status(400).json({ success: false, message: 'You have already reported this event' });
        }

        const report = await Report.create({
            reportedBy: req.user.id,
            eventId,
            reason,
            details
        });

        // Increment event report count and auto-flag/pause if needed
        event.reportCount += 1;
        
        // Auto-pause if more than 5 reports
        if (event.reportCount >= 5 && event.status === 'LIVE') {
            event.status = 'PAUSED';
            // Alert Admin could be added here
        }

        await event.save();
        res.status(201).json({ success: true, message: 'Report submitted successfully' });

    } catch (error) {
        next(error);
    }
};

// [NEW ENDPOINT] Manual Location Reveal Trigger for Host
export const revealEventLocation = async (req, res, next) => {
    try {
        const { eventId } = req.params;
        const event = await Event.findOne({ _id: eventId, hostId: req.user.id });
        
        if (!event) {
            return res.status(404).json({ success: false, message: 'Event not found or unauthorized' });
        }

        if (event.isLocationRevealed) {
            return res.status(400).json({ success: false, message: 'Location is already revealed' });
        }

        event.isLocationRevealed = true;
        await event.save();

        // Broadcast to clients via Socket.io
        import('../socket.js').then(({ getIO }) => {
            const io = getIO();
            if (io) {
                // Anyone viewing the event details page gets real-time override
                io.emit('location_revealed', { eventId: event._id });
            }
        });

        // Trigger push notifications internally via service
        import('../services/notification.service.js').then(async ({ sendNotification }) => {
            // Find all confirmed bookings
            const { Booking } = await import('../models/booking.model.js');
            const bookings = await Booking.find({ 
                eventId: event._id, 
                status: { $in: ['approved', 'active', 'confirmed', 'checked_in'] }
            }).select('userId').lean();
            
            for (const booking of bookings) {
                await sendNotification(
                    booking.userId,
                    'Location Revealed 📍',
                    `The secret location for "${event.title}" is now available. Tap to view.`,
                    'SYSTEM',
                    { type: 'location_reveal', eventId: event._id.toString() }
                );
            }
        });

        res.status(200).json({ success: true, message: 'Location revealed successfully and notifications dispatched' });

    } catch (error) {
        next(error);
    }
};


