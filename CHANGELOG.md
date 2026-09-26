# Changelog

## v3.0.0

### Added

- Smart OCR image import with OCR.space as the primary provider and Tesseract.js fallback.
- Structured OCR vocabulary rows, safe missing-field enrichment, OCR cleanup, and phrase support.
- CEFR text analysis, vocabulary recommendations, and context-aware vocabulary preparation.
- Vocabulary Sets with titles, covers, automatic timestamps, set-specific review, and pagination.
- Deterministic spaced repetition with Again, Hard, Good, and Easy ratings plus review history.
- Smart Review, Review Sets, a learning statistics dashboard, and vocabulary-table pagination.

### Improved

- Preserve-first enrichment: existing OCR and user-entered values are not overwritten automatically.
- Learner-friendly definition selection and field-level dictionary fallback.
- Responsive import, CEFR, recommendation, review, dashboard, and vocabulary-management layouts.
- Safe SQLite migrations for vocabulary fields, review history, and nullable vocabulary-set assignment.

### Testing

- Version 3 verification: 24 backend tests passing.
- Version 3 verification: frontend production build passing.

### Known limitations

- External dictionary, translation, OCR, and image providers require internet access and can be unavailable.
- Authentication and multi-user support are not included.
- SRS scheduling is deterministic; advanced FSRS scheduling is not included.

## v2.0.0

- Dictionary enrichment, Vietnamese meanings, pronunciation, image suggestions, bulk import, and image-first flashcards.

## v1.0.0

- Core vocabulary CRUD, SQLite persistence, basic statuses, and flashcard review.
