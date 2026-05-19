# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This App Does

A web application for batch editing Archive.org item metadata. Users load their Archive.org collection, select multiple items, and apply metadata updates (title, creator, description, date, subject, etc.) in bulk with real-time progress streaming. Optionally integrates with YouTube to auto-match items and pull in video descriptions.

## Commands

```bash
# Development
npm run dev          # Frontend dev server (Vite, port 3000)
npm run server:dev   # Backend dev server (Express, port 3001, with nodemon)

# Production
npm run build        # tsc + vite build
npm run preview      # Preview production build

# Quality
npm run lint         # ESLint (zero-warnings policy)
npm run lint:fix     # Auto-fix lint issues
npm run type-check   # TypeScript type check without emitting
npm run format       # Prettier formatting

# Tests
npm test                          # Full Jest suite (127 tests)
npm run test:watch                # Watch mode
npm run test:coverage             # With coverage report
npm test -- utils.test.ts         # Single test file
npm test -- server-integration    # Partial name match also works
```

Both servers must run simultaneously in development. Vite proxies `/api` and `/auth` to `localhost:3001`.

## Architecture

### Frontend (`src/`)

State is centralized in `src/hooks/useArchive.ts` — the single custom hook that manages items, selections, activity logs, and processing status. Components are thin consumers of this hook.

- `App.tsx` — Layout shell; renders the four main components
- `components/SearchSection.tsx` — Archive.org collection search
- `components/ItemSelector.tsx` — Multi-select grid with per-item status badges
- `components/MetadataEditor.tsx` — Field selection, batch update UI, YouTube matching
- `components/LogViewer.tsx` — Real-time activity log display
- `src/types.ts` — All shared TypeScript interfaces (`ArchiveItem`, `MetadataUpdate`, `UpdateRequest`, `YouTubeMatch`, etc.)

### Backend (`server/`)

- `server/index.ts` — Express app, all API route handlers, SSE streaming logic
- `server/utils.ts` — Pure utility functions: date normalization, text extraction, Archive.org URL builders

Key API patterns:
- Metadata updates stream progress via **Server-Sent Events (SSE)** — the `/api/update-metadata` endpoint keeps the connection open and emits per-item status events
- All request bodies are validated with **Zod** before processing
- Archive.org writes go through the S3-compatible endpoint; reads use the metadata/search APIs
- YouTube OAuth flow lives on `/auth/*` routes

### Tests (`tests/`)

Jest + ts-jest (ESM preset). Tests cover utility functions, server integration (via Supertest), and regression tests for known past bugs (e.g., `archive-auth-regression.test.ts`).

### Python Tools (`archive-metadata-tools/`)

Standalone helper scripts for metadata analysis and fixes — not part of the main app build.

## Key Constraints

- **Node ≥ 18.0.0** required (uses native `fetch`, `EventSource`)
- TypeScript strict mode is enabled; `type-check` must pass
- ESLint is configured with zero-warnings tolerance — `lint` will exit non-zero on any warning
- The SSE streaming endpoint is stateful; be careful when refactoring `server/index.ts` update routes — tests in `server-integration.test.ts` cover the streaming contract
- Archive.org credentials (S3 access/secret keys) and optional YouTube OAuth credentials are loaded from environment variables; see README for the full list
