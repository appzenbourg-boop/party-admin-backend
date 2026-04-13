import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import fetch from 'node-fetch';
import { Admin } from './src/models/admin.model.js';

const uri = 'mongodb+srv://jaisdevansh2004_db_user:V3pU4sMZdEEPwPzT@party.qaycsm4.mongodb.net/?appName=party';

async function testApi() {
    await mongoose.connect(uri);
    
    // Find an admin user
    const adminUser = await Admin.findOne();
    if (!adminUser) {
        console.log("No admin found in DB.");
        process.exit(1);
    }
    
    console.log("Found admin:", adminUser._id);

    const payload = {
        id: adminUser._id.toString(),
        role: adminUser.role || 'ADMIN',
    };
    
    const token = jwt.sign(payload, 'super_secret_user_key_demo', { expiresIn: '1m' });
    
    const res = await fetch('https://entry-admin-backend.onrender.com/admin/stats', {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    const json = await res.json();
    console.log("Render API Response:", JSON.stringify(json, null, 2));
    
    process.exit(0);
}

testApi();
