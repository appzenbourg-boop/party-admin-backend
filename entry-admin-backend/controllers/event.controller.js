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
import { uploadToCloudinary } from '../config/cloudinary.config.js';

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
        console.log('═══════════════════════════════════════════════════════════');
        console.log('🎉 [HOST ACTION] CREATE EVENT');
        console.log('Host ID:', req.user.id);
        console.log('Host Role:', req.user.role);
        console.log('Event Title:', req.body.title);
        console.log('Event Date:', req.body.date);
        console.log('Event Status:', req.body.status || 'DRAFT');
        console.log('Location Visibility:', req.body.locationVisibility || 'public');
        console.log('Booking Open Date:', req.body.bookingOpenDate);
        console.log('═══════════════════════════════════════════════════════════');

        const { 
            title, description, date, endDate, startTime, endTime, coverImage, images, 
            houseRules, attendeeCount, floorCount, tickets, status,
            locationVisibility, revealTime, allowNonTicketView, locationData,
            bookingOpenDate
        } = req.body;

        const uploadTask = async (data, folder) => {
            if (data && data.startsWith('data:')) {
                return await uploadToCloudinary(data, folder);
            }
            return data;
        };

        const finalCoverImage = await uploadTask(coverImage, 'event-covers');
        const finalImages = await Promise.all((images || []).map(img => uploadTask(img, 'event-gallery')));

        const event = new Event({
            hostId: req.user.id,
            hostModel: req.user.role?.toUpperCase() === 'HOST' ? 'Host' : 'User',
            title,
            description,
            date: new Date(date),
            endDate: endDate ? new Date(endDate) : undefined,
            startTime,
            endTime,
            coverImage: finalCoverImage,
            images: finalImages,
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
        
        console.log('✅ [HOST ACTION] Event created successfully!');
        console.log('Event ID:', event._id);
        console.log('Event Status:', event.status);
        console.log('═══════════════════════════════════════════════════════════');

        // If directly published, notify & bust cache
        if (status === 'LIVE') {
            const { sendNotification } = await import('../services/notification.service.js');
            await sendNotification(req.user.id, {
                title: 'Event Published! 🎉',
                message: `Your event "${title}" is now live and accepting bookings.`,
                type: 'SYSTEM'
            });
            // Clear main public feed cache so it shows instantly
            cacheService.delete('events:list:1:20').catch(() => {});
        }

        return res.status(201).json({
            success: true,
            eventId: event._id,
            message: "Experience Launched Successfully!"
        });
    } catch (error) {
        console.error('❌ [HOST ACTION] CREATE EVENT FAILED:', error);
        console.log('═══════════════════════════════════════════════════════════');
        next(error);
    }
};

export const updateEvent = async (req, res, next) => {
    try {
        const { eventId } = req.params;
        
        console.log('═══════════════════════════════════════════════════════════');
        console.log('✏️ [HOST ACTION] UPDATE EVENT');
        console.log('Host ID:', req.user.id);
        console.log('Event ID:', eventId);
        console.log('Update Fields:', Object.keys(req.body));
        console.log('═══════════════════════════════════════════════════════════');
        
        const uploadTask = async (data, folder) => {
            if (data && data.startsWith('data:')) {
                return await uploadToCloudinary(data, folder);
            }
            return data;
        };

        const updateData = { ...req.body };
        if (updateData.coverImage) {
            updateData.coverImage = await uploadTask(updateData.coverImage, 'event-covers');
        }
        if (updateData.images && Array.isArray(updateData.images)) {
            updateData.images = await Promise.all(updateData.images.map(img => uploadTask(img, 'event-gallery')));
        }

        const updated = await Event.findByIdAndUpdate(eventId, updateData, { new: true });
        
        console.log('✅ [HOST ACTION] Event updated successfully!');
        console.log('Event ID:', updated._id);
        console.log('Event Title:', updated.title);
        console.log('Event Status:', updated.status);
        console.log('═══════════════════════════════════════════════════════════');
        
        return res.status(200).json({ success: true, eventId: updated._id });
    } catch (error) {
        console.error('❌ [HOST ACTION] UPDATE EVENT FAILED:', error);
        console.log('═══════════════════════════════════════════════════════════');
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

        console.log('═══════════════════════════════════════════════════════════');
        console.log('🔄 [HOST ACTION] UPDATE EVENT STATUS');
        console.log('Host ID:', req.user.id);
        console.log('Event ID:', eventId);
        console.log('New Status:', status);
        console.log('═══════════════════════════════════════════════════════════');

        // Whitelist allowed statuses
        const VALID = ['LIVE', 'PAUSED', 'DRAFT', 'ENDED'];
        if (!VALID.includes(status)) {
            console.log('❌ Invalid status provided:', status);
            console.log('═══════════════════════════════════════════════════════════');
            return res.status(400).json({ success: false, message: `Invalid status. Allowed: ${VALID.join(', ')}` });
        }
        if (!mongoose.Types.ObjectId.isValid(eventId)) {
            console.log('❌ Invalid event ID:', eventId);
            console.log('═══════════════════════════════════════════════════════════');
            return res.status(400).json({ success: false, message: 'Invalid event ID' });
        }

        const updated = await Event.findOneAndUpdate(
            { _id: eventId, hostId: req.user.id }, // ownership check
            { status },
            { new: true, select: '_id title status date' }
        );

        if (!updated) {
            console.log('❌ Event not found or unauthorized');
            console.log('═══════════════════════════════════════════════════════════');
            return res.status(404).json({ success: false, message: 'Event not found or unauthorised' });
        }

        console.log('✅ [HOST ACTION] Event status updated successfully!');
        console.log('Event Title:', updated.title);
        console.log('Event Date:', updated.date);
        console.log('New Status:', updated.status);
        console.log('═══════════════════════════════════════════════════════════');

        // ⚡ Bust host events cache so changes show immediately on Manage Events screen
        cacheService.delete(`host_events_${req.user.id}`).catch(() => {});
        cacheService.delete(`dashboard_stats_${req.user.id}`).catch(() => {});
        // Bust main public feed cache if status goes live
        if (status === 'LIVE') {
            cacheService.delete('events:list:1:20').catch(() => {});
        }

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
        console.error('❌ [HOST ACTION] UPDATE EVENT STATUS FAILED:', error);
        console.log('═══════════════════════════════════════════════════════════');
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
        if (cached) {
            console.log(`📦 [HostEvents] Serving from cache: ${CACHE_KEY}`);
            return res.status(200).json({ success: true, events: cached });
        }

        console.log('═══════════════════════════════════════════════════════════');
        console.log('📡 [HOST EVENTS DEBUG] Fetching events for host:', hostId);
        console.log('═══════════════════════════════════════════════════════════');
        
        // Get all events for this host with full details
        const events = await Event.find({ hostId })
            .select('title date endDate startTime endTime coverImage status attendeeCount tickets locationVisibility isLocationRevealed displayPrice revealTime bookingOpenDate')
            .sort({ date: -1 })
            .lean();

        // Early exit — no events, skip aggregation
        if (!events.length) {
            console.log('⚠️ [HOST EVENTS DEBUG] No events found for this host');
            console.log('═══════════════════════════════════════════════════════════');
            cacheService.set(CACHE_KEY, [], 60).catch(() => {});
            return res.status(200).json({ success: true, events: [] });
        }

        console.log(`📊 [HOST EVENTS DEBUG] Total events found: ${events.length}`);
        console.log('');
        console.log('📋 [HOST EVENTS DEBUG] Event Details:');
        console.log('─────────────────────────────────────────────────────────────');
        
        // Log each event with detailed info
        events.forEach((event, index) => {
            console.log(`Event ${index + 1}:`);
            console.log(`  ID: ${event._id}`);
            console.log(`  Title: ${event.title}`);
            console.log(`  Status: ${event.status}`);
            console.log(`  Date: ${event.date}`);
            console.log(`  Start Time: ${event.startTime || 'N/A'}`);
            console.log(`  End Time: ${event.endTime || 'N/A'}`);
            console.log(`  Attendee Count: ${event.attendeeCount || 0}`);
            console.log(`  Tickets: ${event.tickets ? event.tickets.length : 0} types`);
            console.log('─────────────────────────────────────────────────────────────');
        });
        
        // Count by status
        const statusCounts = events.reduce((acc, e) => {
            acc[e.status] = (acc[e.status] || 0) + 1;
            return acc;
        }, {});
        
        console.log('');
        console.log('📈 [HOST EVENTS DEBUG] Status Breakdown:');
        Object.entries(statusCounts).forEach(([status, count]) => {
            console.log(`  ${status}: ${count}`);
        });
        console.log('═══════════════════════════════════════════════════════════');

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


