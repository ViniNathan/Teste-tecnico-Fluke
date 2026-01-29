// backend/src/api/server.ts
import express, { type Express } from 'express';
import cors from 'cors';
import { pool } from '../db/client';
import logger from '../utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { requestLoggingMiddleware } from './middleware/requestLogger';
import { eventsRouter } from './routes/events';
import { replayRouter } from './routes/replay';
import { rulesRouter } from './routes/rules';

// Cria e configura o app Express
function createApp(): Express {
	const app = express();

	// MIDDLEWARE
	// 1. Request logging (primeiro para capturar tudo)
	app.use(requestLoggingMiddleware);

	// 2. CORS
	const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3001')
		.split(',')
		.map((origin) => origin.trim())
		.filter(Boolean);

	app.use(
		cors({
			origin: corsOrigins,
			credentials: true,
		}),
	);

	// 3. Parsing do body
	app.use(express.json({ limit: '1mb' }));
	app.use(express.urlencoded({ extended: true }));

	// 4. Health check (antes das rotas principais)
	app.get('/health', (req, res) => {
		res.json({ status: 'ok', timestamp: new Date().toISOString() });
	});

	// ROTAS
	app.use('/events', eventsRouter);
	app.use('/rules', rulesRouter);
	app.use('/events', replayRouter); // POST /events/:id/replay

	// 404 handler (se nenhuma rota matchou)
	app.use((req, res) => {
		res.status(404).json({
			error: 'Not Found',
			message: `Route ${req.method} ${req.url} not found`,
		});
	});

	// ERROR HANDLER
	app.use(errorHandler);

	return app;
}

// Inicia o servidor com shutdown gracefully
async function startServer() {
	const PORT = process.env.PORT || 3000;
	const app = createApp();

	// Testa a conexão com o banco de dados antes de iniciar
	try {
		logger.info('Testing database connection...');
		await pool.query('SELECT NOW()');
		logger.info('Database connected successfully');
	} catch (err) {
		logger.fatal({ error: err }, 'Failed to connect to database');
		process.exit(1);
	}

	// Inicia o servidor
	const server = app.listen(PORT, () => {
		logger.info({ port: PORT }, 'Server started successfully');
	});

	// GRACEFUL SHUTDOWN
	const shutdown = async (signal: string) => {
		logger.info({ signal }, 'Shutdown signal received');

		// Para de aceitar novas conexões
		server.close(async () => {
			logger.info('HTTP server closed');

			try {
				// Fecha o pool de conexões com o banco de dados
				logger.info('Closing database connections...');
				await pool.end();
				logger.info('Database connections closed');

				logger.info('Graceful shutdown completed');
				process.exit(0);
			} catch (err) {
				logger.error({ error: err }, 'Error during shutdown');
				process.exit(1);
			}
		});

		// Força o shutdown após 10 segundos se o shutdown gracefully hangar
		setTimeout(() => {
			logger.error('Graceful shutdown timed out, forcing exit');
			process.exit(1);
		}, 10000);
	};

	// Escuta por sinais de shutdown
	process.on('SIGTERM', () => shutdown('SIGTERM'));
	process.on('SIGINT', () => shutdown('SIGINT'));

	// Gerencia erros não tratados
	process.on('uncaughtException', (err) => {
		logger.fatal({ error: err }, 'Uncaught exception');
		shutdown('UNCAUGHT_EXCEPTION');
	});

	process.on('unhandledRejection', (reason, promise) => {
		logger.fatal({ reason, promise }, 'Unhandled promise rejection');
		shutdown('UNHANDLED_REJECTION');
	});
}

// Inicia o servidor se este arquivo for executado diretamente
if (require.main === module) {
	startServer().catch((err) => {
		logger.fatal({ error: err }, 'Failed to start server');
		process.exit(1);
	});
}

export { createApp, startServer };
