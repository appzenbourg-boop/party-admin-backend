import mongoose from 'mongoose';

const uri = 'mongodb+srv://jaisdevansh2004_db_user:V3pU4sMZdEEPwPzT@party.qaycsm4.mongodb.net/?appName=party';

async function debug() {
    await mongoose.connect(uri);
    const db = mongoose.connection.db;

    // 1. Find all hosts
    const hosts = await db.collection('hosts').find({}).project({ _id: 1, name: 1 }).toArray();
    console.log('\n=== HOSTS ===');
    console.log(hosts);

    if (hosts.length === 0) { process.exit(0); }
    const hostId = hosts[0]._id;
    console.log('\nUsing hostId:', hostId);

    // 2. Check all bookings for this host
    const bookings = await db.collection('bookings').find({ hostId }).toArray();
    console.log('\n=== BOOKINGS ===');
    bookings.forEach(b => console.log({ _id: b._id, status: b.status, guests: b.guests, pricePaid: b.pricePaid, eventId: b.eventId }));

    // 3. Check all events for this host
    const events = await db.collection('events').find({ hostId }).project({ _id: 1, title: 1, status: 1, attendeeCount: 1, tickets: 1 }).toArray();
    console.log('\n=== EVENTS ===');
    events.forEach(e => {
        console.log({ _id: e._id, title: e.title, status: e.status, attendeeCount: e.attendeeCount, ticketsCount: e.tickets?.length });
        if (e.tickets?.length) {
            e.tickets.forEach(t => console.log('  ticket:', { type: t.type || t.name, capacity: t.capacity, sold: t.sold, price: t.price }));
        }
    });

    // 4. Run the exact aggregation from dashboard
    const bookingStats = await db.collection('bookings').aggregate([
        { $match: { hostId, status: { $nin: ['cancelled', 'rejected'] } } },
        { $group: {
            _id: null,
            totalBookings: { $sum: 1 },
            totalGuests: { $sum: { $ifNull: ['$guests', 1] } },
            revenue: { $sum: '$pricePaid' },
            checkedIn: { $sum: { $cond: [{ $eq: ['$status', 'checked_in'] }, 1, 0] } }
        }}
    ]).toArray();
    console.log('\n=== BOOKING AGGREGATE ===', bookingStats);

    const eventsStats = await db.collection('events').aggregate([
        { $match: { hostId, status: { $nin: ['cancelled', 'ENDED'] } } },
        { $project: { attendeeCount: 1, ticketCapacity: { $sum: '$tickets.capacity' } } },
        { $group: { _id: null, totalCapacity: { $sum: '$ticketCapacity' }, totalAttendeeCount: { $sum: '$attendeeCount' } }}
    ]).toArray();
    console.log('\n=== EVENT CAPACITY AGGREGATE ===', eventsStats);

    const bStats = bookingStats[0] || { totalGuests: 0 };
    const capData = eventsStats[0] || { totalCapacity: 0, totalAttendeeCount: 0 };
    const effective = capData.totalCapacity > 0 ? capData.totalCapacity : capData.totalAttendeeCount;
    const usage = effective > 0 ? Math.round((bStats.totalGuests / effective) * 100) + '%' : '0%';
    console.log('\n=== RESULT ===');
    console.log({ totalGuests: bStats.totalGuests, effectiveCapacity: effective, capacityUsage: usage });

    process.exit(0);
}

debug().catch(e => { console.error(e); process.exit(1); });
