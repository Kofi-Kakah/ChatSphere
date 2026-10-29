import { registerUser } from '../helpers/auth.js'

export const FIXTURE_NAMES = ['alice', 'bob', 'carol', 'dave', 'erin']

export async function createFixtureUsers(app) {
  const users = {}
  for (const name of FIXTURE_NAMES) {
    const created = await registerUser(app, { prefix: name, displayName: `${name} QA` })
    if (created.res.status !== 201) {
      throw new Error(`Failed to create fixture user ${name}: ${created.res.status}`)
    }
    users[name] = created
  }
  return users
}
