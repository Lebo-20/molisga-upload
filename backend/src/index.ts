import dotenv from 'dotenv';
// Load environment variables first
dotenv.config();

import express from 'express';
import cors from 'cors';
import path from 'path';

import authRouter from './routes/auth';
import uploadRouter from './routes/upload';
import reportsRouter from './routes/reports';
import usersRouter from './routes/users';
import auditRouter from './routes/audit';

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS for frontend client
const allowedOrigins = [
  'https://molisgemilang.my.id',
  'https://www.molisgemilang.my.id',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS policy: origin ${origin} is not allowed`));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// Parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static uploaded files (if any local backup needs to be read)
app.use('/data', express.static(path.join(__dirname, '../data')));

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/users', usersRouter);
app.use('/api/audit', auditRouter);

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    db_type: process.env.DB_TYPE || 'local',
    platform: process.env.VERCEL ? 'vercel' : 'self-hosted',
  });
});

// Vercel: export app as serverless handler
// Railway / Local: start listening normally
if (process.env.VERCEL) {
  // Vercel serverless — just export the app
  module.exports = app;
} else {
  app.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(` MOLIS REPORT SYSTEM BACKEND IS RUNNING `);
    console.log(` Port: ${PORT} `);
    console.log(` Environment: ${process.env.NODE_ENV || 'development'} `);
    console.log(` Database Mode: ${process.env.DB_TYPE || 'local'} `);
    console.log(`==================================================`);
  });
}

export default app;
