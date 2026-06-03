# chess

## Frontend environment

The frontend needs to target the long-running Node backend for both REST and Socket.IO:

```env
VITE_API_URL=https://your-backend-host.example.com
VITE_SOCKET_URL=https://your-backend-host.example.com
```

Do not point `VITE_SOCKET_URL` at the Vercel frontend deployment unless that same host is running the Socket.IO backend. Static/serverless Vercel frontends will fail `wss://.../socket.io` connections.
