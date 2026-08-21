require('dotenv').config();

const app = require('./app');
const PORT = process.env.PORT || 1000;


app.listen(PORT,'0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});