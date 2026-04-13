import mongoose from 'mongoose';
import { User } from './src/models/user.model.js';
import { Host } from './src/models/Host.js';
import { Booking } from './src/models/booking.model.js';

const uri = 'mongodb+srv://jaisdevansh2004_db_user:V3pU4sMZdEEPwPzT@party.qaycsm4.mongodb.net/?appName=party';

async function exactQuery() {
    await mongoose.connect(uri);

    const [userCount, activeHosts, totalHosts, pendingHosts, totalBookings, revenueAgg] = await Promise.all([
        User.countDocuments({ role: 'user' }),
        Host.countDocuments({ role: 'HOST', hostStatus: 'ACTIVE' }),
        Host.countDocuments({ role: 'HOST' }),
        Host.countDocuments({ hostStatus: { $in: ['INVITED', 'KYC_PENDING'] } }),
        Booking.countDocuments({ status: { $in: ['approved', 'active', 'completed'] } }),
        Booking.aggregate([
            { $match: { paymentStatus: 'paid', status: { $ne: 'cancelled' } } },
            { $group: { _id: null, total: { $sum: '$pricePaid' } } }
        ])
    ]);

    console.log({
        users: userCount,
        activeHosts: activeHosts,
        hosts: totalHosts,
        pendingHosts,
        bookings: totalBookings,
        totalRevenue: revenueAgg[0]?.total || 0,
    });

    process.exit(0);
}

exactQuery();
