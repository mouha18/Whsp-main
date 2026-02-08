import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import audioRoutes from './routes/audio.js'
import exportRoutes from './routes/export.js'
import { initDatabase, closeDatabase } from './services/database.js'

console.log('DB env check', { user: process.env.DB_USER, hasPassword: !!process.env.DB_PASSWORD });

const app = express()
const PORT = process.env.PORT || '3001'

// Middleware
app.use(helmet())
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'Whsp Backend API' })
})

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Audio API routes
app.use('/api/audio', audioRoutes)

// Export API routes
app.use('/api/export', exportRoutes)

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err)
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  })
})

// Initialize database and start server
async function startServer() {
  try {
    // Initialize database tables
    await initDatabase()
    console.log('Database initialized')

    // Start server
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`)
    })

  } catch (error) {
    console.error('Failed to start server:', error)
    process.exit(1)
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully')
  await closeDatabase()
  process.exit(0)
})

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully')
  await closeDatabase()
  process.exit(0)
})

startServer()

export default app
