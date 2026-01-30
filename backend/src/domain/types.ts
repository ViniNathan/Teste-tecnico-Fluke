// TIPOS DE EVENTOS

// JSON TYPES (usado para JSONLogic)
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
	| JsonPrimitive
	| { [key: string]: JsonValue }
	| JsonValue[];

// Expressão JSONLogic (estrutura JSON)
export type JsonLogicExpression = { [key: string]: JsonValue } | JsonValue[];

// Estados possíveis do evento:
// - pending: aguardando processamento
// - processing: sendo processado pelo worker
// - processed: processado com sucesso
// - failed: erro no processamento
export type EventState = 'pending' | 'processing' | 'processed' | 'failed';

// Entidade de evento (banco de dados)
// Imutável após criação (exceto estado).
export interface Event {
	id: number;
	external_id: string;
	type: string;
	payload: Record<string, JsonValue>;
	state: EventState;
	received_count: number;
	created_at: Date;
	processing_started_at: Date | null;
	processed_at: Date | null;
	replayed_at: Date | null;
}

// Payload para criação de evento (POST /events)
export interface EventCreatePayload {
	id: string; // ID externo
	type: string; // Tipo do evento (ex: 'order.created')
	data: Record<string, JsonValue>; // Payload JSON arbitrário
}

// Evento com histórico de tentativas
export interface EventWithAttempts extends Event {
	attempts: EventAttempt[];
}

// TIPOS DE TENTATIVA DE EVENTO

// Status da tentativa: sucesso ou falha
export type AttemptStatus = 'success' | 'failed';

// Tentativa de processamento
// Criada a cada execução (incluindo retries).
export interface EventAttempt {
	id: number;
	event_id: number;
	status: AttemptStatus | null; // null durante execução
	error: string | null; // erro + stack trace se falhar
	started_at: Date;
	finished_at: Date | null;
	duration_ms: number | null;
}

// Tentativa com regras aplicadas (frontend)
export interface EventAttemptWithRules extends EventAttempt {
	rule_executions: RuleExecution[];
}

// TIPOS DE REGRA

// Entidade de regra (banco de dados)
// Versionada via current_version_id.
export interface Rule {
	id: number;
	name: string;
	event_type: string; // Tipo de evento alvo
	active: boolean; // Se falso, ignora regra
	current_version_id: number | null;
	created_at: Date;
	updated_at: Date;
}

// Regra com versão atual (API)
export interface RuleWithVersion extends Rule {
	current_version: RuleVersion | null;
}

// Versão da regra (banco de dados)
// Permite replay determinístico com versão antiga.
export interface RuleVersion {
	id: number;
	rule_id: number;
	condition: JsonLogicExpression; // Expressão JSONLogic
	action: Action; // Ação serializada
	version: number; // Número sequencial da versão
	created_at: Date;
}

// Payload para criar regra
export interface RuleCreatePayload {
	name: string;
	event_type: string;
	condition: JsonLogicExpression;
	action: Action;
	active?: boolean;
}

// Payload para atualizar regra
// Alterar condição ou ação cria nova versão.
export interface RuleUpdatePayload {
	name?: string;
	event_type?: string;
	condition?: JsonLogicExpression;
	action?: Action;
	active?: boolean;
}

// TIPOS DE AÇÃO

// Interface base para ações
export interface BaseAction {
	type: string;
	params: Record<string, JsonValue>;
}

// Ação de Enviar Email
// AVISO: Não é idempotente! Replay envia duplicado.
export interface SendEmailAction extends BaseAction {
	type: 'send_email';
	params: {
		to: string; // Destinatário
		subject: string; // Assuntos
		template: string; // Template ID
		data?: Record<string, JsonValue>; // Variáveis do template
	};
}

// Ação de Webhook
// AVISO: Não é idempotente sem suporte da API destino.
export interface CallWebhookAction extends BaseAction {
	type: 'call_webhook';
	params: {
		url: string;
		method: 'POST' | 'PUT' | 'PATCH';
		headers?: Record<string, string>;
		body?: JsonValue;
	};
}

// Ação de Log
// Idempotente: Seguro para replay.
export interface LogAction extends BaseAction {
	type: 'log';
	params: {
		level: 'info' | 'warn' | 'error';
		message: string;
	};
}

// Ação No-op (faz nada)
// Idempotente: Seguro para replay.
export interface NoopAction extends BaseAction {
	type: 'noop';
	params: Record<string, never>; // Objeto vazio
}

// União de todos os tipos de ação
// TypeScript infere tipo pelo campo 'type'.
export type Action =
	| SendEmailAction
	| CallWebhookAction
	| LogAction
	| NoopAction;

// TIPOS DE EXECUÇÃO DE REGRA

// Resultado da execução da regra
// - applied: condição bateu, ação executada
// - skipped: condição não bateu
// - failed: erro na execução
export type RuleExecutionResult = 'applied' | 'skipped' | 'failed' | 'deduped';

// Registro de execução de regra
// Rastreia regras avaliadas em cada tentativa.
export interface RuleExecution {
	id: number;
	attempt_id: number;
	rule_id: number;
	rule_version_id: number;
	result: RuleExecutionResult;
	error: string | null;
	executed_at: Date;
}

// Execução com detalhes da regra (API)
export interface RuleExecutionWithDetails extends RuleExecution {
	rule_name: string;
	rule_version: number;
	condition: JsonLogicExpression;
	action: Action;
}

// FILTROS DE CONSULTA

// Filtros para listar eventos
export interface EventFilters {
	state?: EventState;
	type?: string;
	start_date?: string;
	end_date?: string;
	limit?: number;
	offset?: number;
}

// Filtros para listar regras
export interface RuleFilters {
	active?: boolean;
	event_type?: string;
	limit?: number;
	offset?: number;
}

// ESTATÍSTICAS E MÉTRICAS

// Estatísticas de processamento (dashboard)
export interface EventStatistics {
	total: number;
	pending: number;
	processing: number;
	processed: number;
	failed: number;
	success_rate: number; // porcentagem
	failed_last_24h?: number;
}

// Métricas de performance
export interface ProcessingMetrics {
	events_per_hour: number;
	average_duration_ms: number;
	failure_rate: number; // porcentagem
}
