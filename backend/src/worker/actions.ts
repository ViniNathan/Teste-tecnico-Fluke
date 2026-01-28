import type { Action, Event } from '../domain/types';
import { createLogger } from '../utils/logger';

const actionsLogger = createLogger({ module: 'actions' });

const WEBHOOK_TIMEOUT_MS = Number(process.env.WEBHOOK_TIMEOUT_MS ?? '5000');

const EMAIL_MODE = (process.env.EMAIL_MODE ?? 'disabled').toLowerCase();

const callWebhook = async (action: Action) => {
	if (action.type !== 'call_webhook') {
		return;
	}
	const { url, method, headers, body } = action.params;
	const requestHeaders: Record<string, string> = {
		...(headers ?? {}),
	};

	if (body && !requestHeaders['content-type']) {
		requestHeaders['content-type'] = 'application/json';
	}

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

	let response: Response;
	try {
		response = await fetch(url, {
			method,
			headers: requestHeaders,
			body: body ? JSON.stringify(body) : undefined,
			signal: controller.signal,
		});
	} finally {
		clearTimeout(timeout);
	}

	if (!response.ok) {
		throw new Error(
			`Webhook failed with status ${response.status} ${response.statusText}`,
		);
	}
};

const sendEmail = async (action: Action) => {
	if (action.type !== 'send_email') {
		return;
	}

	if (EMAIL_MODE === 'log') {
		actionsLogger.warn(
			{ to: action.params.to, subject: action.params.subject },
			'send_email simulated (EMAIL_MODE=log)',
		);
		return;
	}

	throw new Error(
		'send_email not implemented (set EMAIL_MODE=log to simulate)',
	);
};

const logAction = async (action: Action) => {
	if (action.type !== 'log') {
		return;
	}
	const { level, message } = action.params;
	const logMessage = message ?? 'log action';
	if (level === 'info') {
		actionsLogger.info({ message: logMessage }, 'Rule action log');
		return;
	}
	if (level === 'warn') {
		actionsLogger.warn({ message: logMessage }, 'Rule action log');
		return;
	}
	actionsLogger.error({ message: logMessage }, 'Rule action log');
};

export const executeAction = async (action: Action, _event: Event) => {
	void _event;
	switch (action.type) {
		case 'log':
			await logAction(action);
			return;
		case 'noop':
			return;
		case 'call_webhook':
			await callWebhook(action);
			return;
		case 'send_email':
			await sendEmail(action);
			return;
		default:
			throw new Error(`Unsupported action type: ${(action as Action).type}`);
	}
};
