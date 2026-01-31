import type { JsonLogicExpression, JsonValue } from './types';

// Limites de segurança para prevenir DoS
const MAX_DEPTH = 10; // Profundidade máxima de aninhamento
const MAX_OPERATORS = 50; // Máximo de operadores em uma expressão

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

/**
 * Valida a profundidade de aninhamento de uma expressão JSONLogic.
 * Previne DoS com estruturas profundamente aninhadas.
 */
const validateDepth = (
	value: JsonValue,
	currentDepth = 0,
): { ok: true } | { ok: false; error: string } => {
	if (currentDepth > MAX_DEPTH) {
		return {
			ok: false,
			error: `JSONLogic expression exceeds maximum depth of ${MAX_DEPTH}`,
		};
	}

	if (Array.isArray(value)) {
		for (const item of value) {
			const result = validateDepth(item, currentDepth + 1);
			if (!result.ok) {
				return result;
			}
		}
	} else if (typeof value === 'object' && value !== null) {
		for (const item of Object.values(value)) {
			const result = validateDepth(item, currentDepth + 1);
			if (!result.ok) {
				return result;
			}
		}
	}

	return { ok: true };
};

/**
 * Conta o número total de operadores em uma expressão JSONLogic.
 * Previne expressões excessivamente complexas.
 */
const countOperators = (value: JsonValue): number => {
	if (Array.isArray(value)) {
		return value.reduce((sum, item) => sum + countOperators(item), 0);
	}

	if (typeof value === 'object' && value !== null && isOperatorObject(value)) {
		const operator = Object.keys(value)[0];
		if (ALLOWED_OPERATORS.has(operator)) {
			return 1 + countOperators(value[operator] as JsonValue);
		}
		return 1;
	}

	if (typeof value === 'object' && value !== null) {
		return Object.values(value).reduce(
			(sum, item) => sum + countOperators(item),
			0,
		);
	}

	return 0;
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
	// 1. Valida profundidade de aninhamento
	const depthResult = validateDepth(condition);
	if (!depthResult.ok) {
		return depthResult;
	}

	// 2. Valida número de operadores
	const operatorCount = countOperators(condition);
	if (operatorCount > MAX_OPERATORS) {
		return {
			ok: false,
			error: `JSONLogic expression has ${operatorCount} operators, exceeds maximum of ${MAX_OPERATORS}`,
		};
	}

	// 3. Valida estrutura e operadores permitidos
	const error = validateNode(condition, true);
	if (error) {
		return { ok: false, error };
	}

	return { ok: true };
};

export const isAllowedOperator = (operator: string): boolean =>
	ALLOWED_OPERATORS.has(operator);
