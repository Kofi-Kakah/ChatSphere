import { randomBytes } from 'node:crypto'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'

export function assertTestDatabaseName(name) {
  if (typeof name !== 'string' || !/test/i.test(name)) {
    throw new Error(`Refusing to use non-test database: ${String(name)}`)
  }
}

function databaseNameFromUri(uri) {
  const withoutQuery = uri.split('?')[0]
  return withoutQuery.slice(withoutQuery.lastIndexOf('/') + 1)
}

export async function startTestDatabase(label = 'qa') {
  const dbName = `chatsphere_test_${label}_${randomBytes(4).toString('hex')}`
  assertTestDatabaseName(dbName)

  const mongo = await MongoMemoryServer.create({ instance: { dbName } })
  const uri = mongo.getUri(dbName)
  assertTestDatabaseName(databaseNameFromUri(uri))

  await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 10_000 })
  assertTestDatabaseName(mongoose.connection.name)

  return {
    mongo,
    uri,
    name: mongoose.connection.name,
    async stop() {
      if (mongoose.connection.readyState !== 0) await mongoose.disconnect()
      await mongo.stop()
    },
  }
}
