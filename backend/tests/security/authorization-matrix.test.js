import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { startTestDatabase } from '../helpers/db.js'
import { createTestApp } from '../helpers/server.js'
import {
  TEST_PASSWORD,
  createDirectConversation,
  createGroupConversation,
  createUser,
  ensureIndexes,
} from '../helpers/factories.js'
import { buildUserPayload, loginUser } from '../helpers/auth.js'
import { makeJpeg } from '../fixtures/media-fixtures.js'
import { signFileUrl } from '../../src/utils/signedUrl.js'

// Testing.md 6.1: every REST route is exercised as anonymous, dave (authenticated
// non-member), and the owner/member. The table this test prints is the source for
// docs/testing/SECURITY_AUTHORIZATION_MATRIX.md.

let db
let app
let config
let alice
let bob
let dave
let ids
let daveCookie
let aliceCookie
let uploadId
let uploadQuery
let jpeg

const results = []

beforeAll(async () => {
  db = await startTestDatabase('security_authorization')
  ;({ app, config } = createTestApp())
  await ensureIndexes()

  ;[alice, bob, dave] = await Promise.all([
    createUser(config, { username: 'alice_z', displayName: 'Alice Z' }),
    createUser(config, { username: 'bob_z', displayName: 'Bob Z' }),
    createUser(config, { username: 'dave_z', displayName: 'Dave Z' }),
  ])

  const direct = await createDirectConversation(alice.user, bob.user)
  const addGroup = await createGroupConversation({ creator: alice.user, members: [bob.user], name: 'Add Group' })
  const removeGroup = await createGroupConversation({
    creator: alice.user,
    members: [bob.user, dave.user],
    name: 'Remove Group',
  })
  const leaveGroup = await createGroupConversation({ creator: alice.user, members: [bob.user], name: 'Leave Group' })
  const patchGroup = await createGroupConversation({
    creator: alice.user,
    members: [bob.user, dave.user],
    name: 'Patch Group',
  })

  ids = {
    alice: String(alice.user._id),
    bob: String(bob.user._id),
    dave: String(dave.user._id),
    direct: String(direct._id),
    addGroup: String(addGroup._id),
    removeGroup: String(removeGroup._id),
    leaveGroup: String(leaveGroup._id),
    patchGroup: String(patchGroup._id),
  }

  daveCookie = (await loginUser(app, dave.user.username, TEST_PASSWORD)).setCookie[0].split(';')[0]
  aliceCookie = (await loginUser(app, alice.user.username, TEST_PASSWORD)).setCookie[0].split(';')[0]

  jpeg = await makeJpeg({ width: 8, height: 8, exif: false })
  const upload = await request(app)
    .post('/api/uploads')
    .set(alice.header)
    .attach('file', jpeg, { filename: 'authz.jpg', contentType: 'image/jpeg' })
  expect(upload.status, JSON.stringify(upload.body)).toBe(201)
  uploadId = upload.body.uploadId
  const signed = signFileUrl(uploadId, config.JWT_ACCESS_SECRET)
  uploadQuery = `exp=${signed.exp}&sig=${signed.sig}`
})

afterAll(async () => {
  console.log(JSON.stringify({ authorizationMatrix: results }, null, 2))
  await db.stop()
})

const ok = { anonymous: 401, dave: 403, member: 200 }

function routes() {
  const uniqueBody = (role) => buildUserPayload({ prefix: `az${role.slice(0, 2)}` })
  return [
    {
      id: 'AUTHZ-001',
      label: 'GET /api/health (public)',
      method: 'get',
      path: () => '/api/health',
      expect: { anonymous: 200, dave: 200, member: 200 },
    },
    {
      id: 'AUTHZ-002',
      label: 'POST /api/auth/register (public)',
      method: 'post',
      path: () => '/api/auth/register',
      body: uniqueBody,
      expect: { anonymous: 201, dave: 201, member: 201 },
    },
    {
      id: 'AUTHZ-003',
      label: 'POST /api/auth/login (public)',
      method: 'post',
      path: () => '/api/auth/login',
      body: (role) => ({
        identifier: role === 'anonymous' ? 'no_such_az' : (role === 'dave' ? dave.user.username : alice.user.username),
        password: role === 'anonymous' ? 'WrongPass!234' : TEST_PASSWORD,
      }),
      expect: { anonymous: 401, dave: 200, member: 200 },
    },
    {
      id: 'AUTHZ-004',
      label: 'POST /api/auth/refresh (cookie)',
      method: 'post',
      path: () => '/api/auth/refresh',
      cookies: () => ({ dave: daveCookie, member: aliceCookie }),
      expect: { anonymous: 401, dave: 200, member: 200 },
    },
    {
      id: 'AUTHZ-005',
      label: 'POST /api/auth/logout (cookie)',
      method: 'post',
      path: () => '/api/auth/logout',
      cookies: () => ({ dave: daveCookie, member: aliceCookie }),
      expect: { anonymous: 204, dave: 204, member: 204 },
    },
    {
      id: 'AUTHZ-006',
      label: 'GET /api/auth/me',
      method: 'get',
      path: () => '/api/auth/me',
      expect: { anonymous: 401, dave: 200, member: 200 },
    },
    {
      id: 'AUTHZ-007',
      label: 'GET /api/users/search',
      method: 'get',
      path: () => '/api/users/search?q=alice_z',
      expect: { anonymous: 401, dave: 200, member: 200 },
    },
    {
      id: 'AUTHZ-008',
      label: 'GET /api/users/:id',
      method: 'get',
      path: () => `/api/users/${ids.alice}`,
      expect: { anonymous: 401, dave: 200, member: 200 },
    },
    {
      id: 'AUTHZ-009',
      label: 'PATCH /api/users/me',
      method: 'patch',
      path: () => '/api/users/me',
      body: (role) => ({ displayName: `Auth ${role}` }),
      expect: { anonymous: 401, dave: 200, member: 200 },
    },
    {
      id: 'AUTHZ-010',
      label: 'GET /api/conversations',
      method: 'get',
      path: () => '/api/conversations',
      expect: { anonymous: 401, dave: 200, member: 200 },
    },
    {
      id: 'AUTHZ-011',
      label: 'POST /api/conversations/direct',
      method: 'post',
      path: () => '/api/conversations/direct',
      body: (role) => ({ userId: role === 'dave' ? ids.alice : ids.bob }),
      expect: { anonymous: 401, dave: 201, member: 201 },
    },
    {
      id: 'AUTHZ-012',
      label: 'POST /api/conversations/group',
      method: 'post',
      path: () => '/api/conversations/group',
      body: (role) => ({ name: `AuthZ ${role}`, memberIds: [ids.alice, ids.bob] }),
      expect: { anonymous: 401, dave: 201, member: 201 },
    },
    {
      id: 'AUTHZ-013',
      label: 'POST /api/conversations/:id/members (admin only)',
      method: 'post',
      path: () => `/api/conversations/${ids.addGroup}/members`,
      body: () => ({ userIds: [ids.dave] }),
      expect: { anonymous: 401, dave: 403, member: 200 },
    },
    {
      id: 'AUTHZ-014',
      label: 'DELETE /api/conversations/:id/members/:userId (admin only)',
      method: 'delete',
      path: () => `/api/conversations/${ids.removeGroup}/members/${ids.bob}`,
      expect: { anonymous: 401, dave: 403, member: 200 },
    },
    {
      id: 'AUTHZ-015',
      label: 'POST /api/conversations/:id/leave (member)',
      method: 'post',
      path: () => `/api/conversations/${ids.leaveGroup}/leave`,
      expect: { anonymous: 401, dave: 403, member: 200 },
      bug: 'BUG-014',
    },
    {
      id: 'AUTHZ-016',
      label: 'PATCH /api/conversations/:id (direct, participant)',
      method: 'patch',
      path: () => `/api/conversations/${ids.direct}`,
      body: () => ({ name: 'Renamed direct' }),
      expect: ok,
    },
    {
      id: 'AUTHZ-017',
      label: 'PATCH /api/conversations/:id (group, non-admin member)',
      method: 'patch',
      path: () => `/api/conversations/${ids.patchGroup}`,
      body: () => ({ name: 'Hijacked group' }),
      member: 'bob',
      expect: { anonymous: 401, dave: 403, member: 403 },
      bug: 'BUG-005',
    },
    {
      id: 'AUTHZ-018',
      label: 'PATCH /api/conversations/:id theme',
      method: 'patch',
      path: () => `/api/conversations/${ids.direct}`,
      body: () => ({ theme: 'love' }),
      expect: ok,
      bug: 'BUG-004',
    },
    {
      id: 'AUTHZ-019',
      label: 'GET /api/conversations/:id/messages',
      method: 'get',
      path: () => `/api/conversations/${ids.direct}/messages`,
      expect: ok,
    },
    {
      id: 'AUTHZ-020',
      label: 'GET /api/conversations/:id/media',
      method: 'get',
      path: () => `/api/conversations/${ids.direct}/media?type=image`,
      expect: ok,
    },
    {
      id: 'AUTHZ-021',
      label: 'POST /api/uploads',
      method: 'post',
      path: () => '/api/uploads',
      attach: true,
      expect: { anonymous: 401, dave: 201, member: 201 },
    },
    {
      id: 'AUTHZ-022',
      label: 'GET /api/uploads/:id/link',
      method: 'get',
      path: () => `/api/uploads/${uploadId}/link`,
      expect: ok,
    },
    {
      id: 'AUTHZ-023',
      label: 'GET /api/uploads/:id (signed)',
      method: 'get',
      path: () => `/api/uploads/${uploadId}?${uploadQuery}`,
      expect: ok,
    },
    {
      id: 'AUTHZ-024',
      label: 'GET /api/calls/ice-config',
      method: 'get',
      path: () => '/api/calls/ice-config',
      expect: { anonymous: 401, dave: 200, member: 200 },
    },
  ]
}

export function registerAuthorizationMatrixTests() {
  for (const row of routes()) {
    const verify = row.bug ? it.fails : it
    verify(`${row.id}${row.bug ? ` / ${row.bug}` : ''}: ${row.label}`, async () => {
      const actors = { anonymous: null, dave, member: row.member === 'bob' ? bob : alice }
      const cookies = row.cookies ? row.cookies() : {}
      const actual = {}
      const detail = {}

      for (const role of ['anonymous', 'dave', 'member']) {
        const req = request(app)[row.method](row.path())
        if (actors[role]) req.set(actors[role].header)
        if (cookies[role]) req.set('Cookie', cookies[role])
        if (row.attach) {
          req.attach('file', jpeg, { filename: 'authz.jpg', contentType: 'image/jpeg' })
        } else if (row.body) {
          req.send(row.body(role))
        }
        const res = await req
        actual[role] = res.status
        detail[role] = {
          status: res.status,
          code: res.body?.error?.code ?? null,
          keys: res.body && typeof res.body === 'object' ? Object.keys(res.body) : [],
        }
      }

      results.push({ id: row.id, label: row.label, expected: row.expect, actual, detail, bug: row.bug ?? null })
      console.log(`[authz] ${row.id} ${row.label} ${JSON.stringify(actual)}`)
      expect(actual, `${row.id} ${row.label}`).toEqual(row.expect)
    })
  }
}

describe('REST authorization matrix (anonymous / dave / owner-member)', () => {
  registerAuthorizationMatrixTests()

  it('AUTHZ-025: self-scoped routes return only the caller’s own data', async () => {
    const me = await request(app).get('/api/auth/me').set(dave.header)
    expect(me.status).toBe(200)
    expect(String(me.body.user._id)).toBe(ids.dave)

    const daveList = await request(app).get('/api/conversations').set(dave.header)
    expect(daveList.status).toBe(200)
    const daveConversationIds = daveList.body.conversations.map((conversation) => String(conversation._id))
    expect(daveConversationIds).not.toContain(ids.direct)
    for (const conversation of daveList.body.conversations) {
      expect(conversation.participants.map((participant) => String(participant.user))).toContain(ids.dave)
    }

    const aliceList = await request(app).get('/api/conversations').set(alice.header)
    expect(aliceList.body.conversations.map((conversation) => String(conversation._id))).toContain(ids.direct)
  })
})
