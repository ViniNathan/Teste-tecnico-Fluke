"use client";

import { useCallback, useEffect, useState } from "react";
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
import { createRule, deactivateRule, listRules, updateRule } from "@/lib/api";
import type { Rule } from "@/lib/api/schemas";

const emptyJson = "{}";

export default function RulesPage() {
	const [rules, setRules] = useState<Rule[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [selectedRule, setSelectedRule] = useState<Rule | null>(null);
	const [name, setName] = useState("");
	const [eventType, setEventType] = useState("");
	const [condition, setCondition] = useState(emptyJson);
	const [action, setAction] = useState(emptyJson);
	const [active, setActive] = useState(true);

	const loadRules = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const response = await listRules({ limit: 50, offset: 0 });
			setRules(response.data);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Erro ao carregar regras");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void loadRules();
	}, [loadRules]);

	const resetForm = () => {
		setSelectedRule(null);
		setName("");
		setEventType("");
		setCondition(emptyJson);
		setAction(emptyJson);
		setActive(true);
	};

	const fillFromRule = (rule: Rule) => {
		setSelectedRule(rule);
		setName(rule.name);
		setEventType(rule.event_type);
		setCondition(JSON.stringify(rule.current_version?.condition ?? {}, null, 2));
		setAction(JSON.stringify(rule.current_version?.action ?? {}, null, 2));
		setActive(rule.active);
	};

	const parseJson = (value: string) => {
		try {
			return { value: JSON.parse(value), error: null } as const;
		} catch (err) {
			return {
				value: null,
				error: err instanceof Error ? err.message : "JSON inválido",
			} as const;
		}
	};

	const onSubmit = async () => {
		setError(null);
		const conditionResult = parseJson(condition);
		const actionResult = parseJson(action);

		if (conditionResult.error || actionResult.error) {
			setError(conditionResult.error ?? actionResult.error);
			return;
		}

		try {
			if (selectedRule) {
				await updateRule(selectedRule.id, {
					name,
					event_type: eventType,
					condition: conditionResult.value,
					action: actionResult.value,
					active,
				});
			} else {
				await createRule({
					name,
					event_type: eventType,
					condition: conditionResult.value,
					action: actionResult.value,
					active,
				});
			}

			resetForm();
			await loadRules();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Falha ao salvar regra");
		}
	};

	const onDeactivate = async (ruleId: number) => {
		setError(null);
		try {
			await deactivateRule(ruleId);
			await loadRules();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Falha ao desativar regra");
		}
	};

	return (
		<div className="min-h-screen bg-background text-foreground">
			<div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12 md:px-10">
				<header className="border-b border-border-subtle pb-6">
					<p className="text-xs uppercase tracking-[0.3em] text-zinc-500">
						Regras
					</p>
					<h1 className="text-4xl font-semibold leading-tight md:text-5xl">
						Regras dinâmicas
					</h1>
					<p className="mt-3 text-sm text-zinc-400 md:text-base">
						Crie, edite e desative regras que controlam o processamento.
					</p>
				</header>

				<section className="grid gap-6 md:grid-cols-[1fr_1fr]">
					<div className="border border-border-subtle p-5">
						<p className="text-xs uppercase tracking-[0.3em] text-zinc-500">
							Cadastro
						</p>
						<div className="mt-4 space-y-4 text-sm text-zinc-300">
							<div>
								<label htmlFor="rule-name" className="text-xs uppercase tracking-[0.2em] text-zinc-500">
									Nome
								</label>
								<input
									id="rule-name"
									value={name}
									onChange={(event) => setName(event.target.value)}
									className="mt-2 w-full border border-border-subtle bg-transparent px-3 py-2 text-sm"
									placeholder="regra-pagamento-alto"
								/>
							</div>
							<div>
								<label htmlFor="rule-event-type" className="text-xs uppercase tracking-[0.2em] text-zinc-500">
									Tipo de evento
								</label>
								<input
									id="rule-event-type"
									value={eventType}
									onChange={(event) => setEventType(event.target.value)}
									className="mt-2 w-full border border-border-subtle bg-transparent px-3 py-2 text-sm"
									placeholder="payment.created"
								/>
							</div>
							<div>
								<label htmlFor="rule-condition" className="text-xs uppercase tracking-[0.2em] text-zinc-500">
									Condition (JSONLogic)
								</label>
								<textarea
									id="rule-condition"
									value={condition}
									onChange={(event) => setCondition(event.target.value)}
									className="mt-2 h-32 w-full border border-border-subtle bg-transparent px-3 py-2 text-xs"
								/>
							</div>
							<div>
								<label htmlFor="rule-action" className="text-xs uppercase tracking-[0.2em] text-zinc-500">
									Action (JSON)
								</label>
								<textarea
									id="rule-action"
									value={action}
									onChange={(event) => setAction(event.target.value)}
									className="mt-2 h-32 w-full border border-border-subtle bg-transparent px-3 py-2 text-xs"
								/>
							</div>
							<div className="flex items-center gap-3">
								<label htmlFor="rule-active" className="text-xs uppercase tracking-[0.2em] text-zinc-500">
									Ativa
								</label>
								<input
									id="rule-active"
									type="checkbox"
									checked={active}
									onChange={(event) => setActive(event.target.checked)}
									className="h-4 w-4"
								/>
							</div>
							<div className="flex flex-col gap-2 md:flex-row">
								<Button
									onClick={onSubmit}
									className="border border-border-subtle bg-transparent text-foreground hover:bg-white/5"
								>
									{selectedRule ? "Salvar alterações" : "Criar regra"}
								</Button>
								<Button
									variant="outline"
									className="border-border-subtle"
									onClick={resetForm}
								>
									Limpar
								</Button>
							</div>
							{error ? <p className="text-xs text-danger">{error}</p> : null}
						</div>
					</div>

					<div className="border border-border-subtle p-5">
						<p className="text-xs uppercase tracking-[0.3em] text-zinc-500">
							Registradas
						</p>
						{loading ? (
							<p className="mt-4 text-sm text-zinc-400">Carregando...</p>
						) : (
							<Table>
								<TableHeader>
									<TableRow className="border-border-subtle">
										<TableHead className="text-xs uppercase tracking-[0.2em] text-zinc-500">
											Nome
										</TableHead>
										<TableHead className="text-xs uppercase tracking-[0.2em] text-zinc-500">
											Tipo
										</TableHead>
										<TableHead className="text-xs uppercase tracking-[0.2em] text-zinc-500">
											Status
										</TableHead>
										<TableHead className="text-xs uppercase tracking-[0.2em] text-zinc-500">
											Ações
										</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{rules.map((rule) => (
										<TableRow key={rule.id} className="border-border-subtle text-sm">
											<TableCell className="font-medium text-zinc-100">
												{rule.name}
											</TableCell>
											<TableCell className="text-zinc-300">
												{rule.event_type}
											</TableCell>
											<TableCell>
												<Badge className="border border-border-subtle text-zinc-300">
													{rule.active ? "Ativa" : "Inativa"}
												</Badge>
											</TableCell>
											<TableCell className="flex flex-col gap-2 text-zinc-300 md:flex-row">
												<Button
													variant="outline"
													className="border-border-subtle"
													onClick={() => fillFromRule(rule)}
												>
													Editar
												</Button>
												<Button
													variant="outline"
													className="border-border-subtle text-danger"
													onClick={() => onDeactivate(rule.id)}
												>
													Desativar
												</Button>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						)}
					</div>
				</section>
			</div>
		</div>
	);
}
