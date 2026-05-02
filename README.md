# amigos-hack

Voice agent app. Split into two independent workspaces for collaboration:

- `frontend/` — UI (Next.js)
- `backend/` — Voice agent API (Python, managed with [uv](https://github.com/astral-sh/uv))

## Getting started

### Backend

```bash
cd backend
uv sync          # install deps
uv run <entrypoint>
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Collaboration

Work in your respective directory. The two services communicate over HTTP/WebSocket — agree on the API contract in `docs/` or via an OpenAPI spec.
