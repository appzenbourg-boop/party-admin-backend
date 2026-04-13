import mongoose from 'mongoose';

const uri = 'mongodb+srv://jaisdevansh2004_db_user:V3pU4sMZdEEPwPzT@party.qaycsm4.mongodb.net/?appName=party';

async function getUsers() {
    await mongoose.connect(uri);
    const db = mongoose.connection.db;

    const admins = await db.collection('admins').find({}).toArray();
    console.log("Admins:", JSON.stringify(admins, null, 2));
    
    const usersAdmin = await db.collection('users').find({ role: { $in: ['ADMIN', 'SUPERADMIN', 'admin'] } }).toArray();
    console.log("Users as Admin:", JSON.stringify(usersAdmin, null, 2));

    process.exit(0);
}

getUsers();
