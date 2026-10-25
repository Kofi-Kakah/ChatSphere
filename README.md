# ChatSphere

Real-time chat application: React (Vite) frontend + Node/Express backend over WebSockets + MongoDB.

## Setup

### Server
```
cd server
npm install
cp .env.example .env
# fill in MONGODB_URI, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET
npm run dev
```
Server runs on `PORT` (default 3001). Health: `GET /api/health`.

### Client
```
npm install
cp .env.example .env
npm run dev
```
Client runs on http://localhost:5173.

## Environment variables
See `server/.env.example` and `.env.example`.

## HTTPS / TURN
`getUserMedia` and `MediaRecorder` require a secure context (localhost exempt). Configure TURN via `TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL` for cross-network calls.

## Scripts
- server: `npm run dev`, `npm start`, `npm test`
- client: `npm run dev`, `npm run build`, `npm run lint`, `npm run preview`
