import { api } from "./client";
import {
	attemptSchema,
	eventSchema,
	listResponseSchema,
	replayResponseSchema,
	ruleSchema,
	type Attempt,
	type Event,
	type EventState,
	type ListResponse,
	type Rule,
} from "./schemas";

export const listEvents = async (params?: {
	state?: EventState;
	type?: string;
	limit?: number;
	offset?: number;
}): Promise<ListResponse<Event>> => {
	const response = await api.get("/events", { params });
	return listResponseSchema(eventSchema).parse(response.data);
};

export const getEvent = async (id: number): Promise<Event> => {
	const response = await api.get(`/events/${id}`);
	return eventSchema.parse(response.data);
};

export const getEventAttempts = async (
	id: number,
): Promise<{
	data: Attempt[];
	count: number;
	limit: number;
	offset: number;
}> => {
	const response = await api.get(`/events/${id}/attempts`);
	return listResponseSchema(attemptSchema).parse(response.data);
};

export const replayEvent = async (id: number) => {
	const response = await api.post(`/events/${id}/replay`);
	return replayResponseSchema.parse(response.data);
};

export const listRules = async (params?: {
	active?: boolean;
	event_type?: string;
	limit?: number;
	offset?: number;
}): Promise<ListResponse<Rule>> => {
	const response = await api.get("/rules", { params });
	return listResponseSchema(ruleSchema).parse(response.data);
};

export const createRule = async (payload: {
	name: string;
	event_type: string;
	condition: unknown;
	action: unknown;
	active?: boolean;
}): Promise<Rule> => {
	const response = await api.post("/rules", payload);
	return ruleSchema.parse(response.data);
};

export const updateRule = async (
	id: number,
	payload: Partial<{
		name: string;
		event_type: string;
		condition: unknown;
		action: unknown;
		active: boolean;
	}>,
): Promise<Rule> => {
	const response = await api.put(`/rules/${id}`, payload);
	return ruleSchema.parse(response.data);
};

export const deactivateRule = async (id: number) => {
	const response = await api.delete(`/rules/${id}`);
	return response.data as { message: string; rule: Rule };
};
