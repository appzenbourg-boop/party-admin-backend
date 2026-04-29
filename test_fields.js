import mongoose from 'mongoose';

const uri = 'mongodb+srv://jaisdevansh2004_db_user:V3pU4sMZdEEPwPzT@party.qaycsm4.mongodb.net/?appName=party';

async function test() {
    await mongoose.connect(uri);
    
    // Check Bookings
    const bookingsCount = await mongoose.connection.db.collection('bookings').countDocuments();
    console.log("Total bookings:", bookingsCount);

    const paidBookingsCount = await mongoose.connection.db.collection('bookings').countDocuments({ paymentStatus: 'paid' });
    console.log("Paid bookings:", paidBookingsCount);

    // Let's find one booking that is paid to see what fields it has
    const samplePaidBooking = await mongoose.connection.db.collection('bookings').findOne({ paymentStatus: 'paid' });
    console.log("Sample paid booking:", JSON.stringify(samplePaidBooking, null, 2));

    // Let's see the aggregation
    if (samplePaidBooking) {
        const hostId = samplePaidBooking.hostId;
        console.log("Host ID from sample:", hostId, typeof hostId);
        
        const bookingStatsObj = await mongoose.connection.db.collection('bookings').aggregate([
            { $match: { hostId: hostId, paymentStatus: 'paid', eventId: { $ne: null } } },
            { $group: { _id: "$eventId", total: { $sum: 1 }, revenue: { $sum: "$pricePaid" } } }
        ]).toArray();
        console.log("bookingStatsObj:", JSON.stringify(bookingStatsObj, null, 2));
    }
    
    process.exit(0);
}

test().catch(console.error);
