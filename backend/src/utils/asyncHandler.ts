import { Request, Response, NextFunction, RequestHandler } from 'express'

/**
 * Wraps an async Express route handler so that any unhandled promise rejection
 * is forwarded to next(err) — hitting the global error middleware — rather than
 * hanging the request or causing an UnhandledPromiseRejection crash.
 *
 * Usage in route files:
 *   router.get('/path', asyncHandler(MyController.method))
 *
 * Express 4 does NOT automatically catch rejected async handlers; Express 5 does.
 * Until we upgrade, wrap all async route handlers with this utility.
 */
export function asyncHandler(
  fn: (req: any, res: Response, next: NextFunction) => Promise<any>
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}
