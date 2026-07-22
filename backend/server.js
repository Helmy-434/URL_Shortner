require('dotenv').config();
 // Import our DB connection function

const app = require('./app');
const PORT = process.env.PORT || 1000;

;// Middleware to let Express read JSON data sent in a request body



app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});