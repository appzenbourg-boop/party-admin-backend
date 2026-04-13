import mongoose from 'mongoose';

const uri = 'mongodb+srv://jaisdevansh2004_db_user:V3pU4sMZdEEPwPzT@party.qaycsm4.mongodb.net/?appName=party';

async function test() {
    await mongoose.connect(uri);
    
    // Check directly using Mongoose connection
    const db = mongoose.connection.db;
    
    // Check Bookings
    const bookingsCount = await db.collection('bookings').countDocuments();
    const paidBookingsCount = await db.collection('bookings').countDocuments({ paymentStatus: 'paid' });
    
    const agg = await db.collection('bookings').aggregate([
        { $match: { paymentStatus: 'paid', status: { $ne: 'cancelled' } } },
        { $group: { _id: null, total: { $sum: '$pricePaid' } } }
    ]).toArray();
    
    console.log({
        totalBookings: bookingsCount,
        paidBookings: paidBookingsCount,
        revenueAgg: agg
    });
    
    process.exit(0);
}

test().catch(console.error);
