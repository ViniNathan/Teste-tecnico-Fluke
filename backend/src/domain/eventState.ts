import type { EventState } from './types';

// Transições de estado válidas
export const STATE_TRANSITIONS: Record<EventState, EventState[]> = {
	pending: ['processing'],
	processing: ['processed', 'failed'],
	processed: ['pending'],
	failed: ['pending'],
};

// Verifica se transição de estado é válida
export const isValidStateTransition = (
	from: EventState,
	to: EventState,
): boolean => STATE_TRANSITIONS[from]?.includes(to) ?? false;

// Estados terminais (finalizam fluxo automático)
export const TERMINAL_STATES: EventState[] = ['processed', 'failed'];

// Verifica se estado é terminal
export const isTerminalState = (state: EventState): boolean =>
	TERMINAL_STATES.includes(state);

// Estados que permitem replay manual
export const REPLAYABLE_STATES: EventState[] = ['processed', 'failed'];

// Verifica se evento pode sofrer replay
export const isReplayableState = (state: EventState): boolean =>
	REPLAYABLE_STATES.includes(state);
