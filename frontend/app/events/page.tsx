import { ArrowRight, Filter } from "lucide-react";
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

const events = [
	{
		id: "evt-001",
		type: "payment.created",
		state: "processed",
		receivedCount: 1,
		createdAt: "2026-01-29 02:36",
	},
	{
		id: "evt-002",
		type: "payment.created",
		state: "failed",
		receivedCount: 1,
		createdAt: "2026-01-29 02:38",
	},
	{
		id: "evt-003",
		type: "order.paid",
		state: "processing",
		receivedCount: 2,
		createdAt: "2026-01-29 02:40",
	},
	{
		id: "evt-004",
		type: "order.shipped",
		state: "pending",
		receivedCount: 1,
		createdAt: "2026-01-29 02:44",
	},
];

const stateStyles: Record<string, { label: string; className: string }> = {
	pending: { label: "Pendente", className: "text-warning" },
	processing: { label: "Processando", className: "text-info" },
	processed: { label: "Processado", className: "text-accent-2" },
	failed: { label: "Falhou", className: "text-danger" },
};

export default function EventsPage() {
	return (
		<div className="min-h-screen bg-background text-foreground">
			<div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12 md:px-10">
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
								Estados, reprocessos e sinais de não-determinismo.
							</p>
						</div>
						<div className="flex flex-col gap-2 md:flex-row">
							<Button
								variant="outline"
								className="gap-2 border-border-subtle hover:bg-white/5"
							>
								<Filter className="h-4 w-4" />
								Filtros
							</Button>
							<Button className="gap-2 border border-border-subtle bg-transparent text-foreground hover:bg-white/5">
								Ver detalhes
								<ArrowRight className="h-4 w-4" />
							</Button>
						</div>
					</div>
					<div className="grid gap-4 text-3xl font-semibold md:grid-cols-3 md:text-4xl">
						<div className="flex items-end justify-between border border-border-subtle p-4">
							<span className="text-zinc-400">Pendentes</span>
							<span className="text-warning">12</span>
						</div>
						<div className="flex items-end justify-between border border-border-subtle p-4">
							<span className="text-zinc-400">Processando</span>
							<span className="text-info">4</span>
						</div>
						<div className="flex items-end justify-between border border-border-subtle p-4">
							<span className="text-zinc-400">Falhas 24h</span>
							<span className="text-danger">3</span>
						</div>
					</div>
				</header>

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
									Reprocessos
								</TableHead>
								<TableHead className="text-xs uppercase tracking-[0.2em] text-zinc-500">
									Criado em
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{events.map((event) => {
								const state = stateStyles[event.state];
								return (
									<TableRow
										key={event.id}
										className="border-border-subtle text-sm"
									>
										<TableCell className="font-medium text-zinc-100">
											{event.id}
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
											{event.receivedCount}
										</TableCell>
										<TableCell className="text-zinc-300">
											{event.createdAt}
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
