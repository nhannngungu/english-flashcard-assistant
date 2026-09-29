# English Flashcard Assistant

English Flashcard Assistant is a full-stack vocabulary learning application that helps users import, analyze, organize, and review English vocabulary using contextual analysis and spaced repetition.

## Version 3 at a glance

### Smart Vocabulary Import

- Add individual vocabulary manually or with dictionary lookup.
- Bulk-import words from lines, commas, or semicolons, then review editable results before saving.
- Import PNG, JPG, JPEG, and WEBP vocabulary images.
- Use OCR.space as the primary OCR provider (Engine 3 and table parsing) with Tesseract.js fallback.
- Extract structured vocabulary rows and safely enrich only fields that are blank.

### CEFR and vocabulary analysis

- Analyze pasted text token by token with CEFR A1–C2 levels.
- Highlight text, filter CEFR levels, and select vocabulary candidates.
- Quickly select B2+ or C1+ vocabulary.
- Rank recommended words and phrases into Recommended, Worth considering, and Lower priority groups.

### Context-aware vocabulary preparation

- Rank dictionary senses against the source sentence and surrounding context.
- Prepare editable English definitions, Vietnamese meanings, phonetics, parts of speech, and examples.
- Review confidence and alternative meanings before saving.

### Vocabulary Sets

- Save batches from Bulk Import, Smart Import, or CEFR preparation into a review set.
- Use a custom title and optional cover image; blank titles receive an automatic local-date title.
- Review a specific set, browse compact set details, and paginate set cards.

### Spaced-repetition review

- Study due and new vocabulary in Smart Review.
- Rate cards with Again, Hard, Good, or Easy.
- Store the resulting interval, ease factor, next review time, and review history.
- Use image-first flashcards where an image is available.

### Learning statistics

- See vocabulary totals by New, Learning, and Learned status.
- Track due/reviewed-today counts, rating distribution, and seven-day activity.
- Review upcoming work, recent activity, and recent vocabulary sets.

### Vocabulary management

- Edit or delete vocabulary and retain its learning status.
- Browse vocabulary in 10, 20, or 50-row pages.

## Tech stack

- **Frontend:** React, Vite, JavaScript, CSS
- **Backend:** Node.js, Express
- **Database:** PostgreSQL (Neon-compatible pooled connection)
- **Authentication:** JWT bearer tokens with bcrypt password hashing
- **External services:** OCR.space, Tesseract.js fallback, Pexels, dictionary providers, and a translation provider

External services are called only from the backend. Browser code never receives provider secrets.

## Project structure

```text
english-flashcard-assistant/
├── client/
│   └── src/
│       ├── api/                 # Backend API clients
│       ├── components/          # Import, preparation, and reusable UI
│       ├── pages/               # Dashboard, Import, Review, Vocabulary, Add Words
│       └── utils/               # Text, bulk-import, and vocabulary helpers
├── server/
│   ├── src/
│   │   ├── data/cefr/           # Local CEFR datasets
│   │   ├── routes/              # OCR, analysis, vocabulary, review-set, statistics APIs
│   │   ├── services/            # CEFR, SRS, context, recommendation, and provider logic
│   │   └── database.js          # PostgreSQL pool, initialization, and safe migrations
│   └── .env.example             # Environment-variable placeholders
├── docs/screenshots/            # Project screenshots
├── CHANGELOG.md
└── README.md
```

## Installation

```powershell
git clone <repository-url>
cd english-flashcard-assistant
```

Install the backend dependencies:

```powershell
cd server
npm install
```

Install the frontend dependencies:

```powershell
cd ../client
npm install
```

Copy `server/.env.example` to `server/.env`, then configure local PostgreSQL and authentication:

```dotenv
DATABASE_URL=postgresql://user:password@host/database?sslmode=require
JWT_SECRET=replace_with_a_strong_random_secret
PEXELS_API_KEY=
OCR_SPACE_API_KEY=
CLIENT_ORIGIN=http://localhost:5173
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

`DATABASE_URL` and `JWT_SECRET` are required. Startup fails clearly when either is missing. Avatar uploads require all three Cloudinary values and return a clear configuration error when they are absent. Use a strong random production JWT secret and never put real values in tracked files. The server initializes the schema with non-destructive `CREATE TABLE IF NOT EXISTS` and safe `ALTER TABLE` migrations.

## Production environment

For a Render backend, configure these environment variables:

```dotenv
DATABASE_URL=<Neon pooled connection string>
JWT_SECRET=<strong random production secret>
CLIENT_ORIGIN=<exact frontend origin, without a trailing slash>
PEXELS_API_KEY=<Pexels key, if image search is enabled>
OCR_SPACE_API_KEY=<OCR.space key, if OCR is enabled>
CLOUDINARY_CLOUD_NAME=<Cloudinary cloud name>
CLOUDINARY_API_KEY=<Cloudinary API key>
CLOUDINARY_API_SECRET=<Cloudinary API secret>
```

The server uses `PORT` when Render provides it. Never expose `DATABASE_URL`, `JWT_SECRET`, or provider keys through Vite/frontend variables.

For a separately deployed frontend, copy `client/.env.example` to `client/.env` and set `VITE_API_BASE_URL` to the backend API base URL, for example `https://example-backend.onrender.com/api`. Leave it blank during local development to use Vite's `/api` proxy.

## Run the application

Use two terminals from the repository root.

Start the backend:

```powershell
cd server
npm run dev
```

The API listens on `http://localhost:3000` by default.

Start the frontend:

```powershell
cd client
npm run dev
```

Open the Vite URL shown in the terminal, usually `http://localhost:5173`.

## Testing

Run backend automated tests:

```powershell
cd server
npm test
```

Build the frontend for production:

```powershell
cd client
npm run build
```

Current verification completes with **51 backend tests passing** and a successful frontend production build.

## Authentication and data ownership

- Register with `POST /api/auth/register`, sign in with an email or case-insensitive display name at `POST /api/auth/login`, and restore a session with protected `GET /api/auth/me`.
- Display names are case-insensitively unique. `PATCH /api/auth/profile` updates the authenticated user's display name.
- `POST /api/auth/avatar` accepts a JPEG, PNG, or WebP image up to 5 MB and uploads a server-authenticated 256×256 avatar to Cloudinary. `DELETE /api/auth/avatar` removes it.
- Cloudinary stores the image while PostgreSQL stores only `avatar_url` and `avatar_public_id`. Replacing an avatar uploads the new image before removing the old one.
- JWTs expire after seven days and contain only the user id, normalized email, and standard JWT timestamps.
- Vocabulary, sets, review history, Smart Review, analysis against saved words, and dashboard statistics are protected and filtered by the authenticated user id.
- Set ownership is enforced before assignment, and review updates plus history insertion run in one PostgreSQL transaction.
- Creating a set with one or more vocabulary items uses `POST /api/vocabulary-sets/with-vocabularies`, which saves the set and all items atomically.
- The browser stores the JWT in `localStorage` for this portfolio app. This is simpler than httpOnly-cookie authentication but is more exposed to a successful XSS attack.

The previous `server/data/flashcards.db` SQLite file is intentionally left untouched as a backup. Runtime code does not open it, and legacy rows are not automatically copied into PostgreSQL. Legacy migration can be performed separately after an ownership mapping is chosen.

## Two-account manual isolation test

1. Start both applications, register `a@example.com`, and add a vocabulary item such as `alpha`.
2. Log out, register `b@example.com`, and confirm the Vocabulary page, Dashboard, Smart Review, review sets, and recent activity do not show `alpha`.
3. As B, add `beta`, put it in a review set, and record a review rating.
4. Log out and sign back in as `a@example.com`. Confirm only `alpha` is visible and A's dashboard/review history contains no B activity.
5. Sign back in as `b@example.com`. Confirm only `beta`, B's set, B's rating, and B's statistics are visible.

## Version 3 workflow

```text
Import text or image
  → Analyze CEFR
  → Select or accept recommendations
  → Prepare vocabulary using context
  → Save to a Vocabulary Set
  → Review with Smart Review or Review Sets
  → Track progress in the Dashboard
```

## API overview

The development API base URL is `http://localhost:3000`.

| Area | Endpoint examples |
| --- | --- |
| Authentication | `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, `PATCH /api/auth/profile` |
| Avatar | `POST/DELETE /api/auth/avatar` |
| Vocabulary | `GET/POST /api/vocabularies`, `PUT/DELETE /api/vocabularies/:id` |
| Review | `GET /api/vocabularies/review/smart`, `POST /api/vocabularies/:id/review` |
| Vocabulary sets | `GET/POST /api/vocabulary-sets`, `GET/PATCH /api/vocabulary-sets/:id` |
| Import | `POST /api/import/ocr` |
| Analysis | `POST /api/analysis/cefr`, `/recommendations`, `/prepare-vocabulary` |
| Enrichment | `GET /api/dictionary/:word`, `GET /api/images/:word` |
| Statistics | `GET /api/statistics/dashboard` |

## Version 3 Screenshots

### Smart Import / OCR

![Smart Import / OCR](docs/screenshots/v3-smart-import.png)

### CEFR Analyzer

![CEFR Analyzer](docs/screenshots/v3-cefr-analyzer.png)

### Vocabulary Recommendations

`docs/screenshots/v3-recommendations.png` still needs to be added.

### Review Sets

![Review Sets](docs/screenshots/v3-review-sets.png)

### Learning Statistics Dashboard

![Learning Statistics Dashboard](docs/screenshots/v3-dashboard.png)

### Smart Review / Spaced Repetition

![Smart Review / Spaced Repetition](docs/screenshots/v3-smart-review.png)

## Security

- Store secrets only in `server/.env`.
- `server/.env` is ignored by Git.
- `server/.env.example` contains placeholders only.
- OCR, image, dictionary, translation, and optional AI provider keys remain on the server.
- Cloudinary credentials remain server-side; the browser sends only the selected avatar file to the protected backend endpoint.
- Passwords are bcrypt hashes and are never returned by the API.
- Protected requests use `Authorization: Bearer <token>`; user identity is never accepted from a request body.

## Known limitations

- Dictionary, translation, OCR, and image providers require internet access and may depend on third-party availability.
- JWTs are stored in browser `localStorage`; a production system with a broader threat model should consider secure, same-site, httpOnly cookies and CSRF protection.
- Existing SQLite data is retained as a backup but is not automatically migrated because shared legacy rows have no safe user owner mapping.
- Password reset, email verification, refresh-token rotation, session revocation, and rate limiting are not yet implemented.
- The current SRS is deterministic and intentionally simple; advanced FSRS scheduling is not implemented.

## Version history

- **v1.0.0:** Core vocabulary CRUD and basic review.
- **v2.0.0:** Dictionary enrichment, bilingual meanings, pronunciation, images, bulk import, and image-first flashcards.
- **v3.0.0:** Smart OCR import, CEFR analysis, contextual enrichment, recommendations, vocabulary sets, spaced repetition, review history, statistics, pagination, and UX improvements.

See [CHANGELOG.md](CHANGELOG.md) for Version 3 release notes.

## Author

Do Thanh Nhan
