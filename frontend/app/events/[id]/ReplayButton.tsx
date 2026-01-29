"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { replayEvent } from "@/lib/api";

export function ReplayButton({ eventId }: { eventId: number }) {
	const router = useRouter();
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [message, setMessage] = useState<string | null>(null);

	const onReplay = async () => {
		setLoading(true);
		setError(null);
		setMessage(null);
		try {
			const response = await replayEvent(eventId);
			setMessage(response.warning ?? response.message);
			router.refresh();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Replay failed");
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="flex flex-col gap-2">
			<Button
				onClick={onReplay}
				disabled={loading}
				className="border border-border-subtle bg-transparent text-foreground hover:bg-white/5"
			>
				{loading ? "Reprocessando..." : "Reprocessar evento"}
			</Button>
			{message ? (
				<p className="text-xs text-warning">{message}</p>
			) : null}
			{error ? <p className="text-xs text-danger">{error}</p> : null}
		</div>
	);
}
