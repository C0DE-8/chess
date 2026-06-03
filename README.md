# chess

## Frontend environment

The frontend needs to target the long-running Node backend for both REST and Socket.IO:

```env
VITE_API_URL=https://your-backend-host.example.com
VITE_SOCKET_URL=https://your-backend-host.example.com
VITE_SOCKET_TRANSPORTS=websocket,polling
```

Do not point `VITE_SOCKET_URL` at the Vercel frontend deployment unless that same host is running the Socket.IO backend. Static/serverless Vercel frontends will fail `wss://.../socket.io` connections.

If the backend host is also on Vercel, use polling only:

```env
VITE_SOCKET_TRANSPORTS=polling
```

Vercel serverless deployments do not provide a stable persistent WebSocket server. Socket.IO polling can still sync moves, but a dedicated Node host such as Render, Railway, Fly.io, or a VPS is the better deployment target for true WebSockets.
