import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { ConsoleNav } from "@/components/console-nav";
import { CreateEventDialog } from "@/components/create-event-dialog";
import { EventFilters } from "@/components/event-filters";
import { LiveEventUpdates } from "@/components/live-event-updates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { getEventStats, listEvents } from "@/lib/api";
import type { EventState } from "@/lib/api/schemas";

const stateStyles: Record<string, { label: string; className: string }> = {
	pending: { label: "Pendente", className: "text-warning" },
	processing: { label: "Processando", className: "text-info" },
	processed: { label: "Processado", className: "text-accent-2" },
	failed: { label: "Falhou", className: "text-danger" },
};

export const dynamic = "force-dynamic";

type PageSearchParams = Record<string, string | string[] | undefined>;

const parseEventState = (
	value: string | string[] | undefined,
): EventState | undefined => {
	if (!value) return undefined;
	const normalized = Array.isArray(value) ? value[0] : value;
	if (
		normalized === "pending" ||
		normalized === "processing" ||
		normalized === "processed" ||
		normalized === "failed"
	) {
		return normalized;
	}
	return undefined;
};

export default async function EventsPage({
	searchParams,
}: {
	searchParams?: PageSearchParams;
}) {
	const getParam = (key: string) => {
		const value = searchParams?.[key];
		return Array.isArray(value) ? value[0] : value;
	};

	const filters = {
		state: parseEventState(getParam("state")),
		type: getParam("type"),
		start_date: getParam("start_date"),
		end_date: getParam("end_date"),
	};

	const [events, stats] = await Promise.all([
		listEvents({ ...filters, limit: 50, offset: 0 }),
		getEventStats(filters),
	]);

	const firstEventHref = events.data[0]
		? `/events/${events.data[0].id}`
		: "/events";

	return (
		<div className="min-h-screen bg-background text-foreground">
			<LiveEventUpdates eventIds={events.data.map((event) => event.id)} />
			<div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12 md:px-10">
				<ConsoleNav />
				<header className="flex flex-col gap-6 border-b border-border-subtle pb-6">
					<div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
						<div>
							<p className="text-xs uppercase tracking-[0.3em] text-zinc-500">
								Operacional
							</p>
							<h1 className="text-4xl font-semibold leading-tight md:text-5xl">
								Eventos
							</h1>
							<p className="mt-3 text-sm text-zinc-400 md:text-base">
								Estados, reprocessos e sinais de nao-determinismo.
							</p>
							<p className="mt-2 text-xs text-zinc-500">
								Replay usa regras atuais e pode produzir resultados diferentes.
							</p>
						</div>
						<div className="flex flex-col gap-2 md:flex-row">
							<CreateEventDialog />
							<Button
								asChild
								className="gap-2 border border-border-subtle bg-transparent text-foreground hover:bg-white/5"
							>
								<Link href={firstEventHref}>
									Ver detalhes
									<ArrowRight className="h-4 w-4" />
								</Link>
							</Button>
						</div>
					</div>
					<div className="grid gap-4 text-3xl font-semibold md:grid-cols-3 md:text-4xl">
						<div className="flex items-end justify-between border border-border-subtle p-4">
							<span className="text-zinc-400">Pendentes</span>
							<span className="text-warning">{stats.pending}</span>
						</div>
						<div className="flex items-end justify-between border border-border-subtle p-4">
							<span className="text-zinc-400">Processando</span>
							<span className="text-info">{stats.processing}</span>
						</div>
						<div className="flex items-end justify-between border border-border-subtle p-4">
							<span className="text-zinc-400">Falhas 24h</span>
							<span className="text-danger">{stats.failed_last_24h}</span>
						</div>
					</div>
				</header>

				<EventFilters initial={filters} />

				<section className="border border-border-subtle">
					<Table>
						<TableHeader>
							<TableRow className="border-border-subtle">
								<TableHead className="text-xs uppercase tracking-[0.2em] text-zinc-500">
									External ID
								</TableHead>
								<TableHead className="text-xs uppercase tracking-[0.2em] text-zinc-500">
									Tipo
								</TableHead>
								<TableHead className="text-xs uppercase tracking-[0.2em] text-zinc-500">
									Estado
								</TableHead>
								<TableHead className="text-xs uppercase tracking-[0.2em] text-zinc-500">
									Recebido
								</TableHead>
								<TableHead className="text-xs uppercase tracking-[0.2em] text-zinc-500">
									Criado em
								</TableHead>
								<TableHead className="text-xs uppercase tracking-[0.2em] text-zinc-500">
									Inicio proc.
								</TableHead>
								<TableHead className="text-xs uppercase tracking-[0.2em] text-zinc-500">
									Processado
								</TableHead>
								<TableHead className="text-xs uppercase tracking-[0.2em] text-zinc-500">
									Replay
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{events.data.map((event) => {
								const state = stateStyles[event.state];
								return (
									<TableRow
										key={event.id}
										className="border-border-subtle text-sm"
									>
										<TableCell className="font-medium text-zinc-100">
											<Link
												href={`/events/${event.id}`}
												className="hover:underline"
											>
												{event.external_id}
											</Link>
										</TableCell>
										<TableCell className="text-zinc-300">
											{event.type}
										</TableCell>
										<TableCell>
											<Badge
												className={`${state.className} border border-border-subtle`}
											>
												{state.label}
											</Badge>
										</TableCell>
										<TableCell className="text-zinc-300">
											{event.received_count}
										</TableCell>
										<TableCell className="text-zinc-300">
											{new Date(event.created_at).toLocaleString()}
										</TableCell>
										<TableCell className="text-zinc-300">
											{event.processing_started_at
												? new Date(event.processing_started_at).toLocaleString()
												: "-"}
										</TableCell>
										<TableCell className="text-zinc-300">
											{event.processed_at
												? new Date(event.processed_at).toLocaleString()
												: "-"}
										</TableCell>
										<TableCell className="text-zinc-300">
											{event.replayed_at ? "Sim" : "Nao"}
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				</section>
			</div>
		</div>
	);
}
