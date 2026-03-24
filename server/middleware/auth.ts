import { type Request, type Response, type NextFunction } from "express";

/**
 * Express middleware that requires the request to be authenticated.
 * Returns 401 { error: "Not authenticated" } if the user is not logged in.
 * Calls next() if the user is authenticated.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.isAuthenticated()) {
    next();
    return;
  }
  res.status(401).json({ error: "Not authenticated" });
}
