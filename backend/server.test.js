const request = require('supertest');
const app = require('./app'); // Imports your express app — this also kicks off connectDB() as a side effect
const mongoose = require('mongoose'); // the actual mongoose singleton, so .connection/.disconnect work
const assert = require('node:assert');
const { test, beforeEach, after, before } = require('node:test');
const redisClient = require('./DB/cache');
const USER_model = require('./models/User');
 
// Unique per test run so re-runs (and parallel CI jobs) never collide on
// Mongo's unique email index.
const RUN_ID = Date.now();
const TEST_EMAIL = `test-user-${RUN_ID}@example.com`;
const OTHER_EMAIL = `test-user-other-${RUN_ID}@example.com`;
const TEST_PASSWORD = 'password123';
 
let accessToken;
let refreshToken;
 
before(async () => {
    if (mongoose.connection.readyState !== 1) {
        await new Promise((resolve) => mongoose.connection.once('open', resolve));
    }
    if (!redisClient.isReady) {
        await new Promise((resolve) => redisClient.once('ready', resolve));
    }
 
    // Belt-and-braces cleanup in case a previous run crashed before its
    // own `after` hook ran and left a matching user behind.
    await USER_model.deleteMany({ email: { $in: [TEST_EMAIL, OTHER_EMAIL] } });
 
    // Every protected-route test below needs a logged-in user, so log in
    // once here rather than re-authenticating inside every test.
    const registerRes = await request(app)
        .post('/register')
        .send({ email: TEST_EMAIL, password: TEST_PASSWORD });
 
    if (registerRes.statusCode !== 201) {
        throw new Error(
            `Setup failed: POST /register returned ${registerRes.statusCode} ` +
            `(${JSON.stringify(registerRes.body)}). Auth-protected tests cannot run without a valid user.`
        );
    }
 
    accessToken = registerRes.body.accessToken;
    refreshToken = registerRes.body.refreshToken;
});
 

 
// ---------- Auth ----------
 
test('POST /register returns a usable access token and refresh token', async () => {
    // Registration itself already happened in `before`; this test just
    // asserts the shape of what it returned.
    assert.ok(accessToken, 'expected an accessToken from registration');
    assert.ok(refreshToken, 'expected a refreshToken from registration');
});
 
test('POST /register rejects a duplicate email', async () => {
    const response = await request(app)
        .post('/register')
        .send({ email: TEST_EMAIL, password: TEST_PASSWORD });
    assert.strictEqual(response.statusCode, 400);
});
 
test('POST /register rejects a password under 6 characters', async () => {
    const response = await request(app)
        .post('/register')
        .send({ email: `short-pw-${RUN_ID}@example.com`, password: '123' });
    assert.strictEqual(response.statusCode, 400);
});
 
test('POST /login rejects an incorrect password', async () => {
    const response = await request(app)
        .post('/login')
        .send({ email: TEST_EMAIL, password: 'wrong-password' });
    assert.strictEqual(response.statusCode, 401);
});
 
test('POST /login succeeds with correct credentials', async () => {
    const response = await request(app)
        .post('/login')
        .send({ email: TEST_EMAIL, password: TEST_PASSWORD });
    assert.strictEqual(response.statusCode, 200);
    assert.ok(response.body.accessToken);
    assert.ok(response.body.refreshToken);
});
 
test('POST /token exchanges a valid refresh token for a new access token', async () => {
    const response = await request(app)
        .post('/token')
        .send({ refreshToken });
    assert.strictEqual(response.statusCode, 200);
    assert.ok(response.body.accessToken);
    accessToken = response.body.accessToken; // keep the freshest token for later tests
});
 
test('POST /token rejects a missing refresh token', async () => {
    const response = await request(app).post('/token').send({});
    assert.strictEqual(response.statusCode, 401);
});
 
test('POST /token rejects a bogus refresh token', async () => {
    const response = await request(app)
        .post('/token')
        .send({ refreshToken: 'not-a-real-token' });
    assert.strictEqual(response.statusCode, 500);
});
 
// ---------- /shorten access control ----------
 
test('POST /shorten rejects requests with no token', async () => {
    const response = await request(app)
        .post('/shorten')
        .send({ originalUrl: 'https://example.com' });
    assert.strictEqual(response.statusCode, 401);
});
 
test('GET /shorten/:code returns 404 for a non-existent code (public route)', async () => {
    const response = await request(app).get('/shorten/zzzzzz');
    assert.strictEqual(response.statusCode, 404);
});
 
test('GET /shorten/:code rejects a malformed code before hitting the database', async () => {
    const response = await request(app).get('/shorten/not-six-chars-or-alphanumeric');
    assert.strictEqual(response.statusCode, 400);
});
 
test('POST /shorten creates a short URL for an authenticated user', async () => {
    const response = await request(app)
        .post('/shorten')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ originalUrl: 'https://example.com' });
    assert.strictEqual(response.statusCode, 200);
    assert.ok(response.body.shortUrl);
});
 
test('POST /shorten returns the existing code if the same user re-shortens the same URL', async () => {
    const first = await request(app)
        .post('/shorten')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ originalUrl: 'https://repeat-me.com' });
    const second = await request(app)
        .post('/shorten')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ originalUrl: 'https://repeat-me.com' });
    assert.strictEqual(second.statusCode, 200);
    assert.strictEqual(second.body.shortUrl, first.body.shortUrl);
});
 
// ---------- Full lifecycle ----------
 
test('Full URL Lifecycle: Create -> Cache Miss -> Cache Hit -> Update -> Delete', async () => {
    // 1. POST /shorten (Create, requires auth)
    const createRes = await request(app)
        .post('/shorten')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ originalUrl: 'https://initial-domain.com' });
    assert.strictEqual(createRes.statusCode, 200);
    const shortUrl = createRes.body.shortUrl;
    assert.ok(shortUrl);
 
    // 2. GET /shorten/:code (Cache Miss -> Populates Redis) — public route, no token needed
    const missRes = await request(app).get(`/shorten/${shortUrl}`);
    assert.strictEqual(missRes.statusCode, 302); // Because the route now redirects to the original URL
    assert.strictEqual(missRes.body.originalUrl, 'https://initial-domain.com');
 
    // 3. GET /shorten/:code (Cache Hit -> Serves from Redis)
    const hitRes = await request(app).get(`/shorten/${shortUrl}`);
    assert.strictEqual(hitRes.statusCode, 200);
    assert.strictEqual(hitRes.body.originalUrl, 'https://initial-domain.com');
 
    // 4. PUT /shorten/:code (Update, requires auth + ownership -> invalidates Redis cache)
    const updateRes = await request(app)
        .put(`/shorten/${shortUrl}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ newUrl: 'https://updated-domain.com' });
    assert.strictEqual(updateRes.statusCode, 200);
 
    // 5. GET /shorten/:code (Verifies cache was purged and new URL is returned)
    const verifyUpdateRes = await request(app).get(`/shorten/${shortUrl}`);
    assert.strictEqual(verifyUpdateRes.statusCode, 302); // Because the route now redirects to the original URL
    assert.strictEqual(verifyUpdateRes.body.originalUrl, 'https://updated-domain.com');
 
    // 6. DELETE /shorten/:code (Delete, requires auth + ownership -> removes from Redis & DB)
    const deleteRes = await request(app)
        .delete(`/shorten/${shortUrl}`)
        .set('Authorization', `Bearer ${accessToken}`);
    assert.strictEqual(deleteRes.statusCode, 204);
 
    // 7. GET /shorten/:code (Verifies link is completely gone)
    const verifyDeleteRes = await request(app).get(`/shorten/${shortUrl}`);
    assert.strictEqual(verifyDeleteRes.statusCode, 404);
});
 
test('PUT and DELETE /shorten/:code reject requests with no token', async () => {
    const createRes = await request(app)
        .post('/shorten')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ originalUrl: 'https://needs-a-token.com' });
    const shortUrl = createRes.body.shortUrl;
 
    const putRes = await request(app)
        .put(`/shorten/${shortUrl}`)
        .send({ newUrl: 'https://hijacked.com' });
    assert.strictEqual(putRes.statusCode, 401);
 
    const deleteRes = await request(app).delete(`/shorten/${shortUrl}`);
    assert.strictEqual(deleteRes.statusCode, 401);
});
 
// ---------- Ownership checks (the `authorize` middleware) ----------
 
test('stats, update, and delete are blocked for a user who does not own the link', async () => {
    // Register a second, unrelated user
    const otherRegisterRes = await request(app)
        .post('/register')
        .send({ email: OTHER_EMAIL, password: TEST_PASSWORD });
    assert.strictEqual(otherRegisterRes.statusCode, 201);
    const otherToken = otherRegisterRes.body.accessToken;
 
    // First user creates a link
    const createRes = await request(app)
        .post('/shorten')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ originalUrl: 'https://owned-by-first-user.com' });
    const shortUrl = createRes.body.shortUrl;
 
    // Second user should be denied on all owner-only routes
    const statsRes = await request(app)
        .get(`/shorten/${shortUrl}/stats`)
        .set('Authorization', `Bearer ${otherToken}`);
    assert.strictEqual(statsRes.statusCode, 403);
 
    const putRes = await request(app)
        .put(`/shorten/${shortUrl}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ newUrl: 'https://stolen.com' });
    assert.strictEqual(putRes.statusCode, 403);
 
    const deleteRes = await request(app)
        .delete(`/shorten/${shortUrl}`)
        .set('Authorization', `Bearer ${otherToken}`);
    assert.strictEqual(deleteRes.statusCode, 403);
 
    // The owner, meanwhile, can see their own stats fine
    const ownerStatsRes = await request(app)
        .get(`/shorten/${shortUrl}/stats`)
        .set('Authorization', `Bearer ${accessToken}`);
    assert.strictEqual(ownerStatsRes.statusCode, 200);
    assert.strictEqual(ownerStatsRes.body.originalUrl, 'https://owned-by-first-user.com');
});
 
after(async () => {
    await USER_model.deleteMany({ email: { $in: [TEST_EMAIL, OTHER_EMAIL] } });
    await mongoose.disconnect(); // Close the database connection
    if (redisClient.isOpen) {
        await redisClient.quit();
    }
});