import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
	return (
		<div className="min-h-screen bg-background text-foreground">
			<div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-16 px-6 py-16 md:px-10 md:py-20">
				<header className="flex items-center justify-between border-b border-border-subtle pb-6">
					<div>
						<h1 className="text-lg uppercase tracking-[0.3em] text-zinc-500">
							Event Platform
						</h1>
					</div>
					<div className="text-xs text-zinc-500">Beta</div>
				</header>

				<main className="grid gap-16 md:grid-cols-[1.2fr_0.8fr]">
					<section className="flex flex-col gap-6">
						<h1 className="text-4xl font-semibold leading-[1.05] md:text-6xl md:leading-[1.05]">
							Observabilidade real.
							<br />
							Eventos quebram aqui.
						</h1>
						<p className="text-base leading-7 text-zinc-300 md:text-lg">
							Plataforma mínima de processamento assíncrono com replay e
							versionamento de regras. Nada de promessas: estados e riscos são
							explícitos.
						</p>
						<div className="flex flex-col gap-3 md:flex-row">
							<Button
								asChild
								className="border border-border-subtle bg-transparent text-foreground hover:bg-white/5"
							>
								<Link href="/events">
									Abrir console
									<ArrowUpRight className="ml-2 h-4 w-4" />
								</Link>
							</Button>
							<Button
								asChild
								variant="outline"
								className="border-border-subtle hover:bg-white/5"
							>
								<a href="#capabilities">Capacidades</a>
							</Button>
						</div>
					</section>

					<section className="flex flex-col gap-6 border border-border-subtle p-6">
						<p className="text-xs uppercase tracking-[0.3em] text-zinc-500">
							Snapshot
						</p>
						<div className="space-y-4 text-3xl font-semibold md:text-4xl">
							<div className="flex items-end justify-between border-b border-border-subtle pb-3">
								<span className="text-zinc-400">Pendentes</span>
								<span className="text-warning">12</span>
							</div>
							<div className="flex items-end justify-between border-b border-border-subtle pb-3">
								<span className="text-zinc-400">Processando</span>
								<span className="text-info">4</span>
							</div>
							<div className="flex items-end justify-between">
								<span className="text-zinc-400">Falhas 24h</span>
								<span className="text-danger">3</span>
							</div>
						</div>
					</section>
				</main>

				<section id="capabilities" className="grid gap-6 md:grid-cols-3">
					<div className="border border-border-subtle p-5">
						<h3 className="text-lg font-semibold">Replay consciente</h3>
						<p className="mt-2 text-sm text-zinc-400">
							Reprocessa com regras atuais e expõe efeitos colaterais.
						</p>
					</div>
					<div className="border border-border-subtle p-5">
						<h3 className="text-lg font-semibold">Tentativas rastreáveis</h3>
						<p className="mt-2 text-sm text-zinc-400">
							Erro, duração e regras avaliadas ficam visíveis.
						</p>
					</div>
					<div className="border border-border-subtle p-5">
						<h3 className="text-lg font-semibold">Regras versionadas</h3>
						<p className="mt-2 text-sm text-zinc-400">
							Mudanças explícitas, auditáveis e com trade-offs.
						</p>
					</div>
				</section>
			</div>
		</div>
	);
}
