import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'local_development_secret_key_12345';

export interface AuthenticatedRequest extends Request {
  user?: {
    email: string;
    name: string;
    role: 'admin' | 'sales' | 'service';
    avatar_url: string;
  };
}

// Middleware to authenticate JWT token
export function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <TOKEN>

  if (!token) {
    return res.status(401).json({ error: 'Authentication token missing. Please login.' });
  }

  jwt.verify(token, JWT_SECRET, (err: any, decoded: any) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired authentication session. Please re-login.' });
    }
    req.user = decoded;
    next();
  });
}

// Middleware to enforce role-based access
export function requireRole(allowedRoles: ('admin' | 'sales' | 'service')[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized.' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: `Forbidden. Access requires one of the following roles: ${allowedRoles.join(', ')}` });
    }

    next();
  };
}
