import type { JsonLogicExpression, JsonValue } from './types';

const ALLOWED_OPERATORS = new Set([
	'==',
	'===',
	'!=',
	'!==',
	'>',
	'>=',
	'<',
	'<=',
	'and',
	'or',
	'!',
	'var',
	'missing',
	'missing_some',
	'in',
	'if',
	'+',
	'-',
	'*',
	'/',
	'%',
	'min',
	'max',
	'cat',
	'substr',
	'length',
]);

const isPlainObject = (value: unknown): value is Record<string, JsonValue> =>
	Object.prototype.toString.call(value) === '[object Object]';

const isOperatorObject = (
	value: JsonValue,
): value is Record<string, JsonValue> => {
	if (!isPlainObject(value)) {
		return false;
	}
	const keys = Object.keys(value);
	return keys.length === 1;
};

const validateNode = (value: JsonValue, isRoot: boolean): string | null => {
	if (value === null) {
		return null;
	}

	if (Array.isArray(value)) {
		if (isRoot) {
			return 'Condition root must be a JSONLogic operator object';
		}
		for (const item of value) {
			const error = validateNode(item, false);
			if (error) {
				return error;
			}
		}
		return null;
	}

	if (typeof value === 'object') {
		if (!isOperatorObject(value)) {
			if (isRoot) {
				return 'Condition root must be a JSONLogic operator object';
			}
			for (const entry of Object.entries(value)) {
				const error = validateNode(entry[1], false);
				if (error) {
					return error;
				}
			}
			return null;
		}

		const operator = Object.keys(value)[0];
		if (!ALLOWED_OPERATORS.has(operator)) {
			return `Operator not allowed: ${operator}`;
		}

		const operands = value[operator] as JsonValue;
		const error = validateNode(operands, false);
		if (error) {
			return error;
		}

		return null;
	}

	return null;
};

export const validateJsonLogicCondition = (
	condition: JsonLogicExpression,
): { ok: true } | { ok: false; error: string } => {
	const error = validateNode(condition, true);
	if (error) {
		return { ok: false, error };
	}
	return { ok: true };
};

export const isAllowedOperator = (operator: string): boolean =>
	ALLOWED_OPERATORS.has(operator);
