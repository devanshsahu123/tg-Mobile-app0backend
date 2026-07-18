const mongoose = require('mongoose');
const dns = require('dns');

// Force DNS resolution using public DNS to fix Bun's SRV DNS resolution issue
try {
  dns.setServers(['1.1.1.1', '8.8.8.8']);
} catch (e) {
  console.warn("Could not set DNS servers:", e);
}

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const dbUrl = process.env.DB_URL;

const connectDB = async () => {
  if (!dbUrl) {
    console.error("CRITICAL ERROR: process.env.DB_URL is undefined. Make sure the .env file exists at the root directory and contains DB_URL.");
    return;
  }
  try {
    await mongoose.connect(dbUrl);
    console.log('Connected to MongoDB!!!!!');
  } catch (error) {
    console.error('MongoDB connection error:', error);
  }
};

module.exports = connectDB;