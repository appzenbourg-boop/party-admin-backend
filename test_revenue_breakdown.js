import mongoose from 'mongoose';

const uri = 'mongodb+srv://jaisdevansh2004_db_user:V3pU4sMZdEEPwPzT@party.qaycsm4.mongodb.net/?appName=party';

async function test() {
    await mongoose.connect(uri);
    
    // Find a host ID
    const host = await mongoose.connection.db.collection('users').findOne({ role: 'host' });
    if (!host) {
        console.log("No host found");
        process.exit(0);
    }
    const hostId = host._id;
    console.log("Using Host ID:", hostId);

    const bookingStatsStr = await mongoose.connection.db.collection('bookings').aggregate([
        { $match: { hostId: hostId.toString(), paymentStatus: 'paid', eventId: { $ne: null } } },
        { $group: { _id: "$eventId", total: { $sum: 1 } } }
    ]).toArray();

    const bookingStatsObj = await mongoose.connection.db.collection('bookings').aggregate([
        { $match: { hostId: hostId, paymentStatus: 'paid', eventId: { $ne: null } } },
        { $group: { _id: "$eventId", total: { $sum: 1 } } }
    ]).toArray();

    console.log({
        stringMatch: bookingStatsStr,
        objectIdMatch: bookingStatsObj
    });
    
    process.exit(0);
}

test().catch(console.error);
