# ChatScale — Real-Time Scalable Chat App 🚀

A production-style **real-time chat application** that demonstrates horizontal scaling using Docker containers, Redis Pub/Sub, Nginx load balancing, and MongoDB persistence.

---

## Architecture

```
Browser Users
      │
      ▼
┌─────────────────┐
│  Nginx (Port 80) │  ← Load Balancer (ip_hash sticky sessions)
└────────┬────────┘
         │ distributes connections
   ┌─────┴──────┬─────────┐
   ▼            ▼         ▼
[Chat-1]    [Chat-2]   [Chat-N]   ← Node.js + Socket.IO (scalable)
   │            │         │
   └────────────┼─────────┘
                ▼
         [Redis Pub/Sub]           ← Syncs messages across ALL servers
                │
         [MongoDB]                 ← Persists chat history
```

---

## Tech Stack

| Service | Technology | Purpose |
|---|---|---|
| Load Balancer | Nginx | Distributes users across servers |
| Chat Server | Node.js + Socket.IO | Handles WebSocket connections |
| Message Broker | Redis | Broadcasts messages to all servers |
| Database | MongoDB | Persists messages |
| Containers | Docker + Compose | Runs and scales everything |

---

## Quick Start

### Prerequisites
- Docker Desktop installed and running

### Step 1 — Build and Start (1 server)
```bash
cd chat-app
docker-compose up --build
```

### Step 2 — Open the App
Go to: **http://localhost**

### Step 3 — Scale to 3 Servers
```bash
docker-compose up --scale chat-server=3
```
Open two browser tabs → users on **different servers** can still chat!

### Step 4 — Check Logs
```bash
docker-compose logs -f chat-server
```
Watch which container handles each message.

---

## How Scaling Works

### The Problem
If User A connects to **Server 1** and User B connects to **Server 2**, they are on different processes. A `socket.io emit()` on Server 1 **cannot reach** Server 2's users.

### The Solution — Redis Pub/Sub Adapter
```
User A → Server 1 → publishes to Redis channel
                          ↓
                    Redis broadcasts to:
                          ↓
             Server 2 → emit to User B ✅
             Server 3 → emit to User C ✅
```

The `@socket.io/redis-adapter` handles this automatically. One line of code:
```js
io.adapter(createAdapter(pubClient, subClient));
```

---

## Commands Reference

| Command | Description |
|---|---|
| `docker-compose up --build` | Build images and start all services |
| `docker-compose up --scale chat-server=3` | Scale to 3 chat servers |
| `docker-compose down` | Stop all containers |
| `docker-compose down -v` | Stop and delete all data |
| `docker-compose logs -f` | Follow all logs |
| `docker-compose ps` | List running containers |
| `docker stats` | Monitor CPU/memory of containers |

---

## Project Structure

```
chat-app/
├── docker-compose.yml          ← Orchestrates all services
├── nginx/
│   └── nginx.conf              ← Load balancer config
├── chat-server/
│   ├── Dockerfile              ← How to build the chat server image
│   ├── package.json            ← Node.js dependencies
│   ├── server.js               ← Main server (Express + Socket.IO + Redis)
│   └── public/
│       └── index.html          ← Chat web UI
└── README.md
```
