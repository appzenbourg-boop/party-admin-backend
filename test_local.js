import mongoose from 'mongoose';
import { env } from 'process';

const uri = 'mongodb+srv://jaisdevansh2004_db_user:V3pU4sMZdEEPwPzT@party.qaycsm4.mongodb.net/?appName=party';

async function test() {
    await mongoose.connect(uri);
    
    // Find a host ID that has bookings
    const host = await mongoose.connection.db.collection('users').findOne({ role: 'host' });
    if (!host) {
        console.log("No host found");
        process.exit(0);
    }
    const hostId = host._id;
    console.log("Using Host ID:", hostId, typeof hostId);

    const bookingStats = await mongoose.connection.db.collection('bookings').aggregate([
        { $match: { hostId: hostId, paymentStatus: 'paid', eventId: { $ne: null } } },
        { $group: { _id: "$eventId", total_tickets_sold: { $sum: 1 }, ticket_revenue: { $sum: "$pricePaid" } } }
    ]).toArray();
    console.log("bookingStats:", bookingStats);

    const orderStats = await mongoose.connection.db.collection('foodorders').aggregate([
        { $match: { hostId: hostId, paymentStatus: 'paid', eventId: { $ne: null } } },
        { $group: { _id: "$eventId", total_orders: { $sum: 1 }, order_revenue: { $sum: "$totalAmount" } } }
    ]).toArray();
    console.log("orderStats:", orderStats);

    const eventIds = [...new Set([
        ...bookingStats.map(b => b._id.toString()),
        ...orderStats.map(o => o._id.toString())
    ])];
    console.log("eventIds:", eventIds);

    const events = await mongoose.connection.db.collection('events').find({ _id: { $in: eventIds.map(id => new mongoose.Types.ObjectId(id)) } }).toArray();
    console.log("events found:", events.length);
    
    process.exit(0);
}

test().catch(console.error);
