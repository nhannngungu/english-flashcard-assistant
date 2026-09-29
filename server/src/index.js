import { fileURLToPath } from 'node:url'
import { createApp } from './app.js'
import { createDatabasePool, initializeDatabase } from './database.js'
import { createCloudinaryAvatarStorage } from './services/avatarStorage.js'

try {
  process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)))
} catch (error) {
  if (error.code !== 'ENOENT') console.warn(`Could not load server/.env: ${error.message}`)
}

async function startServer() {
  if (!process.env.DATABASE_URL?.trim()) throw new Error('DATABASE_URL is required. Add the Neon PostgreSQL connection string to server/.env.')
  if (!process.env.JWT_SECRET?.trim()) throw new Error('JWT_SECRET is required. Add a strong random secret to server/.env.')

  const database = createDatabasePool(process.env.DATABASE_URL)
  await initializeDatabase(database)
  const avatarStorage = createCloudinaryAvatarStorage({
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  })
  const app = createApp({ database, jwtSecret: process.env.JWT_SECRET, clientOrigins: process.env.CLIENT_ORIGIN, avatarStorage })
  const port = process.env.PORT || 3000
  app.listen(port, () => console.log(`Server is running at http://localhost:${port}`))
}

startServer().catch((error) => {
  console.error(`Server startup failed: ${error.message}`)
  process.exitCode = 1
})
