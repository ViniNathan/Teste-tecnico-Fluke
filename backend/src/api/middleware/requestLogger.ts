// backend/src/api/middleware/requestLogger.ts
import type { NextFunction, Request, Response } from 'express';
import { createLogger } from '../../utils/logger';

const httpLogger = createLogger({ module: 'http' });

/**
 * Request logging middleware
 */
export function requestLoggingMiddleware(
	req: Request,
	res: Response,
	next: NextFunction,
): void {
	const startTime = Date.now();

	httpLogger.info(
		{
			method: req.method,
			url: req.url,
			userAgent: req.headers['user-agent'],
			ip: req.ip,
		},
		'Incoming request',
	);

	// Intercept res.end to log response
	const originalEnd = res.end.bind(res);

	res.end = function (this: Response, ...args: any[]): Response {
		const duration = Date.now() - startTime;

		httpLogger.info(
			{
				method: req.method,
				url: req.url,
				statusCode: res.statusCode,
				duration: `${duration}ms`,
			},
			'Request completed',
		);

		return originalEnd(...args);
	} as any;

	next();
}
