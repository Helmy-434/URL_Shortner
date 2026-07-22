const request = require('supertest');
const app = require('./app'); // Imports your express app
const mongoose = require('mongoose');
const test = require('node:test');
const assert = require('node:assert');
const { after } = require('node:test');


test('GET / should return 200 or 404 cleanly', async () => {
    const response = await request(app).get('/shorten/test-code');
    // Just checks that the server responds without crashing
    assert.ok(response.statusCode === 200 || response.statusCode === 404);
});

test('GET /shorten/:code returns 404 for a non-existent code', async () => {
    const response = await request(app).get('/shorten/definitely-not-real-code');
    assert.strictEqual(response.statusCode, 404);
});

test('POST /shorten creates a short URL for a valid link', async () => {
    const response = await request(app)
        .post('/shorten')
        .send({ originalUrl: 'https://example.com' });
    assert.strictEqual(response.statusCode, 200);
    assert.ok(response.body.shortUrl);
});


after(async () => {
    await mongoose.disconnect(); // Close the database connection
});