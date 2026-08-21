# 🔗 URL Shortener API

A Node.js & Express REST API for shortening URLs, with MongoDB persistence, Redis-backed caching and rate limiting, and JWT authentication with per-user ownership control.

---

## 🚀 Features

* **URL Shortening & Lookup:** Convert long URLs into short 6-character codes and resolve them back.
* **Database Persistence:** Stores users and URL mappings in MongoDB (Atlas or self-hosted) via Mongoose.
* **Caching:** Redis-backed caching for both URL lookups and stats, cutting repeat database reads.
* **Rate Limiting:** Redis-backed rate limiting on URL creation to prevent abuse.
* **JWT Authentication:** Access + refresh token flow protects URL creation, editing, deletion, and stats.
* **Ownership Control:** Users can only edit, delete, or view stats for links they created (or as an admin).
* **Containerized:** Ready for deployment via Docker / Docker Compose.
* **Health Check:** `/health` endpoint for uptime monitoring.

---

## 🛠️ Tech Stack

* **Runtime:** Node.js
* **Framework:** Express
* **Database:** MongoDB (Mongoose ODM)
* **Cache & Rate Limiting:** Redis (tested against Upstash)
* **Auth:** JSON Web Tokens (`jsonwebtoken`), password hashing via `bcryptjs`
* **Validation:** Joi
* **Containerization:** Docker

---

## 📂 Project Structure

```text
.
├── .github/
│   └── workflows/
│       └── tests.yml
├── backend/
│   ├── DB/
│   │   ├── cache.js
│   │   └── mongoose.js
│   ├── models/
│   │   ├── Url.js
│   │   └── User.js
│   ├── .dockerignore
│   ├── .env
│   ├── app.js
│   ├── auth.js
│   ├── validator.js
│   ├── Dockerfile
│   ├── Docker-compose.yaml
│   ├── package-lock.json
│   ├── package.json
│   ├── server.js
│   └── server.test.js
└── frontend/
```

---

## ⚙️ Environment Variables

Create a `.env` file inside the `backend` directory with the following keys:

| Variable | Description |
|---|---|
| `PORT` | Server port (default: `8080`) |
| `MONGODB_URI` | MongoDB connection string (e.g. an Atlas URI) |
| `ACCESS_TOKEN_SECRET` | Secret used to sign short-lived (15 min) access tokens |
| `REFRESH_TOKEN_SECRET` | Secret used to sign long-lived (7 day) refresh tokens |
| `REDIS_URL` | Redis connection string (e.g. an Upstash Redis URL) |

> **Note:** `.env` is only required for running with plain Node.js or if you point `docker run` at your own Atlas/Upstash instances. `docker compose up` does **not** need a `.env` file.

---

## 💻 Local Setup


### 1. Run with Docker Compose (intended method)
 
Spins up the API alongside its own local MongoDB and Redis containers — no `.env` file or external services required.
 
```bash
docker compose -f backend/Docker-compose.yaml up
```
 
The API will be available at `http://localhost:8080`.


### 2. Run with Node.js

```bash
# Navigate to backend
cd backend

# Install dependencies
npm install

# Start the server
node server.js
```


### 3. Run with Docker

```bash
# Build the image from the backend directory
docker build -t url-shortener ./backend

# Run the container
docker run -p 8080:8080 --env-file ./backend/.env url-shortener
```

---

## 📌 API Endpoints

All request/response bodies are JSON. Routes marked 🔒 require an `Authorization: Bearer <accessToken>` header. Routes marked 🔒🔑 additionally require that the caller **own** the short URL (or hold the `admin` role).

### Health

| Method | Path | Description |
|---|---|---|
| GET | `/` | Basic liveness check — returns plain text. |
| GET | `/health` | Returns `{ status, uptime }`. |

### Auth

| Method | Path | Description |
|---|---|---|
| POST | `/register` | Body: `{ email, password }`. Creates a user, returns `{ user, accessToken, refreshToken }`. |
| POST | `/login` | Body: `{ email, password }`. Returns `{ accessToken, refreshToken }`. |
| POST | `/token` | Body: `{ refreshToken }`. Exchanges a valid refresh token for a new access token. |

### URLs

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/shorten` | 🔒 | Body: `{ originalUrl }`. Returns `{ shortUrl }`. Rate-limited. Returns the existing code if you've already shortened that URL. |
| GET | `/shorten/:shortUrl` | Public | Resolves a short code. Returns `{ originalUrl }`. Cached in Redis for 1 hour. |
| PUT | `/shorten/:shortUrl` | 🔒🔑 | Body: `{ newUrl }`. Updates the destination URL for a code you own. |
| DELETE | `/shorten/:shortUrl` | 🔒🔑 | Deletes a short code you own. Returns `204` on success. |
| GET | `/shorten/:shortUrl/stats` | 🔒🔑 | Returns the full URL document (clicks, timestamps, etc.) for a code you own. Cached in Redis for 60 seconds. |

**Notes:**
- `:shortUrl` must be exactly 6 alphanumeric characters — anything else is rejected with `400` before it reaches the database.
- Access tokens expire after 15 minutes; use `POST /token` with your refresh token to get a new one.
