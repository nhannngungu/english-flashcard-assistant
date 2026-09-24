# English Flashcard Assistant

A beginner-friendly vocabulary learning app. This repository currently contains only the Version 1 foundation: a React frontend and an Express/SQLite backend.

## Project structure

- `client/` — React frontend powered by Vite.
- `server/` — Express API and SQLite setup.
- `server/src/database.js` — creates the local SQLite database and the future `vocabularies` table on server startup.
- `server/src/index.js` — starts the API and provides `GET /api/health`.
- `server/src/routes/vocabularies.js` — vocabulary CRUD routes and request validation.

## Run locally

Open two terminals from the repository root.

```powershell
cd client
npm install
npm run dev
```

`npm install` downloads the frontend dependencies. `npm run dev` starts the Vite development server, which will show its local URL in the terminal.

```powershell
cd server
npm install
npm run dev
```

`npm install` downloads Express and the SQLite driver. `npm run dev` starts the API at `http://localhost:3000` and recreates it automatically when a server source file changes.

Check the backend with:

```powershell
Invoke-RestMethod http://localhost:3000/api/health
```

The expected response is `status: ok` and `database: connected`.

## Vocabulary API

The backend exposes these endpoints:

- `GET /api/vocabularies` — list vocabulary records.
- `GET /api/vocabularies/:id` — get one record.
- `POST /api/vocabularies` — create a record.
- `PUT /api/vocabularies/:id` — replace a record.
- `PATCH /api/vocabularies/:id/status` — change only a record's status.
- `DELETE /api/vocabularies/:id` — delete a record.

`word` is required and every text value is trimmed. Valid statuses are `new`, `learning`, and `learned`. Validation and missing records return JSON error responses.

## Deliberately deferred

The Dashboard, Vocabulary, Add Words, and Review pages will be added in later work. OCR, AI, and authentication are not included.
