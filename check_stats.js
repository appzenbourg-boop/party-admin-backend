import mongoose from 'mongoose';

const uri = 'mongodb+srv://jaisdevansh2004_db_user:V3pU4sMZdEEPwPzT@party.qaycsm4.mongodb.net/?appName=party';

async function checkStats() {
    await mongoose.connect(uri);
    const db = mongoose.connection.db;

    const userCount = await db.collection('users').countDocuments({ role: 'user' });
    const hosts = await db.collection('users').countDocuments({ role: 'HOST' }); // "Host.countDocuments({ role: 'HOST' })" -> wait, Host is a different model!
    const realHosts = await db.collection('hosts').countDocuments({});
    
    console.log({ userCount, hosts, realHosts });
    process.exit(0);
}

checkStats();
