# 🔗 URL Shortener API

A fast, containerized Node.js & Express REST API for shortening URLs, featuring MongoDB persistence, Redis-backed rate limiting, and JWT authentication.

---

## 🚀 Features

* **URL Shortening & Redirection:** Convert long URLs into compact keys with rapid HTTP redirects.
* **Database Persistence:** Stores URL mappings securely using MongoDB Atlas.
* **Rate Limiting & Caching:** Leverages Upstash Redis to prevent abuse and accelerate lookup times.
* **JWT Authentication:** Protects sensitive routes and user-specific URL history.
* **Containerized:** Ready for instant deployment using Docker.
* **Health Monitoring:** Built-in `/health` endpoint for uptime and system checks.

---

## 🛠️ Tech Stack

* **Runtime:** Node.js
* **Framework:** Express.js
* **Database:** MongoDB (Mongoose ODM)
* **Caching & Rate Limiting:** Upstash (Redis)
* **Containerization:** Docker

---

## 📂 Project Structure

```text
.
├── backend/
│   ├── src/            # Source code (routes, controllers, models)
│   ├── Dockerfile      # Container build definition
│   └── package.json    # Dependencies & scripts
└── README.md
