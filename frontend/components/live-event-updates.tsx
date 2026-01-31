"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";

type LiveEventUpdatesProps = {
	eventId?: number;
	eventIds?: number[];
};

const getWebsocketUrl = () => {
	return process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3000/ws";
};

const parsePayload = (payload: unknown) => {
	if (typeof payload === "string") {
		try {
			return JSON.parse(payload) as Record<string, unknown>;
		} catch {
			return null;
		}
	}

	if (payload && typeof payload === "object") {
		return payload as Record<string, unknown>;
	}

	return null;
};

export function LiveEventUpdates({ eventId, eventIds }: LiveEventUpdatesProps) {
	const router = useRouter();
	const lastRefreshRef = useRef(0);
	const trackedIds = useMemo(() => {
		if (eventId !== undefined) {
			return new Set([eventId]);
		}
		if (eventIds && eventIds.length > 0) {
			return new Set(eventIds);
		}
		return null;
	}, [eventId, eventIds]);

	useEffect(() => {
		let socket: WebSocket | null = null;
		let reconnectTimer: number | null = null;
		let retryCount = 0;
		let disposed = false;

		const connect = () => {
			if (disposed) {
				return;
			}

			socket = new WebSocket(getWebsocketUrl());

			socket.addEventListener("message", (event) => {
				const parsed = parsePayload(event.data);
				if (!parsed) {
					return;
				}

				const incomingId = parsed.eventId;
				if (trackedIds && typeof incomingId === "number") {
					if (!trackedIds.has(incomingId)) {
						return;
					}
				}

				const now = Date.now();
				if (now - lastRefreshRef.current < 500) {
					return;
				}

				lastRefreshRef.current = now;
				router.refresh();
			});

			socket.addEventListener("close", () => {
				if (disposed) {
					return;
				}
				retryCount += 1;
				const delay = Math.min(1000 * 2 ** (retryCount - 1), 15000);
				reconnectTimer = window.setTimeout(connect, delay);
			});
		};

		connect();

		return () => {
			disposed = true;
			if (reconnectTimer) {
				window.clearTimeout(reconnectTimer);
			}
			socket?.close();
		};
	}, [router, trackedIds]);

	return null;
}
