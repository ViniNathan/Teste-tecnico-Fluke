import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getEvent, getEventAttempts } from "@/lib/api";
import { ReplayButton } from "./ReplayButton";

const stateStyles: Record<string, { label: string; className: string }> = {
	pending: { label: "Pendente", className: "text-warning" },
	processing: { label: "Processando", className: "text-info" },
	processed: { label: "Processado", className: "text-accent-2" },
	failed: { label: "Falhou", className: "text-danger" },
};

export const dynamic = "force-dynamic";

export default async function EventDetailPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const resolvedParams = await params;
	const eventId = Number(resolvedParams.id);
	const event = await getEvent(eventId);
	const attempts = await getEventAttempts(eventId);
	const state = stateStyles[event.state];

	return (
		<div className="min-h-screen bg-background text-foreground">
			<div className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-12 md:px-10">
				<header className="flex flex-col gap-6 border-b border-border-subtle pb-6">
					<Link
						href="/events"
						className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-zinc-500"
					>
						<ArrowLeft className="h-4 w-4" />
						Voltar
					</Link>
					<div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
						<div>
							<p className="text-xs uppercase tracking-[0.3em] text-zinc-500">
								Evento
							</p>
							<h1 className="text-3xl font-semibold md:text-4xl">
								{event.external_id}
							</h1>
							<p className="mt-2 text-sm text-zinc-400">Tipo: {event.type}</p>
						</div>
						<ReplayButton eventId={eventId} />
					</div>
					<div className="flex flex-wrap gap-3 text-xs text-zinc-400">
						<Badge className={`${state.className} border border-border-subtle`}>
							{state.label}
						</Badge>
						<span>Recebido: {event.received_count}x</span>
						<span>Criação: {new Date(event.created_at).toLocaleString()}</span>
						{event.processed_at ? (
							<span>
								Processado: {new Date(event.processed_at).toLocaleString()}
							</span>
						) : null}
						{event.replayed_at ? (
							<span className="text-warning">
								Replay em {new Date(event.replayed_at).toLocaleString()}
							</span>
						) : null}
					</div>
				</header>

				<section className="grid gap-6 md:grid-cols-[1.1fr_0.9fr]">
					<div className="border border-border-subtle p-5">
						<p className="text-xs uppercase tracking-[0.3em] text-zinc-500">
							Payload
						</p>
						<pre className="mt-4 whitespace-pre-wrap break-words text-sm text-zinc-200">
							{JSON.stringify(event.payload, null, 2)}
						</pre>
					</div>
					<div className="border border-border-subtle p-5">
						<p className="text-xs uppercase tracking-[0.3em] text-zinc-500">
							Avisos
						</p>
						<ul className="mt-4 space-y-3 text-sm text-zinc-400">
							<li>Replay usa regras atuais e pode alterar resultados.</li>
							<li>Ações externas podem ser executadas mais de uma vez.</li>
							<li>Estados refletem a última tentativa concluída.</li>
						</ul>
					</div>
				</section>

				<section className="border border-border-subtle">
					<div className="border-b border-border-subtle p-5">
						<p className="text-xs uppercase tracking-[0.3em] text-zinc-500">
							Tentativas ({attempts.count})
						</p>
					</div>
					<div className="divide-y divide-border-subtle">
						{attempts.data.map((attempt) => (
							<div key={attempt.id} className="p-5 text-sm text-zinc-300">
								<div className="flex flex-wrap items-center gap-3">
									<span className="font-medium text-zinc-100">
										Tentativa #{attempt.id}
									</span>
									<span className="text-zinc-500">
										Status: {attempt.status ?? "executando"}
									</span>
									{attempt.duration_ms ? (
										<span className="text-zinc-500">
											Duração: {attempt.duration_ms}ms
										</span>
									) : null}
								</div>
								{attempt.error ? (
									<pre className="mt-3 whitespace-pre-wrap break-words text-xs text-danger">
										{attempt.error}
									</pre>
								) : null}
								{attempt.rule_executions?.length ? (
									<div className="mt-4 space-y-3">
										{attempt.rule_executions.map((rule) => (
											<div
												key={rule.id}
												className="border border-border-subtle p-3"
											>
												<p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
													{rule.rule_name ?? `Regra ${rule.rule_id}`}
												</p>
												<p className="mt-2 text-xs text-zinc-400">
													Resultado: {rule.result}
												</p>
												{rule.error ? (
													<p className="mt-2 text-xs text-danger">
														{rule.error}
													</p>
												) : null}
											</div>
										))}
									</div>
								) : (
									<p className="mt-3 text-xs text-zinc-500">
										Nenhuma regra registrada nesta tentativa.
									</p>
								)}
							</div>
						))}
					</div>
				</section>
			</div>
		</div>
	);
}
