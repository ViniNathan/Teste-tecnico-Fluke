import axios from "axios";

const baseURL =
	process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000";

export const api = axios.create({
	baseURL,
	timeout: 8000,
	headers: {
		"Content-Type": "application/json",
	},
});

api.interceptors.response.use(
	(response) => response,
	(error) => {
		const message =
			error?.response?.data?.message ||
			error?.response?.data?.error ||
			error?.message ||
			"Unexpected API error";
		return Promise.reject(new Error(message));
	},
);
