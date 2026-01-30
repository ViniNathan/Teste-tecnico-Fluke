"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { createEvent } from "@/lib/api";

const defaultData = '{\n  "example": "payload"\n}';

export function CreateEventDialog() {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [id, setId] = useState("");
	const [type, setType] = useState("");
	const [dataRaw, setDataRaw] = useState(defaultData);
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);
		setSubmitting(true);

		const idTrimmed = id.trim();
		const typeTrimmed = type.trim();

		if (!idTrimmed) {
			setError("Identificador externo é obrigatório.");
			setSubmitting(false);
			return;
		}
		if (!typeTrimmed) {
			setError("Tipo do evento é obrigatório.");
			setSubmitting(false);
			return;
		}

		let data: Record<string, unknown>;
		try {
			data = JSON.parse(dataRaw) as Record<string, unknown>;
			if (data === null || typeof data !== "object" || Array.isArray(data)) {
				setError("Payload deve ser um objeto JSON.");
				setSubmitting(false);
				return;
			}
		} catch {
			setError("Payload inválido: use um objeto JSON válido.");
			setSubmitting(false);
			return;
		}

		try {
			const created = await createEvent({
				id: idTrimmed,
				type: typeTrimmed,
				data,
			});
			setOpen(false);
			setId("");
			setType("");
			setDataRaw(defaultData);
			router.push(`/events/${created.id}`);
			router.refresh();
		} catch (err) {
			setError(
				err instanceof Error
					? err.message
					: "Erro ao criar evento. Tente novamente.",
			);
		} finally {
			setSubmitting(false);
		}
	};

	const handleOpenChange = (next: boolean) => {
		if (!next) {
			setError(null);
		}
		setOpen(next);
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogTrigger asChild>
				<Button
					className="gap-2 border border-border-subtle bg-transparent text-foreground hover:bg-white/5"
					type="button"
				>
					<Plus className="h-4 w-4" />
					Novo evento
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Ingerir evento</DialogTitle>
					<DialogDescription>
						Envie um evento para processamento. O payload deve ser um objeto
						JSON. Duplicatas (mesmo id) incrementam received_count.
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={handleSubmit} className="flex flex-col gap-4">
					<div>
						<label
							htmlFor="create-event-id"
							className="text-xs uppercase tracking-[0.2em] text-zinc-500"
						>
							Identificador externo
						</label>
						<input
							id="create-event-id"
							type="text"
							value={id}
							onChange={(e) => setId(e.target.value)}
							placeholder="ex: order-123"
							className="mt-2 w-full border border-border-subtle bg-transparent px-3 py-2 text-sm text-foreground"
							disabled={submitting}
						/>
					</div>
					<div>
						<label
							htmlFor="create-event-type"
							className="text-xs uppercase tracking-[0.2em] text-zinc-500"
						>
							Tipo
						</label>
						<input
							id="create-event-type"
							type="text"
							value={type}
							onChange={(e) => setType(e.target.value)}
							placeholder="ex: order.created"
							className="mt-2 w-full border border-border-subtle bg-transparent px-3 py-2 text-sm text-foreground"
							disabled={submitting}
						/>
					</div>
					<div>
						<label
							htmlFor="create-event-data"
							className="text-xs uppercase tracking-[0.2em] text-zinc-500"
						>
							Payload (JSON)
						</label>
						<textarea
							id="create-event-data"
							value={dataRaw}
							onChange={(e) => setDataRaw(e.target.value)}
							rows={6}
							className="mt-2 w-full border border-border-subtle bg-transparent px-3 py-2 font-mono text-xs text-foreground"
							placeholder='{ "key": "value" }'
							disabled={submitting}
						/>
					</div>
					{error ? (
						<p className="text-sm text-danger" role="alert">
							{error}
						</p>
					) : null}
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							className="border-border-subtle bg-transparent text-foreground hover:bg-white/5"
							onClick={() => setOpen(false)}
							disabled={submitting}
						>
							Cancelar
						</Button>
						<Button
							type="submit"
							className="border border-border-subtle bg-transparent text-foreground hover:bg-white/5"
							disabled={submitting}
						>
							{submitting ? "Enviando…" : "Enviar"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
