const express = require('express');
const app = express();
const model = require('./models/Url');


app.get('/', (req, res) => {
    res.send('Server is running');
});


app.post('/shorten',async (req, res) => {
    const { originalUrl } = req.body;

    async function saveNewUrl(originalUrl) {
        try {
            const shortUrl = Math.random().toString(36).substring(2, 8); // Generate a random short URL
            const newUrl = new model({ originalUrl, shortUrl });
            return await newUrl.save(); // Save the new document
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
            test.clicks += 1; // Increment the click count
            await test.save(); // Save the updated document
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


app.get('/shorten/:shortUrl', async (req, res) => {
    const { shortUrl } = req.params;

    try {
        const urlEntry = await model.findOne({ shortUrl });
        if (urlEntry) {
            urlEntry.clicks += 1; // Increment the click count
            await urlEntry.save(); // Save the updated document
            return res.json(urlEntry.originalUrl);            
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
            return res.status(204).json();
        } else {
            res.status(404).json({ error: 'Short URL not found' });
        }
    }catch (error) {
        console.error('Error deleting URL:', error);
        res.status(500).json({ error: 'Failed to delete URL' });
    }
});


app.get('/shorten/:shortUrl/stats', async (req, res) => {
    const { shortUrl } = req.params;

    try {
        const urlEntry = await model.findOne({ shortUrl });
        if (urlEntry) {
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