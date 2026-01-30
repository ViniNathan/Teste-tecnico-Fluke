export interface ErrorResponse {
	error: string;
	message: string;
	details?: unknown;
	stack?: string;
}

export interface ListResponse<T> {
	data: T[];
	count: number;
	limit: number;
	offset: number;
}

export interface PaginationParams {
	limit?: string;
	offset?: string;
}

export interface EventFilters extends PaginationParams {
	state?: string;
	type?: string;
	start_date?: string;
	end_date?: string;
}

export interface ValidationErrorDetail {
	path: string;
	message: string;
}

export interface EventStatsResponse {
	total: number;
	pending: number;
	processing: number;
	processed: number;
	failed: number;
	failed_last_24h: number;
}
