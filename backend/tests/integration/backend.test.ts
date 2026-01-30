import http from 'node:http';
import request from 'supertest';
import { beforeEach, describe, expect, test } from 'vitest';
import { createApp } from '../../src/api/server';
import { processClaimedEvent } from '../../src/worker/processor';
import { __testOnly, claimNextEvent } from '../../src/worker/worker';
import {
	getAttemptsByEventId,
	getEventById,
	getRuleExecutionsByAttemptId,
} from '../helpers/db';

let app: ReturnType<typeof createApp>;

const createRule = (payload: Record<string, unknown>) =>
	request(app).post('/rules').send(payload).expect(201);

const ingestEvent = (payload: Record<string, unknown>) =>
	request(app).post('/events').send(payload).expect(201);

const processNextEvent = async () => {
	const claim = await claimNextEvent();
	if (!claim) {
		throw new Error('Expected claim to be non-null');
	}
	await processClaimedEvent(claim);
	return claim.event.id;
};

beforeEach(() => {
	app = createApp();
});

describe('Backend integration flows', () => {
	test('ingestion -> processing success', async () => {
		const rulePayload = {
			name: 'log paid orders',
			event_type: 'order.created',
			condition: { '==': [{ var: 'status' }, 'paid'] },
			action: { type: 'log', params: { level: 'info', message: 'ok' } },
		};

		await createRule(rulePayload);

		const eventRes = await ingestEvent({
			id: 'evt-success',
			type: 'order.created',
			data: { status: 'paid' },
		});

		const eventId = eventRes.body.id as number;

		await processNextEvent();

		const event = await getEventById(eventId);
		expect(event?.state).toBe('processed');

		const attempts = await getAttemptsByEventId(eventId);
		expect(attempts).toHaveLength(1);
		expect(attempts[0].status).toBe('success');

		const executions = await getRuleExecutionsByAttemptId(attempts[0].id);
		expect(executions).toHaveLength(1);
		expect(executions[0].result).toBe('applied');
	});

	test('ingestion -> rule failure -> state failed', async () => {
		const server = http.createServer((_req, res) => {
			res.statusCode = 500;
			res.end('boom');
		});

		await new Promise<void>((resolve) => server.listen(0, resolve));
		const port = (server.address() as http.AddressInfo).port;
		const failingUrl = `http://127.0.0.1:${port}`;

		const rulePayload = {
			name: 'webhook failure',
			event_type: 'order.failed',
			condition: { '==': [{ var: 'kind' }, 'fail'] },
			action: {
				type: 'call_webhook',
				params: { url: failingUrl, method: 'POST' },
			},
		};

		try {
			await createRule(rulePayload);

			const eventRes = await ingestEvent({
				id: 'evt-fail',
				type: 'order.failed',
				data: { kind: 'fail' },
			});

			const eventId = eventRes.body.id as number;

			await processNextEvent();

			const event = await getEventById(eventId);
			expect(event?.state).toBe('failed');

			const attempts = await getAttemptsByEventId(eventId);
			expect(attempts).toHaveLength(1);
			expect(attempts[0].status).toBe('failed');

			const executions = await getRuleExecutionsByAttemptId(attempts[0].id);
			expect(executions[0].result).toBe('failed');
			expect(executions[0].error).toContain('Webhook failed with status');
		} finally {
			server.close();
		}
	});

	test('replay -> dedupe non idempotent actions', async () => {
		const rulePayload = {
			name: 'send welcome email',
			event_type: 'user.created',
			condition: { '==': [1, 1] },
			action: {
				type: 'send_email',
				params: {
					to: 'user@example.com',
					subject: 'Welcome!',
					template: 'welcome',
				},
			},
		};

		await createRule(rulePayload);

		const eventRes = await ingestEvent({
			id: 'evt-replay',
			type: 'user.created',
			data: { any: 'payload' },
		});

		const eventId = eventRes.body.id as number;

		await processNextEvent();

		const replayRes = await request(app)
			.post(`/events/${eventId}/replay`)
			.send()
			.expect(200);

		expect(replayRes.body.event.state).toBe('pending');

		await processNextEvent();

		const attempts = await getAttemptsByEventId(eventId);
		expect(attempts).toHaveLength(2);

		const firstExecs = await getRuleExecutionsByAttemptId(attempts[0].id);
		expect(firstExecs[0].result).toBe('applied');

		const secondExecs = await getRuleExecutionsByAttemptId(attempts[1].id);
		expect(secondExecs[0].result).toBe('deduped');

		const event = await getEventById(eventId);
		expect(event?.state).toBe('processed');
	});

	test('duplicate ingestion increments received_count without changing payload', async () => {
		const first = await ingestEvent({
			id: 'dup-1',
			type: 'order.created',
			data: { foo: 1 },
		});

		const second = await ingestEvent({
			id: 'dup-1',
			type: 'order.created',
			data: { foo: 999 }, // Deve ser ignorado
		});

		expect(first.body.received_count).toBe(1);
		expect(second.body.received_count).toBe(2);
		expect(first.body.id).toBe(second.body.id);

		const event = await getEventById(first.body.id);
		expect(event?.received_count).toBe(2);
		expect(event?.payload.foo).toBe(1);
		expect(event?.state).toBe('pending');
	});

	test('timeout -> attempt failed and event returns to pending', async () => {
		const eventRes = await ingestEvent({
			id: 'evt-timeout',
			type: 'timeout.event',
			data: {},
		});

		const claim = await claimNextEvent();
		expect(claim?.event.id).toBe(eventRes.body.id);

		const { withTimeout, handleTimeout } = __testOnly;

		let timeoutError: Error | null = null;
		try {
			await withTimeout(
				new Promise(() => {
					// Nunca resolve
				}),
				50,
				`Event processing (id=${claim!.event.id})`,
			);
		} catch (err) {
			timeoutError = err as Error;
		}

		expect(timeoutError).toBeTruthy();

		await handleTimeout(claim!, timeoutError!);

		const event = await getEventById(claim!.event.id);
		expect(event?.state).toBe('pending');
		expect(event?.processing_started_at).toBeNull();

		const attempts = await getAttemptsByEventId(claim!.event.id);
		expect(attempts).toHaveLength(1);
		expect(attempts[0].status).toBe('failed');
		expect(attempts[0].error).toContain('exceeded timeout');
	});
});
