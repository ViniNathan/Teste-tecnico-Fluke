import { z } from "zod";

export const eventStateSchema = z.enum([
	"pending",
	"processing",
	"processed",
	"failed",
]);

export const eventSchema = z.object({
	id: z.number(),
	external_id: z.string(),
	type: z.string(),
	payload: z.any(),
	state: eventStateSchema,
	received_count: z.number(),
	created_at: z.string(),
	processed_at: z.string().nullable().optional(),
	replayed_at: z.string().nullable().optional(),
	processing_started_at: z.string().nullable().optional(),
});

export const eventStatsSchema = z.object({
	total: z.number(),
	pending: z.number(),
	processing: z.number(),
	processed: z.number(),
	failed: z.number(),
	failed_last_24h: z.number(),
});

export const listResponseSchema = <T extends z.ZodTypeAny>(item: T) =>
	z.object({
		data: z.array(item),
		count: z.number(),
		limit: z.number(),
		offset: z.number(),
	});

export const ruleExecutionSchema = z.object({
	id: z.number(),
	rule_id: z.number(),
	rule_name: z.string().optional(),
	rule_version_id: z.number(),
	rule_version: z.number().optional(),
	result: z.enum(["applied", "skipped", "failed", "deduped"]),
	error: z.string().nullable(),
	executed_at: z.string(),
});

export const attemptSchema = z.object({
	id: z.number(),
	event_id: z.number(),
	status: z.enum(["success", "failed"]).nullable(),
	error: z.string().nullable(),
	started_at: z.string(),
	finished_at: z.string().nullable().optional(),
	duration_ms: z
		.preprocess((value) => {
			if (value === null || value === undefined) {
				return value;
			}
			if (typeof value === "string" && value.trim() !== "") {
				const parsed = Number(value);
				return Number.isNaN(parsed) ? value : parsed;
			}
			return value;
		}, z.number())
		.nullable()
		.optional(),
	rule_executions: z.array(ruleExecutionSchema).optional().default([]),
});

export const ruleSchema = z.object({
	id: z.number(),
	name: z.string(),
	event_type: z.string(),
	active: z.boolean(),
	created_at: z.string(),
	updated_at: z.string(),
	current_version: z
		.object({
			id: z.number(),
			condition: z.any(),
			action: z.any(),
			version: z.number(),
			created_at: z.string(),
		})
		.nullable(),
});

export const replayResponseSchema = z.object({
	message: z.string(),
	event: z.object({
		id: z.number(),
		external_id: z.string(),
		type: z.string(),
		state: eventStateSchema,
		replayed_at: z.string().nullable().optional(),
	}),
	warning: z.string().optional(),
});

export const createEventResponseSchema = z.object({
	id: z.number(),
	external_id: z.string(),
	state: eventStateSchema,
	created_at: z.string(),
	received_count: z.number(),
});

export type CreateEventResponse = z.infer<typeof createEventResponseSchema>;

export type Event = z.infer<typeof eventSchema>;
export type EventStats = z.infer<typeof eventStatsSchema>;
export type EventState = z.infer<typeof eventStateSchema>;
export type Attempt = z.infer<typeof attemptSchema>;
export type Rule = z.infer<typeof ruleSchema>;
export type ListResponse<T> = {
	data: T[];
	count: number;
	limit: number;
	offset: number;
};
