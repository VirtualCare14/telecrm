const mongoose = require('mongoose');
const https = require('https');

let isConnecting = false;
let retryTimer = null;

/**
 * Fetch current public IP to aid in MongoDB Atlas IP whitelist configuration
 */
function getPublicIP() {
  return new Promise((resolve) => {
    const req = https.get('https://api.ipify.org?format=json', { timeout: 3000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.ip || null);
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
}

const connectDB = async (retryCount = 0) => {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.warn('MONGO_URI not set; skipping DB connection in development.');
    return;
  }

  // Already connected or connecting
  if (mongoose.connection.readyState === 1 || mongoose.connection.readyState === 2) {
    return;
  }

  if (isConnecting) return;
  isConnecting = true;

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log('MongoDB connected successfully');
    isConnecting = false;
  } catch (err) {
    isConnecting = false;
    console.error(`MongoDB connection error: ${err.message}`);

    const isAtlas = uri.includes('mongodb.net');
    if (isAtlas) {
      try {
        const publicIP = await getPublicIP();
        console.warn('\n--- MongoDB Atlas Connection Diagnostics ---');
        if (publicIP) {
          console.warn(`* Your current public IP address is: ${publicIP}`);
        }
        console.warn('* If access is blocked, update your MongoDB Atlas Network Access:');
        console.warn('  1. Open https://cloud.mongodb.com');
        console.warn('  2. In your project, navigate to "Network Access" under Security');
        console.warn(`  3. Click "Add IP Address" -> Add "${publicIP || 'Current IP'}" or "0.0.0.0/0" (allow from anywhere)`);
        console.warn('--------------------------------------------\n');
      } catch (diagErr) {
        // Ignore diagnostic error
      }
    }

    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction) {
      console.error('Fatal database connection error in production. Exiting process.');
      process.exit(1);
    } else {
      const delay = Math.min(5000 * Math.pow(1.5, Math.min(retryCount, 3)), 30000);
      console.log(`[Auto-Retry] Retrying MongoDB connection in ${(delay / 1000).toFixed(1)}s (attempt ${retryCount + 1})...`);
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = setTimeout(() => {
        connectDB(retryCount + 1);
      }, delay);
    }
  }
};

mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB connection lost. Attempting to reconnect...');
  connectDB();
});

mongoose.connection.on('error', (err) => {
  console.error('MongoDB runtime connection error:', err.message);
});

module.exports = connectDB;

