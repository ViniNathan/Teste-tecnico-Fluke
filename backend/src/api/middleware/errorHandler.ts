// backend/src/api/middleware/errorHandler.ts
import type { NextFunction, Request, Response } from 'express';
import { type core, ZodError } from 'zod';
import type { ErrorResponse, ValidationErrorDetail } from '../../types/api';
import { AppError } from '../../utils/errors';
import logger from '../../utils/logger';

function formatZodIssue(issue: core.$ZodIssue): ValidationErrorDetail {
	return {
		path: issue.path.join('.') || 'root',
		message: issue.message,
	};
}

export function errorHandler(
	err: Error,
	req: Request,
	res: Response,
	next: NextFunction,
): void {
	if (res.headersSent) {
		next(err);
		return;
	}

	const isDevelopment = process.env.NODE_ENV !== 'production';

	if (err instanceof ZodError) {
		logger.warn(
			{
				url: req.url,
				method: req.method,
				validationErrors: err.issues,
			},
			'Validation error',
		);

		const response: ErrorResponse = {
			error: 'ValidationError',
			message: 'Invalid request data',
			details: err.issues.map(formatZodIssue),
		};

		res.status(400).json(response);
		return;
	}

	if (err instanceof AppError) {
		const logLevel = err.statusCode >= 500 ? 'error' : 'warn';

		logger[logLevel](
			{
				url: req.url,
				method: req.method,
				statusCode: err.statusCode,
				message: err.message,
				isOperational: err.isOperational,
			},
			'Application error',
		);

		const response: ErrorResponse = {
			error: err.name,
			message: err.message,
			...(isDevelopment && { stack: err.stack }),
		};

		res.status(err.statusCode).json(response);
		return;
	}

	logger.error(
		{
			url: req.url,
			method: req.method,
			headers: req.headers,
			body: req.body,
			error: {
				name: err.name,
				message: err.message,
				stack: err.stack,
			},
		},
		'Unexpected error',
	);

	const response: ErrorResponse = {
		error: 'InternalServerError',
		message: isDevelopment ? err.message : 'An unexpected error occurred',
		...(isDevelopment && { stack: err.stack }),
	};

	res.status(500).json(response);
}
