import admin from 'firebase-admin';
import dotenv from 'dotenv';
dotenv.config();

const firebaseConfig = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL
};

const iosFirebaseConfig = {
    projectId: process.env.IOS_FIREBASE_PROJECT_ID,
    privateKey: process.env.IOS_FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    clientEmail: process.env.IOS_FIREBASE_CLIENT_EMAIL
};

const isPlaceholder = !firebaseConfig.projectId || firebaseConfig.projectId === 'your-project-id' || !firebaseConfig.privateKey || firebaseConfig.privateKey.includes('...');
const isIosPlaceholder = !iosFirebaseConfig.projectId || iosFirebaseConfig.projectId === 'your-project-id' || !iosFirebaseConfig.privateKey || iosFirebaseConfig.privateKey.includes('...');

// ⚡ PROPER SINGLE-INSTANCE INITIALIZATION
if (!admin.apps.length) {
    if (isPlaceholder) {
        console.warn('Firebase Admin SDK: Config missing or using placeholders. Skipping initialization. ⚠️');
    } else {
        try {
            admin.initializeApp({
                credential: admin.credential.cert(firebaseConfig)
            });
            console.log('Firebase Admin SDK: Initialized successfully ✅');
        } catch (error) {
            console.error('Firebase Admin SDK initialization error:', error.message);
        }
    }
}

// ⚡ IOS-SPECIFIC INITIALIZATION
const iosApp = admin.apps.find(app => app.name === 'ios');
if (!iosApp && !isIosPlaceholder) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(iosFirebaseConfig)
        }, 'ios');
        console.log('Firebase Admin SDK (iOS): Initialized successfully ✅');
    } catch (error) {
        console.error('Firebase Admin SDK (iOS) initialization error ❌:', error.message);
    }
}

export default admin;
