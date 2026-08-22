const mongoose = require('mongoose');

const connectDB = async () => {
    console.log("Checking MONGODB_URI:");
    try {
        const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://mongo:27017/urlshortener';
        await mongoose.connect(MONGO_URI);
        console.log(' MongoDB connected successfully!');
    } catch (err) {
        console.error(' Connection failed!', err);
        process.exit(1); // Stop the server if DB fails
    }
};

module.exports = connectDB;