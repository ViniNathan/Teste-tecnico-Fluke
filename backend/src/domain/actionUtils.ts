import type { Action } from './types';

export const isIdempotentAction = (action: Action): boolean =>
	action.type === 'log' || action.type === 'noop';
