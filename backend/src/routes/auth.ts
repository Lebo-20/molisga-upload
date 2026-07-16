import { Router, Response } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import db from '../services/db';
import { verifyGoogleToken } from '../services/google';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'local_development_secret_key_12345';

// Helper to hash password securely
function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password + JWT_SECRET).digest('hex');
}

// POST /api/auth/google
router.post('/google', async (req, res) => {
  const { idToken } = req.body;

  if (!idToken) {
    return res.status(400).json({ error: 'idToken is required' });
  }

  try {
    // 1. Verify token with Google
    const googleUser = await verifyGoogleToken(idToken);

    // 2. Check if user exists in database
    let user = await db.getUser(googleUser.email);
    let isNewUser = false;

    if (!user) {
      isNewUser = true;
      // Fetch all users to see if this is the first user
      const allUsers = await db.listUsers();
      const role = allUsers.length === 0 ? 'admin' : 'sales'; // First user is Admin, others default to Sales

      user = {
        id: googleUser.googleId,
        email: googleUser.email,
        name: googleUser.name,
        avatar_url: googleUser.picture,
        role,
        created_at: new Date().toISOString(),
      };

      await db.createUser(user);
      
      // Log the registration audit trail
      await db.createAuditLog({
        user_email: user.email,
        user_name: user.name,
        action: 'login',
        details: `Registered new user with automatic role: ${role}`,
      });
    } else {
      // Update avatar or name if they changed on Google
      if (user.name !== googleUser.name || user.avatar_url !== googleUser.picture) {
        user = await db.updateUser(user.email, {
          name: googleUser.name,
          avatar_url: googleUser.picture,
        });
      }
    }

    // 3. Create JWT Session
    const token = jwt.sign(
      {
        email: user.email,
        name: user.name,
        role: user.role,
        avatar_url: user.avatar_url,
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Log the login audit trail
    if (!isNewUser) {
      await db.createAuditLog({
        user_email: user.email,
        user_name: user.name,
        action: 'login',
        details: 'User logged in successfully via Google OAuth',
      });
    }

    return res.json({
      token,
      user: {
        email: user.email,
        name: user.name,
        role: user.role,
        avatar_url: user.avatar_url,
      },
    });
  } catch (err: any) {
    console.error('[Auth API] Google Login Error:', err.message);
    return res.status(401).json({ error: 'Authentication failed: ' + err.message });
  }
});

// GET /api/auth/me
router.get('/me', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const user = await db.getUser(req.user.email);
    if (!user) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    return res.json({
      email: user.email,
      name: user.name,
      role: user.role,
      avatar_url: user.avatar_url,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to retrieve profile: ' + err.message });
  }
});

// POST /api/auth/register (Public registration for initial setup or Admin panel)
router.post('/register', async (req, res) => {
  const { email, password, name, role } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Email, password, and name are required' });
  }

  try {
    const existingUser = await db.getUser(email);
    if (existingUser) {
      return res.status(400).json({ error: 'Email has already been registered' });
    }

    // Determine role (first user becomes Admin, otherwise defaults to Sales if not specified)
    const allUsers = await db.listUsers();
    const finalRole = allUsers.length === 0 ? 'admin' : (role || 'sales');

    const newUser = {
      id: crypto.randomUUID(),
      email: email.toLowerCase(),
      name,
      avatar_url: `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(name)}`,
      role: finalRole,
      password_hash: hashPassword(password),
      created_at: new Date().toISOString(),
    };

    await db.createUser(newUser);

    // Audit Log
    await db.createAuditLog({
      user_email: newUser.email,
      user_name: newUser.name,
      action: 'login',
      details: `Registered new email/password account with role: ${finalRole}`,
    });

    // Create JWT
    const token = jwt.sign(
      {
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
        avatar_url: newUser.avatar_url,
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(201).json({
      token,
      user: {
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
        avatar_url: newUser.avatar_url,
      },
    });
  } catch (err: any) {
    console.error('[Auth API] Register error:', err.message);
    return res.status(500).json({ error: 'Registration failed: ' + err.message });
  }
});

// POST /api/auth/login (Email & Password Login)
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const user = await db.getUser(email);
    if (!user || !user.password_hash) {
      return res.status(401).json({ error: 'Email atau password salah' });
    }

    const inputHash = hashPassword(password);
    if (inputHash !== user.password_hash) {
      return res.status(401).json({ error: 'Email atau password salah' });
    }

    // Create JWT Session
    const token = jwt.sign(
      {
        email: user.email,
        name: user.name,
        role: user.role,
        avatar_url: user.avatar_url,
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Audit Log
    await db.createAuditLog({
      user_email: user.email,
      user_name: user.name,
      action: 'login',
      details: 'User logged in via Email & Password',
    });

    return res.json({
      token,
      user: {
        email: user.email,
        name: user.name,
        role: user.role,
        avatar_url: user.avatar_url,
      },
    });
  } catch (err: any) {
    console.error('[Auth API] Login error:', err.message);
    return res.status(500).json({ error: 'Login failed: ' + err.message });
  }
});

export default router;
