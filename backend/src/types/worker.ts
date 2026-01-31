import type { Event } from '../domain/types';

export type ClaimedEvent = {
	event: Event;
	attemptId: number;
};

export type RuleRow = {
	rule_id: number;
	rule_name: string;
	rule_version_id: number;
	rule_version: number;
	condition: unknown;
	action: unknown;
};
