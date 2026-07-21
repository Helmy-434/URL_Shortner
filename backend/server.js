require('dotenv').config();
const connectDB = require('./db'); // Import our DB connection function

const app = require('./app');
const PORT = process.env.PORT || 1000;

const cors = require('cors');
app.use(cors());
app.use(express.json());// Middleware to let Express read JSON data sent in a request body

connectDB();

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});