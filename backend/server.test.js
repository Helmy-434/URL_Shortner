const request = require('supertest');
const app = require('./app'); // Imports your express app
const mongoose = require('mongoose');
const assert = require('node:assert');
const { test, beforeEach, after ,before} = require('node:test');
const { redisClient } = require('./cache');


before(async () => {
    if (mongoose.connection.readyState !== 1) {
        await new Promise((resolve) => mongoose.connection.once('open', resolve));
    }
    if (!redisClient.isReady) {
        await new Promise((resolve) => redisClient.once('ready', resolve));
    }
});

beforeEach(async () => {
    if (redisClient.isOpen) {
        await redisClient.flushDb();
    }
});

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

test('Full URL Lifecycle: Create -> Cache Miss -> Cache Hit -> Update -> Delete', async () => {
    // 1. POST /shorten (Create)
    const createRes = await request(app)
        .post('/shorten')
        .send({ originalUrl: 'https://initial-domain.com' });
    assert.strictEqual(createRes.statusCode, 200);
    const shortUrl = createRes.body.shortUrl;
    assert.ok(shortUrl);

    // 2. GET /shorten/:code (Cache Miss -> Populates Redis)
    const missRes = await request(app).get(`/shorten/${shortUrl}`);
    assert.strictEqual(missRes.statusCode, 200);
    assert.strictEqual(missRes.body.originalUrl, 'https://initial-domain.com');

    // 3. GET /shorten/:code (Cache Hit -> Serves from Redis)
    const hitRes = await request(app).get(`/shorten/${shortUrl}`);
    assert.strictEqual(hitRes.statusCode, 200);
    assert.strictEqual(hitRes.body.originalUrl, 'https://initial-domain.com');

    // 4. PUT /shorten/:code (Update -> Should invalidate Redis cache)
    const updateRes = await request(app)
        .put(`/shorten/${shortUrl}`)
        .send({ newUrl: 'https://updated-domain.com' });
    assert.strictEqual(updateRes.statusCode, 200);

    // 5. GET /shorten/:code (Verifies cache was purged and new URL is returned)
    const verifyUpdateRes = await request(app).get(`/shorten/${shortUrl}`);
    assert.strictEqual(verifyUpdateRes.statusCode, 200);
    assert.strictEqual(verifyUpdateRes.body.originalUrl, 'https://updated-domain.com');

    // 6. DELETE /shorten/:code (Delete -> Removes from Redis & DB)
    const deleteRes = await request(app).delete(`/shorten/${shortUrl}`);
    assert.strictEqual(deleteRes.statusCode, 204);

    // 7. GET /shorten/:code (Verifies link is completely gone)
    const verifyDeleteRes = await request(app).get(`/shorten/${shortUrl}`);
    assert.strictEqual(verifyDeleteRes.statusCode, 404);
});

after(async () => {
    await mongoose.disconnect(); // Close the database connection
    if (redisClient.isOpen) {
        await redisClient.quit();
    }
});