import { Router, Response } from 'express';
import db from '../services/db';
import { authenticateToken, requireRole, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// GET /api/users (List all registered users - Admin only)
router.get('/', authenticateToken, requireRole(['admin']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const users = await db.listUsers();
    return res.json(users);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to retrieve users: ' + err.message });
  }
});

// PUT /api/users/:email/role (Change user role - Admin only)
router.put('/:email/role', authenticateToken, requireRole(['admin']), async (req: AuthenticatedRequest, res: Response) => {
  const adminUser = req.user!;
  const targetEmail = req.params.email as string;
  const { role } = req.body;

  if (!role || !['admin', 'sales', 'service'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role. Must be admin, sales, or service' });
  }

  // Prevent admin from changing their own role (accidental lockout)
  if (targetEmail.toLowerCase() === adminUser.email.toLowerCase()) {
    return res.status(400).json({ error: 'You cannot change your own role.' });
  }

  try {
    const user = await db.getUser(targetEmail);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updatedUser = await db.updateUser(targetEmail, { role });

    // Audit Log
    await db.createAuditLog({
      user_email: adminUser.email,
      user_name: adminUser.name,
      action: 'edit',
      details: `Changed role of user ${targetEmail} from ${user.role} to ${role}`,
    });

    return res.json(updatedUser);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to update user role: ' + err.message });
  }
});

export default router;
