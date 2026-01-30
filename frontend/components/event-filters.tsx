"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { EventState } from "@/lib/api/schemas";

type Filters = {
	state?: EventState;
	type?: string;
	start_date?: string;
	end_date?: string;
};

const eventStates: { value: EventState; label: string }[] = [
	{ value: "pending", label: "Pendente" },
	{ value: "processing", label: "Processando" },
	{ value: "processed", label: "Processado" },
	{ value: "failed", label: "Falhou" },
];

const extractDateInput = (value?: string) => {
	if (!value) return "";
	const [datePart] = value.split("T");
	return datePart;
};

export function EventFilters({ initial }: { initial: Filters }) {
	const router = useRouter();
	const [state, setState] = useState(initial.state ?? "");
	const [type, setType] = useState(initial.type ?? "");
	const [startDate, setStartDate] = useState(
		extractDateInput(initial.start_date),
	);
	const [endDate, setEndDate] = useState(extractDateInput(initial.end_date));

	const hasActiveFilters = useMemo(
		() => Boolean(state || type || startDate || endDate),
		[state, type, startDate, endDate],
	);

	const applyFilters = () => {
		const params = new URLSearchParams();
		if (state) params.set("state", state);
		if (type.trim()) params.set("type", type.trim());
		if (startDate) params.set("start_date", startDate);
		if (endDate) params.set("end_date", endDate);

		const query = params.toString();
		router.push(query ? `/events?${query}` : "/events");
	};

	const clearFilters = () => {
		setState("");
		setType("");
		setStartDate("");
		setEndDate("");
		router.push("/events");
	};

	return (
		<div className="flex flex-col gap-3 border border-border-subtle bg-white/[0.02] p-4">
			<div className="flex flex-wrap items-end gap-4">
				<div className="flex flex-col gap-1">
					<label className="text-xs uppercase tracking-[0.2em] text-zinc-500">
						Estado
					</label>
					<select
						value={state}
						onChange={(e) => setState(e.target.value as EventState | "")}
						className="min-w-[160px] border border-border-subtle bg-transparent px-3 py-2 text-sm text-foreground outline-none focus:border-foreground"
					>
						<option value="">Todos</option>
						{eventStates.map((opt) => (
							<option key={opt.value} value={opt.value}>
								{opt.label}
							</option>
						))}
					</select>
				</div>

				<div className="flex flex-col gap-1">
					<label className="text-xs uppercase tracking-[0.2em] text-zinc-500">
						Tipo
					</label>
					<input
						value={type}
						onChange={(e) => setType(e.target.value)}
						placeholder="ex: order.created"
						className="min-w-[180px] border border-border-subtle bg-transparent px-3 py-2 text-sm text-foreground outline-none focus:border-foreground"
					/>
				</div>

				<div className="flex flex-col gap-1">
					<label className="text-xs uppercase tracking-[0.2em] text-zinc-500">
						De
					</label>
					<input
						type="date"
						value={startDate}
						onChange={(e) => setStartDate(e.target.value)}
						className="border border-border-subtle bg-transparent px-3 py-2 text-sm text-foreground outline-none focus:border-foreground"
					/>
				</div>

				<div className="flex flex-col gap-1">
					<label className="text-xs uppercase tracking-[0.2em] text-zinc-500">
						Ate
					</label>
					<input
						type="date"
						value={endDate}
						onChange={(e) => setEndDate(e.target.value)}
						className="border border-border-subtle bg-transparent px-3 py-2 text-sm text-foreground outline-none focus:border-foreground"
					/>
				</div>

				<div className="flex gap-2">
					<Button
						type="button"
						onClick={applyFilters}
						className="border border-border-subtle bg-transparent text-foreground hover:bg-white/5"
					>
						Aplicar filtros
					</Button>
					<Button
						type="button"
						variant="outline"
						disabled={!hasActiveFilters}
						onClick={clearFilters}
						className="border-border-subtle hover:bg-white/5"
					>
						Limpar
					</Button>
				</div>
			</div>
			<p className="text-xs text-zinc-500">
				Filtros impactam lista e contadores; datas consideram a criacao do
				evento.
			</p>
		</div>
	);
}
