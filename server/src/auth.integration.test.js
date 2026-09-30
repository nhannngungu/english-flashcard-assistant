import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { DataType, newDb } from 'pg-mem'
import request from 'supertest'
import { createApp } from './app.js'

describe('authentication and user data isolation', () => {
  let app
  let pool
  let tokenA
  let tokenB
  let userBId
  let vocabularyA
  let vocabularyB
  let setB
  const destroyedAvatars = []
  let uploadedAvatarCount = 0

  before(async () => {
    const memory = newDb({ autoCreateForeignKeyIndices: true })
    memory.public.registerFunction({
      name: 'btrim',
      args: [DataType.text],
      returns: DataType.text,
      implementation: (value) => value.trim(),
    })
    memory.public.registerFunction({
      name: 'random',
      returns: DataType.float,
      implementation: () => Math.random(),
    })
    memory.public.none(`
      CREATE TABLE users (
        id BIGSERIAL PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        display_name TEXT NOT NULL,
        avatar_url TEXT,
        avatar_public_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE UNIQUE INDEX users_display_name_lower_unique ON users(LOWER(BTRIM(display_name)));
      CREATE TABLE vocabulary_sets (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        cover_image_url TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (id, user_id)
      );
      CREATE TABLE vocabularies (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        word TEXT NOT NULL,
        meaning TEXT NOT NULL DEFAULT '',
        meaning_en TEXT NOT NULL DEFAULT '',
        meaning_vi TEXT NOT NULL DEFAULT '',
        part_of_speech TEXT,
        example TEXT,
        image_url TEXT,
        phonetic TEXT NOT NULL DEFAULT '',
        audio_url TEXT NOT NULL DEFAULT '',
        set_id BIGINT,
        status TEXT NOT NULL DEFAULT 'new',
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (id, user_id),
        FOREIGN KEY (set_id, user_id) REFERENCES vocabulary_sets(id, user_id)
      );
      CREATE TABLE review_history (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        vocabulary_id BIGINT NOT NULL,
        rating TEXT NOT NULL,
        reviewed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        next_review_at TIMESTAMPTZ NOT NULL,
        interval_days INTEGER NOT NULL DEFAULT 0,
        ease_factor DOUBLE PRECISION NOT NULL DEFAULT 2.5,
        FOREIGN KEY (vocabulary_id, user_id) REFERENCES vocabularies(id, user_id) ON DELETE CASCADE
      );
    `)
    const adapter = memory.adapters.createPg()
    pool = new adapter.Pool()
    const avatarStorage = {
      async upload() {
        uploadedAvatarCount += 1
        return {
          avatarUrl: `https://res.cloudinary.com/test/image/upload/avatar-${uploadedAvatarCount}.png`,
          publicId: `english-flashcard-assistant/avatars/avatar-${uploadedAvatarCount}`,
        }
      },
      async destroy(publicId) {
        destroyedAvatars.push(publicId)
      },
    }
    app = createApp({ database: pool, jwtSecret: 'integration-test-secret-at-least-32-characters', avatarStorage })
  })

  after(async () => pool.end())

  test('register normalizes email and returns a JWT without password data', async () => {
    const responseA = await request(app).post('/api/auth/register').send({
      email: '  A@Example.com ', password: 'password-A-123', display_name: 'Account A',
    }).expect(201)
    const responseB = await request(app).post('/api/auth/register').send({
      email: 'b@example.com', password: 'password-B-123', display_name: 'Account B',
    }).expect(201)
    tokenA = responseA.body.token
    tokenB = responseB.body.token
    userBId = responseB.body.user.id
    assert.equal(responseA.body.user.email, 'a@example.com')
    assert.equal(responseA.body.user.avatar_url, null)
    assert.equal(responseA.body.user.avatar_public_id, null)
    assert.ok(tokenA)
    assert.equal(responseA.body.user.password_hash, undefined)
  })

  test('duplicate email is rejected', async () => {
    await request(app).post('/api/auth/register').send({
      email: 'A@EXAMPLE.COM', password: 'another-password', display_name: 'Duplicate',
    }).expect(409)
  })

  test('duplicate display name is rejected case-insensitively', async () => {
    const response = await request(app).post('/api/auth/register').send({
      email: 'unique@example.com', password: 'another-password', display_name: 'account a',
    }).expect(409)
    assert.match(response.body.error, /display name/i)
  })

  test('login succeeds with email', async () => {
    const response = await request(app).post('/api/auth/login').send({ identifier: 'A@Example.com', password: 'password-A-123' }).expect(200)
    assert.ok(response.body.token)
    assert.equal(response.body.user.email, 'a@example.com')
  })

  test('login succeeds with display name', async () => {
    const response = await request(app).post('/api/auth/login').send({ identifier: 'Account A', password: 'password-A-123' }).expect(200)
    assert.equal(response.body.user.email, 'a@example.com')
  })

  test('display name login is case-insensitive', async () => {
    const response = await request(app).post('/api/auth/login').send({ identifier: 'aCcOuNt A', password: 'password-A-123' }).expect(200)
    assert.equal(response.body.user.display_name, 'Account A')
  })

  test('login rejects a wrong password', async () => {
    const response = await request(app).post('/api/auth/login').send({ identifier: 'a@example.com', password: 'wrong-password' }).expect(401)
    assert.equal(response.body.error, 'Invalid credentials.')
  })

  test('/auth/me returns the authenticated user', async () => {
    const response = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${tokenA}`).expect(200)
    assert.equal(response.body.user.display_name, 'Account A')
    assert.equal(response.body.user.password_hash, undefined)
  })

  test('existing users with a null avatar still work', async () => {
    const response = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${tokenB}`).expect(200)
    assert.equal(response.body.user.display_name, 'Account B')
    assert.equal(response.body.user.avatar_url, null)
  })

  test('profile update returns the new display name', async () => {
    const response = await request(app).patch('/api/auth/profile')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ display_name: 'Updated Account A' })
      .expect(200)
    assert.equal(response.body.user.display_name, 'Updated Account A')
    assert.equal(response.body.user.avatar_url, null)
  })

  test('duplicate profile display name is rejected case-insensitively', async () => {
    const response = await request(app).patch('/api/auth/profile')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ display_name: 'account b' })
      .expect(409)
    assert.match(response.body.error, /display name/i)
  })

  test('unauthenticated avatar upload is rejected', async () => {
    await request(app).post('/api/auth/avatar')
      .attach('avatar', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), { filename: 'avatar.png', contentType: 'image/png' })
      .expect(401)
  })

  test('invalid avatar image type is rejected', async () => {
    await request(app).post('/api/auth/avatar')
      .set('Authorization', `Bearer ${tokenA}`)
      .attach('avatar', Buffer.from('not an image'), { filename: 'avatar.txt', contentType: 'text/plain' })
      .expect(400)
  })

  test('spoofed avatar mime type is rejected by content signature', async () => {
    await request(app).post('/api/auth/avatar')
      .set('Authorization', `Bearer ${tokenA}`)
      .attach('avatar', Buffer.from('not really a png'), { filename: 'avatar.png', contentType: 'image/png' })
      .expect(400)
  })

  test('oversized avatar is rejected', async () => {
    await request(app).post('/api/auth/avatar')
      .set('Authorization', `Bearer ${tokenA}`)
      .attach('avatar', Buffer.alloc(5 * 1024 * 1024 + 1), { filename: 'large.jpg', contentType: 'image/jpeg' })
      .expect(413)
  })

  test('successful avatar upload updates only the authenticated user', async () => {
    const response = await request(app).post('/api/auth/avatar')
      .set('Authorization', `Bearer ${tokenA}`)
      .field('user_id', userBId)
      .attach('avatar', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]), { filename: 'untrusted-name.png', contentType: 'image/png' })
      .expect(200)
    assert.match(response.body.avatar_url, /cloudinary/)
    assert.match(response.body.avatar_public_id, /avatars/)
    const userB = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${tokenB}`).expect(200)
    assert.equal(userB.body.user.avatar_url, null)
  })

  test('replacing an avatar removes the previous Cloudinary image', async () => {
    const before = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${tokenA}`).expect(200)
    const previousPublicId = before.body.user.avatar_public_id
    await request(app).post('/api/auth/avatar')
      .set('Authorization', `Bearer ${tokenA}`)
      .attach('avatar', Buffer.from([0xff, 0xd8, 0xff, 0x00]), { filename: 'replacement.jpg', contentType: 'image/jpeg' })
      .expect(200)
    assert.ok(destroyedAvatars.includes(previousPublicId))
  })

  test('avatar fields are returned by /auth/me', async () => {
    const response = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${tokenA}`).expect(200)
    assert.equal(response.body.user.display_name, 'Updated Account A')
    assert.match(response.body.user.avatar_url, /cloudinary/)
    assert.match(response.body.user.avatar_public_id, /avatars/)
  })

  test('removing an avatar resets both avatar fields', async () => {
    const before = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${tokenA}`).expect(200)
    const publicId = before.body.user.avatar_public_id
    const response = await request(app).delete('/api/auth/avatar').set('Authorization', `Bearer ${tokenA}`).expect(200)
    assert.equal(response.body.avatar_url, null)
    assert.equal(response.body.avatar_public_id, null)
    assert.ok(destroyedAvatars.includes(publicId))
    const after = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${tokenA}`).expect(200)
    assert.equal(after.body.user.avatar_url, null)
    assert.equal(after.body.user.avatar_public_id, null)
  })

  test('protected routes reject missing and invalid tokens', async () => {
    await request(app).get('/api/vocabularies').expect(401)
    await request(app).get('/api/vocabularies').set('Authorization', 'Bearer invalid-token').expect(401)
  })

  test('each user sees only their own vocabulary', async () => {
    vocabularyA = (await request(app).post('/api/vocabularies').set('Authorization', `Bearer ${tokenA}`).send({ word: 'alpha', meaning_en: 'first' }).expect(201)).body
    vocabularyB = (await request(app).post('/api/vocabularies').set('Authorization', `Bearer ${tokenB}`).send({ word: 'beta', meaning_en: 'second' }).expect(201)).body
    const wordsA = (await request(app).get('/api/vocabularies').set('Authorization', `Bearer ${tokenA}`).expect(200)).body
    const wordsB = (await request(app).get('/api/vocabularies').set('Authorization', `Bearer ${tokenB}`).expect(200)).body
    assert.deepEqual(wordsA.map((word) => word.word), ['alpha'])
    assert.deepEqual(wordsB.map((word) => word.word), ['beta'])
    await request(app).get(`/api/vocabularies/${vocabularyB.id}`).set('Authorization', `Bearer ${tokenA}`).expect(404)
  })

  test('user A cannot edit user B vocabulary', async () => {
    await request(app).put(`/api/vocabularies/${vocabularyB.id}`).set('Authorization', `Bearer ${tokenA}`).send({ word: 'stolen', meaning_en: 'no' }).expect(404)
    const response = await request(app).get(`/api/vocabularies/${vocabularyB.id}`).set('Authorization', `Bearer ${tokenB}`).expect(200)
    assert.equal(response.body.word, 'beta')
  })

  test('user A cannot delete user B vocabulary', async () => {
    await request(app).delete(`/api/vocabularies/${vocabularyB.id}`).set('Authorization', `Bearer ${tokenA}`).expect(404)
    await request(app).get(`/api/vocabularies/${vocabularyB.id}`).set('Authorization', `Bearer ${tokenB}`).expect(200)
  })

  test('user A cannot review user B vocabulary', async () => {
    await request(app).post(`/api/vocabularies/${vocabularyB.id}/review`).set('Authorization', `Bearer ${tokenA}`).send({ rating: 'good' }).expect(404)
    const history = await pool.query('SELECT * FROM review_history WHERE vocabulary_id = $1', [vocabularyB.id])
    assert.equal(history.rowCount, 0)
  })

  test('a user cannot access or assign vocabulary to another user review set', async () => {
    setB = (await request(app).post('/api/vocabulary-sets').set('Authorization', `Bearer ${tokenB}`).send({ title: 'B set' }).expect(201)).body
    await request(app).get(`/api/vocabulary-sets/${setB.id}`).set('Authorization', `Bearer ${tokenA}`).expect(404)
    await request(app).post('/api/vocabularies').set('Authorization', `Bearer ${tokenA}`).send({ word: 'cross-user', set_id: setB.id }).expect(404)
  })

  test('LinkLab random sessions validate options, eligibility, and user ownership', async () => {
    await request(app).get('/api/linklab/random?mode=classic&limit=12&status=all').expect(401)
    await request(app).get('/api/linklab/random?mode=unknown&limit=18&status=all').set('Authorization', `Bearer ${tokenA}`).expect(400)
    await request(app).get('/api/linklab/random?mode=classic&limit=7&status=all').set('Authorization', `Bearer ${tokenA}`).expect(400)

    const classic = (await request(app).post('/api/vocabularies').set('Authorization', `Bearer ${tokenA}`).send({
      word: 'benefit', meaning_vi: 'lợi ích', status: 'new',
    }).expect(201)).body
    const deep = (await request(app).post('/api/vocabularies').set('Authorization', `Bearer ${tokenA}`).send({
      word: 'sustainable', meaning_vi: 'bền vững', example: 'This is a sustainable plan.', status: 'learning',
    }).expect(201)).body
    const visual = (await request(app).post('/api/vocabularies').set('Authorization', `Bearer ${tokenA}`).send({
      word: 'forest', image_url: 'https://images.example/forest.jpg', status: 'learned',
    }).expect(201)).body
    await request(app).post('/api/vocabularies').set('Authorization', `Bearer ${tokenB}`).send({
      word: 'private', meaning_vi: 'riêng tư', example: 'Private data.', image_url: 'https://images.example/private.jpg',
    }).expect(201)

    const classicResponse = await request(app).get('/api/linklab/random?mode=classic&limit=12&status=all')
      .set('Authorization', `Bearer ${tokenA}`).expect(200)
    assert.equal(classicResponse.body.requested_limit, 12)
    assert.equal(classicResponse.body.reduced, true)
    assert.ok(classicResponse.body.items.some((word) => word.id === classic.id))
    assert.ok(classicResponse.body.items.some((word) => word.id === deep.id))
    assert.ok(classicResponse.body.items.every((word) => word.user_id !== userBId))
    assert.equal(new Set(classicResponse.body.items.map((word) => word.id)).size, classicResponse.body.items.length)

    const deepResponse = await request(app).get('/api/linklab/random?mode=deep&limit=18&status=learning')
      .set('Authorization', `Bearer ${tokenA}`).expect(200)
    assert.deepEqual(deepResponse.body.items.map((word) => word.id), [deep.id])

    const visualResponse = await request(app).get('/api/linklab/random?mode=visual&limit=24&status=learned')
      .set('Authorization', `Bearer ${tokenA}`).expect(200)
    assert.deepEqual(visualResponse.body.items.map((word) => word.id), [visual.id])

    await pool.query(
      `INSERT INTO review_history (user_id, vocabulary_id, rating, next_review_at) VALUES ($1, $2, 'good', $3)`,
      [deep.user_id, deep.id, new Date(Date.now() + 86_400_000).toISOString()],
    )
    const dueResponse = await request(app).get('/api/linklab/random?mode=classic&limit=12&status=due')
      .set('Authorization', `Bearer ${tokenA}`).expect(200)
    assert.ok(dueResponse.body.items.some((word) => word.id === classic.id))
    assert.ok(dueResponse.body.items.every((word) => word.id !== deep.id))

    await pool.query(`DELETE FROM vocabularies WHERE word IN ('benefit', 'sustainable', 'forest', 'private')`)
  })

  test('dashboard statistics are scoped to the authenticated user', async () => {
    const starts = Array.from({ length: 8 }, (_, index) => new Date(Date.now() + (index - 6) * 86_400_000).toISOString())
    const upcoming = [starts[6], starts[7], new Date(Date.now() + 2 * 86_400_000).toISOString(), new Date(Date.now() + 9 * 86_400_000).toISOString()]
    const query = new URLSearchParams({ day_starts_utc: JSON.stringify(starts), upcoming_starts_utc: JSON.stringify(upcoming), timezone_offset_minutes: '0' })
    const response = await request(app).get(`/api/statistics/dashboard?${query}`).set('Authorization', `Bearer ${tokenA}`).expect(200)
    assert.equal(response.body.summary.totalVocabulary, 1)
    assert.equal(response.body.reviewSets.total, 0)
  })

  test('set creation and multi-row vocabulary save are atomic', async () => {
    const response = await request(app).post('/api/vocabulary-sets/with-vocabularies')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ title: 'Atomic set', vocabularies: [{ word: 'gamma' }, { word: 'delta' }] })
      .expect(201)
    assert.equal(response.body.set.word_count, 2)
    assert.deepEqual(response.body.vocabularies.map((word) => word.word), ['gamma', 'delta'])
    const set = await request(app).get(`/api/vocabulary-sets/${response.body.set.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200)
    assert.equal(set.body.word_count, 2)
  })
})
