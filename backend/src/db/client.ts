import { Pool, type QueryResult, type QueryResultRow } from 'pg';
import 'dotenv/config';

const isTestEnv = process.env.NODE_ENV === 'test';

// Configuração do Pool
const pool = new Pool({
	connectionString: process.env.DATABASE_URL,
	max: 20,
	idleTimeoutMillis: 30000,
	connectionTimeoutMillis: 2000,
});

// Listener de erros no nível do pool
pool.on('error', (err, _client) => {
	console.error('Erro inesperado no cliente PostgreSQL', err);
	if (!isTestEnv) {
		process.exit(-1); // Fail fast
	}
});

// Wrapper para tipagem e logs centralizados (ajuda no debug)
export const db = {
	query: async <T extends QueryResultRow = QueryResultRow>(
		text: string,
		params?: unknown[],
	): Promise<QueryResult<T>> => {
		console.log('Executando query:', { text, params });
		return pool.query<T>(text, params);
	},

	pool,
};

// Teste r�pido de conex�o ao iniciar (para fail-fast)
if (!isTestEnv) {
	pool
		.query('SELECT NOW()')
		.then(() => {
			console.log('? Connected to PostgreSQL');
		})
		.catch((err) => {
			console.error('? Failed to connect to PostgreSQL:', err);
		});
}

export { pool };
