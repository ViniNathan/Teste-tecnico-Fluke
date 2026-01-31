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

describe('Critical Edge Cases', () => {
	describe('Concurrent duplicate ingestion (race condition)', () => {
		test('simultaneous requests with same external_id increment received_count', async () => {
			const externalId = `concurrent-${Date.now()}`;
			const payload1 = { id: externalId, type: 'race', data: { value: 1 } };
			const payload2 = { id: externalId, type: 'race', data: { value: 2 } };

			// Dispara dois requests simultaneamente
			const [res1, res2] = await Promise.all([
				ingestEvent(payload1),
				ingestEvent(payload2),
			]);

			// Ambos devem retornar 201
			expect(res1.status).toBe(201);
			expect(res2.status).toBe(201);

			// Devem ter o mesmo ID (mesmo evento)
			expect(res1.body.id).toBe(res2.body.id);

			// received_count deve ser 2
			const event = await getEventById(res1.body.id);
			expect(event?.received_count).toBe(2);

			// Payload prevalece do primeiro (value: 1)
			expect(event?.payload.value).toBe(1);

			// Estado deve ser pending (não duplicou processamento)
			expect(event?.state).toBe('pending');
		});

		test('10 simultaneous duplicates handled correctly', async () => {
			const externalId = `stress-${Date.now()}`;
			const promises = Array.from({ length: 10 }, (_, i) =>
				ingestEvent({
					id: externalId,
					type: 'stress',
					data: { attempt: i },
				}),
			);

			const results = await Promise.all(promises);

			// Todas retornam o mesmo event ID
			const ids = results.map((r) => r.body.id);
			expect(new Set(ids).size).toBe(1);

			const event = await getEventById(ids[0]);
			expect(event?.received_count).toBe(10);
			expect(event?.state).toBe('pending');
		});
	});

	describe('Worker claim isolation (FOR UPDATE SKIP LOCKED)', () => {
		test('two simultaneous claims only one succeeds', async () => {
			await ingestEvent({ id: 'skip-locked', type: 't', data: {} });

			// Simula dois workers tentando claim simultaneamente
			const [claim1, claim2] = await Promise.all([
				claimNextEvent(),
				claimNextEvent(),
			]);

			// Apenas um deve ter sucesso
			const successCount = [claim1, claim2].filter(Boolean).length;
			expect(successCount).toBe(1);

			const successClaim = claim1 || claim2;
			if (!successClaim) throw new Error('Expected one claim');

			// O claim bem-sucedido deve ter marcado evento como processing
			const event = await getEventById(successClaim.event.id);
			expect(event?.state).toBe('processing');
		});

		test('second claim skips locked event', async () => {
			await ingestEvent({ id: 'evt-1', type: 't', data: {} });
			await ingestEvent({ id: 'evt-2', type: 't', data: {} });

			// Primeiro worker pega evt-1
			const claim1 = await claimNextEvent();
			expect(claim1).toBeTruthy();

			// Segundo worker deve pegar evt-2 (primeiro ainda processando)
			const claim2 = await claimNextEvent();
			expect(claim2).toBeTruthy();

			// Claims diferentes
			expect(claim1!.event.id).not.toBe(claim2!.event.id);
		});
	});

	describe('Replay with rule version changes', () => {
		test('replay after rule update creates new execution (no dedupe)', async () => {
			const rule = await createRule({
				name: 'versioned webhook',
				event_type: 'versioned',
				condition: { '==': [1, 1] },
				action: {
					type: 'send_email',
					params: { to: 'v1@test.com', subject: 'v1', template: 'tpl' },
				},
			});

			const evt = await ingestEvent({
				id: 'version-test',
				type: 'versioned',
				data: {},
			});

			// Processa com v1
			await processNextEvent();

			const attempts1 = await getAttemptsByEventId(evt.body.id);
			const exec1 = await getRuleExecutionsByAttemptId(attempts1[0].id);
			expect(exec1[0].result).toBe('applied');

			// Atualiza regra para v2
			await request(app)
				.put(`/rules/${rule.body.id}`)
				.send({
					action: {
						type: 'send_email',
						params: { to: 'v2@test.com', subject: 'v2', template: 'tpl' },
					},
				})
				.expect(200);

			// Replay
			await request(app).post(`/events/${evt.body.id}/replay`).expect(200);
			await processNextEvent();

			const attempts2 = await getAttemptsByEventId(evt.body.id);
			expect(attempts2).toHaveLength(2);

			const exec2 = await getRuleExecutionsByAttemptId(attempts2[1].id);
			// Email é executado novamente porque rule_version_id mudou
			expect(exec2[0].result).toBe('applied');
		});

		test('replay with same rule version dedupes non-idempotent action', async () => {
			await createRule({
				name: 'webhook no change',
				event_type: 'nochange',
				condition: { '==': [1, 1] },
				action: {
					type: 'send_email',
					params: { to: 'test@example.com', subject: 'hi', template: 'tpl' },
				},
			});

			const evt = await ingestEvent({
				id: 'nochange-test',
				type: 'nochange',
				data: {},
			});

			await processNextEvent();

			// Replay sem mudar regra
			await request(app).post(`/events/${evt.body.id}/replay`).expect(200);
			await processNextEvent();

			const attempts = await getAttemptsByEventId(evt.body.id);
			const exec1 = await getRuleExecutionsByAttemptId(attempts[0].id);
			const exec2 = await getRuleExecutionsByAttemptId(attempts[1].id);

			expect(exec1[0].result).toBe('applied');
			expect(exec2[0].result).toBe('deduped'); // Não executa novamente
		});
	});

	describe('Rule failure isolation', () => {
		test('one rule fails, others still execute', async () => {
			// Create HTTP server that returns 500
			const http = await import('node:http');
			const server = http.createServer((_req, res) => {
				res.statusCode = 500;
				res.end('Internal Server Error');
			});

			await new Promise<void>((resolve) => server.listen(0, resolve));
			const port = (server.address() as http.AddressInfo).port;
			const failingUrl = `http://127.0.0.1:${port}`;

			try {
				await createRule({
					name: 'rule 1 - log',
					event_type: 'multi',
					condition: { '==': [1, 1] },
					action: { type: 'log', params: { level: 'info', message: 'ok' } },
				});

				await createRule({
					name: 'rule 2 - bad webhook',
					event_type: 'multi',
					condition: { '==': [1, 1] },
					action: {
						type: 'call_webhook',
						params: { url: failingUrl, method: 'POST' },
					},
				});

				await createRule({
					name: 'rule 3 - log',
					event_type: 'multi',
					condition: { '==': [1, 1] },
					action: { type: 'log', params: { level: 'warn', message: 'final' } },
				});

				const evt = await ingestEvent({
					id: 'multi-fail',
					type: 'multi',
					data: {},
				});

				await processNextEvent();

				const attempts = await getAttemptsByEventId(evt.body.id);
				expect(attempts[0].status).toBe('failed'); // Porque uma regra falhou

				const execs = await getRuleExecutionsByAttemptId(attempts[0].id);
				expect(execs).toHaveLength(3);

				expect(execs[0].result).toBe('applied'); // log ok
				expect(execs[1].result).toBe('failed'); // webhook falhou
				expect(execs[2].result).toBe('applied'); // log final executou mesmo assim

				// Event state é failed
				const event = await getEventById(evt.body.id);
				expect(event?.state).toBe('failed');
			} finally {
				server.close();
			}
		});
	});

	describe('JSONLogic edge cases', () => {
		test('rule with invalid condition is rejected', async () => {
			const res = await request(app)
				.post('/rules')
				.send({
					name: 'bad logic',
					event_type: 't',
					condition: { unknown_operator: true },
					action: { type: 'noop', params: {} },
				})
				.expect(400);

			expect(res.body.error).toBe('ValidationError');
		});

		test('condition false skips rule', async () => {
			await createRule({
				name: 'skipped rule',
				event_type: 'conditional',
				condition: { '>': [{ var: 'amount' }, 100] },
				action: {
					type: 'log',
					params: { level: 'info', message: 'should_not_run' },
				},
			});

			const evt = await ingestEvent({
				id: 'cond-test',
				type: 'conditional',
				data: { amount: 50 },
			});

			await processNextEvent();

			const attempts = await getAttemptsByEventId(evt.body.id);
			const execs = await getRuleExecutionsByAttemptId(attempts[0].id);

			expect(execs[0].result).toBe('skipped');
			expect(attempts[0].status).toBe('success'); // Success mesmo com rule skipped
		});

		test('complex nested JSONLogic evaluated correctly', async () => {
			await createRule({
				name: 'complex condition',
				event_type: 'complex',
				condition: {
					and: [
						{ '>=': [{ var: 'amount' }, 100] },
						{ in: [{ var: 'country' }, ['BR', 'US', 'UK']] },
						{ '!': [{ var: 'is_blocked' }] },
					],
				},
				action: {
					type: 'log',
					params: { level: 'info', message: 'all_passed' },
				},
			});

			const evt = await ingestEvent({
				id: 'complex-test',
				type: 'complex',
				data: { amount: 150, country: 'BR', is_blocked: false },
			});

			await processNextEvent();

			const attempts = await getAttemptsByEventId(evt.body.id);
			const execs = await getRuleExecutionsByAttemptId(attempts[0].id);

			expect(execs[0].result).toBe('applied');
		});
	});

	describe('State transitions', () => {
		test('pending -> processing -> processed flow', async () => {
			await createRule({
				name: 'simple',
				event_type: 'flow',
				condition: { '==': [1, 1] },
				action: { type: 'noop', params: {} },
			});

			const evt = await ingestEvent({ id: 'flow-1', type: 'flow', data: {} });

			// Initial state
			let event = await getEventById(evt.body.id);
			expect(event?.state).toBe('pending');
			expect(event?.processing_started_at).toBeNull();
			expect(event?.processed_at).toBeNull();

			// Claim (but before processing)
			const claim = await claimNextEvent();
			event = await getEventById(evt.body.id);
			expect(event?.state).toBe('processing');
			expect(event?.processing_started_at).not.toBeNull();

			// Process
			if (!claim) throw new Error('Claim failed');
			await processClaimedEvent(claim);

			event = await getEventById(evt.body.id);
			expect(event?.state).toBe('processed');
			expect(event?.processed_at).not.toBeNull();
			expect(event?.processing_started_at).toBeNull(); // Cleared after processing
		});

		test('replayed_at timestamp set on replay', async () => {
			await createRule({
				name: 'noop',
				event_type: 'replay-ts',
				condition: { '==': [1, 1] },
				action: { type: 'noop', params: {} },
			});

			const evt = await ingestEvent({
				id: 'replay-ts',
				type: 'replay-ts',
				data: {},
			});
			await processNextEvent();

			let event = await getEventById(evt.body.id);
			expect(event?.replayed_at).toBeNull();

			await request(app).post(`/events/${evt.body.id}/replay`).expect(200);

			event = await getEventById(evt.body.id);
			expect(event?.replayed_at).not.toBeNull();
			expect(event?.state).toBe('pending'); // Back to pending
		});
	});

	describe('Payload integrity', () => {
		test('payload preserved through processing', async () => {
			await createRule({
				name: 'payload test',
				event_type: 'payload',
				condition: { '==': [1, 1] },
				action: { type: 'noop', params: {} },
			});

			const originalPayload = {
				nested: { deep: { value: 123 } },
				array: [1, 2, 3],
				string: 'test',
				bool: true,
				null: null,
			};

			const evt = await ingestEvent({
				id: 'payload-test',
				type: 'payload',
				data: originalPayload,
			});

			await processNextEvent();

			const event = await getEventById(evt.body.id);
			expect(event?.payload).toEqual(originalPayload);
		});

		test('duplicate with different payload ignores new payload', async () => {
			const first = await ingestEvent({
				id: 'payload-dup',
				type: 'dup',
				data: { version: 'first', sensitive: 'data' },
			});

			const second = await ingestEvent({
				id: 'payload-dup',
				type: 'dup',
				data: { version: 'second', malicious: 'override' },
			});

			expect(first.body.id).toBe(second.body.id);

			const event = await getEventById(first.body.id);
			expect(event?.payload.version).toBe('first');
			expect(event?.payload.sensitive).toBe('data');
			expect(event?.payload.malicious).toBeUndefined();
		});
	});

	describe('Database consistency', () => {
		test('attempt always links to event', async () => {
			await createRule({
				name: 'consistency',
				event_type: 'cons',
				condition: { '==': [1, 1] },
				action: { type: 'noop', params: {} },
			});

			const evt = await ingestEvent({ id: 'cons-1', type: 'cons', data: {} });
			await processNextEvent();

			const attempts = await getAttemptsByEventId(evt.body.id);
			expect(attempts).toHaveLength(1);
			expect(attempts[0].event_id).toBe(evt.body.id);
		});

		test('rule execution always links to attempt', async () => {
			await createRule({
				name: 'link test',
				event_type: 'link',
				condition: { '==': [1, 1] },
				action: { type: 'noop', params: {} },
			});

			const evt = await ingestEvent({ id: 'link-1', type: 'link', data: {} });
			await processNextEvent();

			const attempts = await getAttemptsByEventId(evt.body.id);
			const execs = await getRuleExecutionsByAttemptId(attempts[0].id);

			expect(execs).toHaveLength(1);
			expect(execs[0].attempt_id).toBe(attempts[0].id);
		});

		test('cascading delete on event removes attempts and executions', async () => {
			await createRule({
				name: 'cascade',
				event_type: 'cascade',
				condition: { '==': [1, 1] },
				action: { type: 'noop', params: {} },
			});

			const evt = await ingestEvent({
				id: 'cascade-test',
				type: 'cascade',
				data: {},
			});
			await processNextEvent();

			const eventId = evt.body.id;

			// Verifica que existe
			const attempts = await getAttemptsByEventId(eventId);
			expect(attempts).toHaveLength(1);

			// Delete evento
			await pool.query('DELETE FROM events WHERE id = $1', [eventId]);

			// Attempts e executions devem ter sido deletados (CASCADE)
			const attemptsAfter = await getAttemptsByEventId(eventId);
			expect(attemptsAfter).toHaveLength(0);
		});
	});
});
