import jsonLogic from 'json-logic-js';

import { validateJsonLogicCondition } from '../domain/jsonLogic';
import type { JsonLogicExpression, JsonValue } from '../domain/types';

const parseJsonField = (value: unknown): JsonValue | null => {
	if (value === null || value === undefined) {
		return null;
	}
	if (typeof value !== 'string') {
		return value as JsonValue;
	}
	try {
		return JSON.parse(value) as JsonValue;
	} catch {
		return value as unknown as JsonValue;
	}
};

const isJsonLogicExpression = (
	value: JsonValue | null,
): value is JsonLogicExpression => {
	if (value === null) {
		return false;
	}
	return Array.isArray(value) || typeof value === 'object';
};

export const evaluateJsonLogic = (
	condition: unknown,
	data: Record<string, unknown>,
): boolean => {
	const parsed = parseJsonField(condition);
	if (!isJsonLogicExpression(parsed)) {
		throw new Error('Invalid JSONLogic condition');
	}
	const validation = validateJsonLogicCondition(parsed);
	if (!validation.ok) {
		throw new Error(`Invalid JSONLogic condition: ${validation.error}`);
	}
	const result = jsonLogic.apply(parsed, data);
	return Boolean(result);
};

export const parseJsonValue = (value: unknown): JsonValue | null =>
	parseJsonField(value);
