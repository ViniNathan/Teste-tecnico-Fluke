import 'dotenv/config';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { pool } from '../src/db/client';
import { resetDatabase } from './helpers/db';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
	process.env.TEST_DATABASE_URL ??
	process.env.DATABASE_URL ??
	'postgresql://postgres:postgres@localhost:5432/event_platform';
process.env.EMAIL_MODE = 'log';
process.env.WORKER_POLL_INTERVAL_MS =
	process.env.WORKER_POLL_INTERVAL_MS ?? '50';
process.env.PROCESSING_TIMEOUT_MS = process.env.PROCESSING_TIMEOUT_MS ?? '200';
process.env.WEBHOOK_TIMEOUT_MS = process.env.WEBHOOK_TIMEOUT_MS ?? '500';

const projectRoot = path.resolve(__dirname, '..');

beforeAll(() => {
	execSync('npm run db:up', {
		cwd: projectRoot,
		stdio: 'inherit',
		env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
	});
});

beforeEach(async () => {
	await resetDatabase();
});

afterAll(async () => {
	await resetDatabase();
	await pool.end();
});
