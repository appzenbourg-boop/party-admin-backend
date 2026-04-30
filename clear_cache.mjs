import fetch from 'node-fetch';

const UPSTASH_URL = 'https://moral-impala-88346.upstash.io';
const UPSTASH_TOKEN = 'gQAAAAAAAVkaAAIncDI5NWE4ZjJhZmI2ZmU0MjU5YTI2MDVjMmI0NWNhMjE3MnAyODgzNDY';

async function clearCache() {
    const headers = { Authorization: `Bearer ${UPSTASH_TOKEN}` };

    // Keys to clear
    const keys = [
        'dashboard_stats_69e5d4d3a2fcef7e0eaabe45',
        'host_events_69e5d4d3a2fcef7e0eaabe45',
        'admin_dashboard_stats',
    ];

    for (const key of keys) {
        const res = await fetch(`${UPSTASH_URL}/del/${key}`, { method: 'POST', headers });
        const data = await res.json();
        console.log(`DEL ${key}:`, data);
    }

    console.log('\nCache cleared! Refresh the app now.');
}

clearCache().catch(console.error);
