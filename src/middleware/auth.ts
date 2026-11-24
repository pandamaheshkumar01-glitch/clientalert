import { Request, Response, NextFunction } from 'express';
import { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth } from '../lib/firebase-admin.ts';
import { ensureOwnerProvisioned } from '../db/seed.ts';

export interface AuthRequest extends Request {
  user?: DecodedIdToken;
}

const provisionedOwners = new Set<string>();

export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing bearer token' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    req.user = decoded;

    if (!provisionedOwners.has(decoded.uid)) {
      await ensureOwnerProvisioned(
        decoded.uid,
        decoded.email || `${decoded.uid}@clientalert.app`,
        decoded.name || ''
      );
      provisionedOwners.add(decoded.uid);
    }

    next();
  } catch (err) {
    console.error('Firebase token verification error:', err);
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired session token' });
  }
};
