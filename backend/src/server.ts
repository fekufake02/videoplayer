import express, { Request, Response, NextFunction } from 'express';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import { connectDB } from './config/db';
import { ensureAdminUser } from './controllers/authController';
import routes from './routes';

const app = express();

// HTTP Security Headers
app.use(
  helmet({
    contentSecurityPolicy: false, // Let frontend handle CSP or disable in dev
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// Restricted CORS
app.use(
  cors({
    origin: config.frontendUrl,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Secure Session Cookie Config
app.use(
  session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    name: 'videoplayer.sid',
    cookie: {
      httpOnly: true,
      secure: config.isProd,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    },
  })
);

// Mount API Routes
app.use('/api', routes);

// 404 Route Handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Cannot ${req.method} ${req.path}`,
    },
  });
});

// Centralized Error Handling Middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled Server Error:', err);
  res.status(err.status || 500).json({
    success: false,
    error: {
      code: err.code || 'INTERNAL_SERVER_ERROR',
      message: config.isProd ? 'An unexpected error occurred.' : err.message || 'Internal server error',
    },
  });
});

// Initialize database and start listening if not in test environment
if (process.env.NODE_ENV !== 'test') {
  connectDB().then(async () => {
    await ensureAdminUser();
    app.listen(config.port, () => {
      console.log(`Private Video Library Backend running on ${config.backendUrl}`);
    });
  });
}

export default app;
