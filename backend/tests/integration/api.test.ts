import http from 'node:http';
import request from 'supertest';
import { beforeEach, describe, expect, test } from 'vitest';
import { createApp } from '../../src/api/server';
import { pool } from '../../src/db/client';
import { processClaimedEvent } from '../../src/worker/processor';
import { claimNextEvent } from '../../src/worker/worker';
import {
	getAttemptsByEventId,
	getEventById,
	getRuleExecutionsByAttemptId,
	insertEvent,
} from '../helpers/db';

let app: ReturnType<typeof createApp>;

const createRule = (payload: Record<string, unknown>) =>
	request(app).post('/rules').send(payload).expect(201);

const ingestEvent = (payload: Record<string, unknown>) =>
	request(app).post('/events').send(payload).expect(201);

const processNextEvent = async () => {
	const claim = await claimNextEvent();
	if (!claim) throw new Error('No event to process');
	await processClaimedEvent(claim);
	return claim.event.id;
};

beforeEach(() => {
	app = createApp();
});

describe('API surface', () => {
	test('health check', async () => {
		const res = await request(app).get('/health').expect(200);
		expect(res.body.status).toBe('ok');
	});

	test('event payload validation error', async () => {
		const res = await request(app).post('/events').send({}).expect(400);
		expect(res.body.error).toBe('ValidationError');
	});

	test('list events with filters and not found handling', async () => {
		await ingestEvent({ id: 'a', type: 't1', data: {} });
		await ingestEvent({ id: 'b', type: 't2', data: {} });

		const list = await request(app)
			.get('/events')
			.query({ type: 't1', state: 'pending', limit: 1, offset: 0 })
			.expect(200);

		expect(list.body.count).toBe(1);
		expect(list.body.data[0].type).toBe('t1');

		await request(app).get('/events/9999').expect(404);
	});

	test('event attempts endpoint returns rule executions', async () => {
		await createRule({
			name: 'log anything',
			event_type: 'anything',
			condition: { '==': [1, 1] },
			action: { type: 'log', params: { level: 'info', message: 'hey' } },
		});

		const event = await ingestEvent({
			id: 'evt-attempts',
			type: 'anything',
			data: {},
		});

		await processNextEvent();

		const attempts = await request(app)
			.get(`/events/${event.body.id}/attempts`)
			.expect(200);

		expect(attempts.body.count).toBe(1);
		const attempt = attempts.body.data[0];
		expect(attempt.rule_executions).toHaveLength(1);
		expect(typeof attempt.duration_ms).toBe('number');
		expect(attempt.rule_executions[0].rule_version).toBe(1);
	});

	test('events stats returns aggregated counts and respects filters', async () => {
		const pendingId = await insertEvent({
			external_id: 'pending-1',
			type: 'alpha',
			state: 'pending',
		});
		expect(pendingId).toBeGreaterThan(0);

		await insertEvent({
			external_id: 'processing-1',
			type: 'alpha',
			state: 'processing',
			processing_started_at: new Date(),
		});

		const failedRecent = await insertEvent({
			external_id: 'failed-new',
			type: 'beta',
			state: 'failed',
		});
		await pool.query('UPDATE events SET processed_at = NOW() WHERE id = $1', [
			failedRecent,
		]);

		const failedOld = await insertEvent({
			external_id: 'failed-old',
			type: 'beta',
			state: 'failed',
		});
		await pool.query(
			`UPDATE events 
       SET processed_at = NOW() - INTERVAL '3 days',
           created_at = NOW() - INTERVAL '3 days'
       WHERE id = $1`,
			[failedOld],
		);

		const stats = await request(app).get('/events/stats').expect(200);

		expect(stats.body.total).toBe(4);
		expect(stats.body.pending).toBe(1);
		expect(stats.body.processing).toBe(1);
		expect(stats.body.failed).toBe(2);
		expect(stats.body.failed_last_24h).toBe(1);

		const filtered = await request(app)
			.get('/events/stats')
			.query({ type: 'alpha' })
			.expect(200);

		expect(filtered.body.total).toBe(2);
		expect(filtered.body.pending).toBe(1);
		expect(filtered.body.processing).toBe(1);
		expect(filtered.body.failed_last_24h).toBe(0);
	});

	test('list events supports date range filtering', async () => {
		const recent = await insertEvent({
			external_id: 'recent',
			type: 'range-test',
			state: 'pending',
		});
		const older = await insertEvent({
			external_id: 'older',
			type: 'range-test',
			state: 'pending',
		});

		await pool.query(
			`UPDATE events SET created_at = NOW() - INTERVAL '5 days' WHERE id = $1`,
			[older],
		);

		const startDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
			.toISOString()
			.slice(0, 10);

		const list = await request(app)
			.get('/events')
			.query({ type: 'range-test', start_date: startDate })
			.expect(200);

		expect(list.body.count).toBe(1);
		expect(list.body.data[0].id).toBe(recent);
	});
});

describe('Rules CRUD and versioning', () => {
	test('create, list, get, update (new version), deactivate, versions', async () => {
		const createRes = await createRule({
			name: 'rule v1',
			event_type: 'signup',
			condition: { '==': [1, 1] },
			action: { type: 'noop', params: {} },
		});

		const ruleId = createRes.body.id as number;
		expect(createRes.body.current_version.version).toBe(1);

		const list = await request(app).get('/rules').expect(200);
		expect(list.body.count).toBe(1);

		const get = await request(app).get(`/rules/${ruleId}`).expect(200);
		expect(get.body.id).toBe(ruleId);

		const update = await request(app)
			.put(`/rules/${ruleId}`)
			.send({
				condition: { '==': [2, 2] },
				action: { type: 'log', params: { level: 'warn', message: 'v2' } },
				active: true,
			})
			.expect(200);

		expect(update.body.current_version.version).toBe(2);
		expect(update.body.current_version.action.params.message).toBe('v2');

		const versions = await request(app)
			.get(`/rules/${ruleId}/versions`)
			.expect(200);
		expect(versions.body.versions).toHaveLength(2);
		expect(versions.body.versions[0].version).toBe(2);
		expect(versions.body.versions[1].version).toBe(1);

		const deactivate = await request(app)
			.delete(`/rules/${ruleId}`)
			.expect(200);
		expect(deactivate.body.rule.active).toBe(false);
	});

	test('invalid JSONLogic condition rejected', async () => {
		await request(app)
			.post('/rules')
			.send({
				name: 'bad rule',
				event_type: 'x',
				condition: { unknown_op: true },
				action: { type: 'noop', params: {} },
			})
			.expect(400);
	});
});

describe('Replay and requeue flows', () => {
	test('replay batch queues processed events', async () => {
		await createRule({
			name: 'noop',
			event_type: 'batch',
			condition: { '==': [1, 1] },
			action: { type: 'noop', params: {} },
		});

		const e1 = await ingestEvent({ id: 'b1', type: 'batch', data: {} });
		const e2 = await ingestEvent({ id: 'b2', type: 'batch', data: {} });

		await processNextEvent();
		await processNextEvent();

		const replayBatch = await request(app)
			.post('/events/replay-batch')
			.send({ event_ids: [e1.body.id, e2.body.id] })
			.expect(200);

		expect(replayBatch.body.replayed).toBe(2);

		const after1 = await getEventById(e1.body.id);
		const after2 = await getEventById(e2.body.id);
		expect(after1?.state).toBe('pending');
		expect(after2?.state).toBe('pending');
	});

	test('replay conflict for non replayable state', async () => {
		const e = await ingestEvent({ id: 'pending-1', type: 't', data: {} });
		await request(app).post(`/events/${e.body.id}/replay`).expect(409);
	});

	test('requeue-stuck moves old processing events back to pending', async () => {
		const processingId = await insertEvent({
			external_id: 'proc-1',
			type: 't',
			state: 'processing',
			processing_started_at: new Date(Date.now() - 600_000),
		});

		const res = await request(app)
			.post('/events/requeue-stuck')
			.send({ older_than_seconds: 300 })
			.expect(200);

		expect(res.body.requeued).toBe(1);

		const evt = await getEventById(processingId);
		expect(evt?.state).toBe('pending');
		expect(evt?.processing_started_at).toBeNull();
	});
});

describe('Action semantics', () => {
	test('idempotent log action runs on replay (no dedupe)', async () => {
		await createRule({
			name: 'log always',
			event_type: 'idempotent',
			condition: { '==': [1, 1] },
			action: { type: 'log', params: { level: 'info', message: 'hi' } },
		});

		const evt = await ingestEvent({
			id: 'idem-1',
			type: 'idempotent',
			data: {},
		});

		await processNextEvent();

		await request(app).post(`/events/${evt.body.id}/replay`).expect(200);
		await processNextEvent();

		const attempts = await getAttemptsByEventId(evt.body.id);
		expect(attempts).toHaveLength(2);

		const exec1 = await getRuleExecutionsByAttemptId(attempts[0].id);
		const exec2 = await getRuleExecutionsByAttemptId(attempts[1].id);

		expect(exec1[0].result).toBe('applied');
		expect(exec2[0].result).toBe('applied');
	});

	test('webhook success path processes event', async () => {
		const server = http.createServer((_req, res) => {
			res.statusCode = 200;
			res.end('ok');
		});
		await new Promise<void>((resolve) => server.listen(0, resolve));
		const port = (server.address() as http.AddressInfo).port;
		const url = `http://127.0.0.1:${port}`;

		try {
			await createRule({
				name: 'webhook ok',
				event_type: 'hook',
				condition: { '==': [1, 1] },
				action: { type: 'call_webhook', params: { url, method: 'POST' } },
			});

			const evt = await ingestEvent({ id: 'hook-1', type: 'hook', data: {} });
			const eventId = evt.body.id as number;

			await processNextEvent();

			const attempts = await getAttemptsByEventId(eventId);
			expect(attempts[0].status).toBe('success');

			const exec = await getRuleExecutionsByAttemptId(attempts[0].id);
			expect(exec[0].result).toBe('applied');
		} finally {
			server.close();
		}
	});
});
