import { Request, Response, NextFunction } from 'express'
import type { UserRole } from '@lendflow/shared'

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = res.locals.user
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    if (!roles.includes(user.role)) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }
    next()
  }
}

export const requireBorrower = requireRole('borrower')
export const requireLender = requireRole('lender')
export const requireAdmin = requireRole('admin')
