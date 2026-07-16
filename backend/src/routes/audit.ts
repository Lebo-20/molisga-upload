import { Router, Response } from 'express';
import db from '../services/db';
import { authenticateToken, requireRole, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// GET /api/audit (List all activity logs - Admin only)
router.get('/', authenticateToken, requireRole(['admin']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const logs = await db.listAuditLogs();
    return res.json(logs);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to retrieve audit logs: ' + err.message });
  }
});

export default router;
