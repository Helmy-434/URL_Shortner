const mongoose = require('mongoose'); // Import the tool

const connectDB = async () => {
    console.log("Checking MONGODB_URI:", process.env.MONGODB_URI);
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log(' MongoDB connected successfully!');
    } catch (err) {
        console.error(' Connection failed!', err);
        process.exit(1); // Stop the server if DB fails
    }
};

module.exports = connectDB;