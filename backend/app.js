const express = require('express');
const app = express();
const model = require('./models/Url');
const connectDB = require('./db');
const cors = require('cors');
const redisClient = require('./cache');

app.use(cors());
app.use(express.json())//middeware to parse JSON request bodies
connectDB();

app.get('/', (req, res) => {
    res.send('Server is running');
});


app.post('/shorten',async (req, res) => {
    const { originalUrl } = req.body;

    async function saveNewUrl(originalUrl) {
        try {
            const shortUrl = Math.random().toString(36).substring(2, 8); // Generate a random short URL
            const newUrl = new model({ originalUrl, shortUrl });
            return await newUrl.save();
        } catch (error) {
            if (error.code === 11000) {
                console.log("Collision detected! Retrying...");
                return await saveNewUrl(originalUrl); // Recursively try again
            }
            throw error;  
        }
    }

    try {
        const test = await model.findOne({ originalUrl });
        if (test) {
            test.clicks += 1; 
            await test.save(); 
            return res.json({ shortUrl: test.shortUrl });
        }
        else{
            const savedUrl = await saveNewUrl(originalUrl);
            return res.json({ shortUrl: savedUrl.shortUrl });
        }
    }catch (error) {
        console.error('Error shortening URL:', error);
        res.status(500).json({ error: 'Failed to shorten URL' });
    }
});

async function code_cache(req, res, next) {
    const { shortUrl } = req.params;
    try {
        const data = await redisClient.get(shortUrl);
        if (data!== null) {
            console.log('Cache hit');
            model.updateOne({ shortUrl }, { $inc: { clicks: 1 } }).exec();
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


app.get('/shorten/:shortUrl', code_cache, async (req, res) => {
    const { shortUrl } = req.params;

    try {
        const urlEntry = await model.findOne({ shortUrl });
        if (urlEntry) {
            urlEntry.clicks += 1; 
            urlEntry.save();
            console.log('Cache miss');
            redisClient.set(shortUrl, urlEntry.originalUrl, { EX: 3600 }); // Cache for 1 hour 
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


app.put('/shorten/:shortUrl', async (req, res) => {
    const { shortUrl } = req.params;
    const { newUrl } = req.body;
    try {
        const test = await model.findOne({ shortUrl });
        if (test) {
            test.originalUrl = newUrl; // Update the original URL
            await test.save(); // Save the updated document
            await redisClient.del(shortUrl);
            await redisClient.del(`${shortUrl}_stats`);
            return res.json({ message: 'URL updated successfully' });
        } else {
            res.status(404).json({ error: 'Short URL not found' });
        }
    }catch (error) {
        console.error('Error updating URL:', error);
        res.status(400).json({ error: 'Bad Request' });
    }
});


app.delete('/shorten/:shortUrl', async (req, res) => {
    const { shortUrl } = req.params;
    try {
        const test = await model.findOne({ shortUrl });
        if (test) {
            await model.deleteOne({ shortUrl }); // Delete the document
            await redisClient.del(shortUrl);
            await redisClient.del(`${shortUrl}_stats`);
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
        const data = await redisClient.get(`${shortUrl}_stats`);
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

app.get('/shorten/:shortUrl/stats', stats_cache,async (req, res) => {
    const { shortUrl } = req.params;

    try {
        const urlEntry = await model.findOne({ shortUrl });
        if (urlEntry) {
            await redisClient.set(`${shortUrl}_stats`, JSON.stringify(urlEntry), { EX: 60 });
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