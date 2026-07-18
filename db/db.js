const mongoose = require('mongoose');

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