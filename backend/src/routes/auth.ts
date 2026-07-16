import { Router, Response } from 'express';
import jwt from 'jsonwebtoken';
import db from '../services/db';
import { verifyGoogleToken } from '../services/google';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'local_development_secret_key_12345';

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

export default router;
