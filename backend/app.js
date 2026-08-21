const express = require('express');
const app = express();
const URL_model = require('./models/Url');
const USER_model = require('./models/User');
const connectDB = require('./DB/mongoose');
const cors = require('cors');
const redisClient = require('./DB/cache');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');

const limiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 100, 
    message: 'Too many requests from this IP, please try again after 10 minutes',
    store: new RedisStore({
    sendCommand: (...args) => redisClient.sendCommand(args),
  }),
});

const { createAccessToken, createRefreshToken , authToken, authorize} = require('./auth');
const { UserSchema, UrlSchema,validate ,codeSchema,UpdateUrlSchema} = require('./validator');


app.use(cors());
app.use(express.json())//middeware to parse JSON request bodies
connectDB();

app.set('trust proxy', 1); // for https purposes with using render 


app.get('/', (req, res) => {
    res.send('Server is running');
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', uptime: process.uptime() });
});




app.post('/token', async (req, res) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) {
            return res.status(401).json({ error: 'Refresh token not provided' });
        }
        const accessToken = await createAccessToken(refreshToken);
        return res.json({ accessToken });
    }catch (error) {
        console.error('Error creating access token:', error);
        res.status(500).json({ error: 'Failed to create access token' });
    }
});


app.post('/register', validate(UserSchema), async (req, res) => {
    const {email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);

    try {
        const newUser = await USER_model.create({email, password: hashedPassword});
        const refreshToken = await createRefreshToken(newUser);
        const accessToken = await createAccessToken(refreshToken);
        return res.status(201).json({ message: 'User registered successfully', user: newUser ,accessToken, refreshToken});
    }catch(error) {
        if (error.code === 11000) { // Duplicate key error
            return res.status(400).json({ error: 'Username already exists' });
        }
        res.status(400).json({ error: 'Invalid credentials' });
    }
});


app.post('/login',validate(UserSchema), async (req, res) => {
    const { email, password } = req.body;
    try{
        const user = await USER_model.findOne({ email });
        if (!user) {
            return res.status(401).json({ error: 'Invalid email' });
        }
        else{
            const isPasswordValid = await bcrypt.compare(password, user.password);
            if (!isPasswordValid) {
                return res.status(401).json({ error: 'Invalid password' });
            }
            else{
                const refreshToken = await createRefreshToken(user);
                const accessToken = await createAccessToken(refreshToken);
                return res.json({ accessToken, refreshToken });
            }
        }
    }catch (error) {
        return res.status(500).json({ error: 'Internal server error' });
    }
});


app.post('/logout',authToken, async (req, res) => {
    const { refreshToken } = req.body; 

    if (!refreshToken) {
        return res.status(400).json({ error: 'Refresh token required' });
    }

    try {
        await redisClient.del(`refreshToken:${refreshToken}`);
        return res.json({ message: 'Logged out successfully' });
    } catch (error) {
        console.error('Error during logout:', error);
        return res.status(500).json({ error: 'Failed to log out' });
    }
});



async function saveNewUrl(originalUrl,userId) {
    try {
        const shortUrl = Math.random().toString(36).substring(2, 8); // Generate a random short URL
        const newUrl = new URL_model({ originalUrl, shortUrl, userId });
        return await newUrl.save();
    } catch (error) {
        if (error.code === 11000) {
            console.log("Collision detected! Retrying...");
            return await saveNewUrl(originalUrl, userId); // Recursively try again
        }
        throw error;  
    }
}



app.post('/shorten',limiter,authToken,validate(UrlSchema),async (req, res) => {
    const { originalUrl } = req.body;
    const userId = req.user.userId;
    try {
        const existingUrl = await URL_model.findOne({ originalUrl, userId });
        if (existingUrl) {
            return res.json({ shortUrl: existingUrl.shortUrl,message: 'You have already shortened this URL' });
        }
        const savedUrl = await saveNewUrl(originalUrl,userId);
        return res.json({ shortUrl: savedUrl.shortUrl });
    }catch (error) {
        console.error('Error shortening URL:', error);
        res.status(500).json({ error: 'Failed to shorten URL' });
    }
});

async function code_cache(req, res, next) {
    const { shortUrl } = req.params;
    try {
        const data = await redisClient.get(`url:${shortUrl}`);
        if (data!== null) {
            console.log('Cache hit');
            URL_model.updateOne({ shortUrl }, { $inc: { clicks: 1 } }).exec();
            return res.json({ originalUrl: data }); // Return the cached data
        }
        else {
            next();
        }
    }catch (error) {
        console.error('Error retrieving cached data:', error);
        next();
    }
}


app.get('/shorten/:shortUrl',validate(codeSchema,'params'),code_cache, async (req, res) => {
    const { shortUrl } = req.params;

    try {
        const urlEntry = await URL_model.findOne({ shortUrl });
        if (urlEntry) {
            urlEntry.clicks += 1; 
            urlEntry.save().catch(err => console.error('Failed to save click count:', err)); // Bec i skipped await here
            console.log('Cache miss');
            redisClient.set(`url:${shortUrl}`, urlEntry.originalUrl, { EX: 3600 }); // Cache for 1 hour 
            return res.json({ originalUrl: urlEntry.originalUrl });          
        }
        else{
            res.status(404).json({ error: 'Couldn\'t find the original URL' });
        }
    }catch (error) {
        console.error('Error retrieving original URL:', error);
        res.status(500).json({ error: 'Failed to retrieve original URL' });
    }
});


app.put('/shorten/:shortUrl',authToken,validate(codeSchema,'params'),validate(UpdateUrlSchema,'body'), authorize,async (req, res) => {
    const { shortUrl } = req.params;
    const { newUrl } = req.body;
    try {
        const test = await URL_model.findOne({ shortUrl });
        if (test) {
            test.originalUrl = newUrl; // Update the original URL
            await test.save(); // Save the updated document
            await redisClient.del(`url:${shortUrl}`);
            await redisClient.del(`stats:${shortUrl}`);
            return res.json({ message: 'URL updated successfully' });
        } else {
            res.status(404).json({ error: 'Short URL not found' });
        }
    }catch (error) {
        console.error('Error updating URL:', error);
        res.status(400).json({ error: 'Bad Request' });
    }
});


app.delete('/shorten/:shortUrl', authToken,validate(codeSchema,'params'), authorize,async (req, res) => {
    const { shortUrl } = req.params;
    try {
        const url = await URL_model.findOne({ shortUrl });
        if (url) {
            await URL_model.deleteOne({ shortUrl }); // Delete the document
            await redisClient.del(`url:${shortUrl}`);
            await redisClient.del(`stats:${shortUrl}`);
            return res.status(204).send();
        } else {
            res.status(404).json({ error: 'Short URL not found' });
        }
    }catch (error) {
        console.error('Error deleting URL:', error);
        res.status(500).json({ error: 'Failed to delete URL' });
    }
});


async function stats_cache(req, res, next) {
    const { shortUrl } = req.params;
    try{
        const data = await redisClient.get(`stats:${shortUrl}`);
        if (data !== null) {
        console.log('Cache hit');
        return res.json( JSON.parse(data));
    }
    else {
        next();
    }
    }catch (error) {
        console.error('Error retrieving cached stats:', error);
        next();//Fall back to the database
    }
}

app.get('/shorten/:shortUrl/stats', authToken,validate(codeSchema,'params'), authorize,stats_cache,async (req, res) => {
    const { shortUrl } = req.params;

    try {
        const urlEntry = await URL_model.findOne({ shortUrl });
        if (urlEntry) {
            await redisClient.set(`stats:${shortUrl}`, JSON.stringify(urlEntry), { EX: 60 });
            return res.json(urlEntry);            
        }
        else{
            res.status(404).json({ error: 'Couldn\'t find the original URL' });
        }
    }catch (error) {
        console.error('Error retrieving original URL:', error);
        res.status(500).json({ error: 'Failed to retrieve original URL' });
    }
});

module.exports = app;