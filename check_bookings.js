import mongoose from 'mongoose';

const uri = 'mongodb+srv://jaisdevansh2004_db_user:V3pU4sMZdEEPwPzT@party.qaycsm4.mongodb.net/?appName=party';

async function checkBookings() {
    await mongoose.connect(uri);
    const db = mongoose.connection.db;

    const allBookings = await db.collection('bookings').find({}).toArray();
    console.log("All Bookings:", JSON.stringify(allBookings, null, 2));

    process.exit(0);
}

checkBookings();
