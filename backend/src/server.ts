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

// Enable trust proxy for Render / Vercel proxy headers
app.set('trust proxy', 1);

// HTTP Security Headers
app.use(
  helmet({
    contentSecurityPolicy: false, // Let frontend handle CSP
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// Dynamic CORS allowing Vercel previews and configured frontend URL
app.use(
  cors({
    origin: (origin, callback) => {
      if (
        !origin ||
        origin === config.frontendUrl ||
        origin.endsWith('.vercel.app') ||
        origin.includes('localhost')
      ) {
        callback(null, true);
      } else {
        callback(null, true);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Secure Session Cookie Config for Render <-> Vercel Cross-Site
const isDeployed = config.isProd || process.env.RENDER === 'true';

app.use(
  session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    name: 'videoplayer.sid',
    cookie: {
      httpOnly: true,
      secure: isDeployed,
      sameSite: isDeployed ? 'none' : 'lax',
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
  const port = config.port || 10000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`Private Video Library Backend running on port ${port}`);
    connectDB().then(async () => {
      await ensureAdminUser();
    }).catch((err) => {
      console.error('DB init warning:', err);
    });
  });
}

export default app;
