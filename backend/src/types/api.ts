export interface ErrorResponse {
	error: string;
	message: string;
	details?: any;
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
}

export interface ValidationErrorDetail {
	path: string;
	message: string;
}
