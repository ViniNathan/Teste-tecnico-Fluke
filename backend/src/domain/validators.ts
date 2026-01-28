import { z } from "zod";

// Schema de criação de evento (POST /events)
export const eventCreateSchema = z.object({
	id: z.string().min(1).max(255),
	type: z.string().min(1).max(100),
	data: z.record(z.string(), z.any()),
});

// Schema de filtro de estado de evento (GET /events?state=...)
export const eventStateSchema = z.enum([
	"pending",
	"processing",
	"processed",
	"failed",
]);

// Schema de filtro de eventos (GET /events)
export const eventFiltersSchema = z.object({
	state: eventStateSchema.optional(),
	type: z.string().optional(),
	limit: z.string().regex(/^\d+$/).optional(),
	offset: z.string().regex(/^\d+$/).optional(),
});

// Schema de ID de evento (GET /events/:id)
export const eventIdSchema = z.string().regex(/^\d+$/).transform(Number);

// Schema de ação de envio de email
export const sendEmailActionSchema = z.object({
	type: z.literal("send_email"),
	params: z.object({
		to: z.string().email(),
		subject: z.string().min(1),
		template: z.string().min(1),
		data: z.record(z.string(), z.any()).optional(),
	}),
});

// Schema de ação de chamada de webhook
export const callWebhookActionSchema = z.object({
	type: z.literal("call_webhook"),
	params: z.object({
		url: z.string().url(),
		method: z.enum(["POST", "PUT", "PATCH"]),
		headers: z.record(z.string(), z.string()).optional(),
		body: z.record(z.string(), z.any()).optional(),
	}),
});

// Schema de ação de log
export const logActionSchema = z.object({
	type: z.literal("log"),
	params: z.object({
		level: z.enum(["info", "warn", "error"]),
		message: z.string().min(1),
	}),
});

// Schema de ação no-op
export const noopActionSchema = z.object({
	type: z.literal("noop"),
	params: z.object({}),
});

// União discriminada de todas as ações
export const actionSchema = z.discriminatedUnion("type", [
	sendEmailActionSchema,
	callWebhookActionSchema,
	logActionSchema,
	noopActionSchema,
]);

// Schema de criação de regra (POST /rules)
export const ruleCreateSchema = z.object({
	name: z.string().min(1).max(255),
	event_type: z.string().min(1).max(100),
	condition: z.string().min(1), // JSONPath expression
	action: actionSchema,
	active: z.boolean().optional().default(true),
});

// Schema de atualização de regra (PUT /rules/:id)
export const ruleUpdateSchema = z.object({
	name: z.string().min(1).max(255).optional(),
	event_type: z.string().min(1).max(100).optional(),
	condition: z.string().min(1).optional(),
	action: actionSchema.optional(),
	active: z.boolean().optional(),
});

// Schema de filtro de regras (GET /rules)
export const ruleFiltersSchema = z.object({
	active: z.enum(["true", "false"]).optional(),
	event_type: z.string().optional(),
	limit: z.string().regex(/^\d+$/).optional(),
	offset: z.string().regex(/^\d+$/).optional(),
});

// Schema de ID de regra (GET /rules/:id)
export const ruleIdSchema = z.string().regex(/^\d+$/).transform(Number);

// Schema de replay de eventos (POST /replay/replay-batch)
export const replayBatchSchema = z.object({
	event_ids: z.array(z.number().int().positive()).min(1).max(100),
});

// Inferência de tipos TypeScript a partir dos schemas Zod
export type EventCreateInput = z.infer<typeof eventCreateSchema>;
export type EventFiltersInput = z.infer<typeof eventFiltersSchema>;
export type RuleCreateInput = z.infer<typeof ruleCreateSchema>;
export type RuleUpdateInput = z.infer<typeof ruleUpdateSchema>;
export type RuleFiltersInput = z.infer<typeof ruleFiltersSchema>;
export type ActionInput = z.infer<typeof actionSchema>;
export type ReplayBatchInput = z.infer<typeof replayBatchSchema>;
