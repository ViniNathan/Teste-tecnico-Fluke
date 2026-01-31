import pino from 'pino';

const isDevelopment = process.env.NODE_ENV !== 'production';
const isTest = process.env.NODE_ENV === 'test';

const logLevel = process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info');

// Configuração base do logger
const baseConfig = {
	level: logLevel,
	timestamp: pino.stdTimeFunctions.isoTime,
	base: {
		pid: process.pid,
		hostname: process.env.HOSTNAME || 'unknown',
		environment: process.env.NODE_ENV || 'development',
	},
	formatters: {
		level: (label: string) => {
			return { level: label.toUpperCase() };
		},
	},
};

// Configuração para desenvolvimento
const developmentTransport = {
	target: 'pino-pretty',
	options: {
		colorize: true,
		translateTime: 'HH:MM:ss',
		ignore: 'pid,hostname,environment',
		singleLine: false,
		messageFormat: '{msg}',
	},
};

// Cria o logger com a configuração apropriada
const logger =
	isDevelopment && !isTest
		? pino({
				...baseConfig,
				transport: developmentTransport,
			})
		: pino(baseConfig);

if (isTest) {
	logger.level = 'silent';
}

// Cria um logger filho com contexto específico
export function createLogger(context: Record<string, unknown>) {
	return logger.child(context);
}

// Loga um erro com stack trace completo
export function logError(
	error: Error | unknown,
	context?: Record<string, unknown>,
) {
	const errorContext = {
		...context,
		error: {
			message: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined,
			name: error instanceof Error ? error.name : 'UnknownError',
		},
	};

	logger.error(errorContext, 'Error occurred');
}

// Loga uma requisição HTTP
export function logRequest(
	req: { method: string; url: string; headers: Record<string, unknown> },
	context?: Record<string, unknown>,
) {
	logger.info(
		{
			method: req.method,
			url: req.url,
			headers: sanitizeHeaders(req.headers),
			...context,
		},
		'HTTP Request',
	);
}

export function logResponse(
	req: { method: string; url: string },
	res: { statusCode: number; get(header: string): string | number | undefined },
	context?: Record<string, unknown>,
) {
	logger.info(
		{
			method: req.method,
			url: req.url,
			statusCode: res.statusCode,
			duration: res.get('X-Response-Time') || 'N/A',
			...context,
		},
		'HTTP Response',
	);
}

// Sanitiza os headers sensíveis antes de logar
function sanitizeHeaders(
	headers: Record<string, unknown>,
): Record<string, unknown> {
	const sanitized = { ...headers };
	const sensitiveKeys = ['authorization', 'cookie', 'x-api-key'];

	for (const key of sensitiveKeys) {
		if (sanitized[key]) {
			sanitized[key] = '[REDACTED]';
		}
	}

	return sanitized;
}

export default logger;
