import swaggerJSDoc from 'swagger-jsdoc';

const options: swaggerJSDoc.Options = {
	definition: {
		openapi: '3.0.0',
		info: {
			title: 'Event Processing Platform API',
			version: '1.0.0',
			description: `
API para processamento de eventos com regras dinâmicas.

## Funcionalidades

- **Eventos**: Ingestão, listagem e consulta de eventos
- **Regras**: Criação e gerenciamento de regras com JSONLogic
- **Replay**: Reprocessamento de eventos falhados ou processados

## Estados de Evento

| Estado | Descrição |
|--------|-----------|
| \`pending\` | Aguardando processamento |
| \`processing\` | Sendo processado pelo worker |
| \`processed\` | Processado com sucesso |
| \`failed\` | Erro no processamento |

## Tipos de Ação

- \`send_email\`: Envia email (não idempotente)
- \`call_webhook\`: Chama webhook externo (não idempotente)
- \`log\`: Registra log (idempotente)
- \`noop\`: Não faz nada (idempotente)
			`,
		},
		servers: [
			{
				url: 'http://localhost:3000',
				description: 'Development Server',
			},
		],
		tags: [
			{ name: 'Events', description: 'Gerenciamento de eventos' },
			{
				name: 'Rules',
				description: 'Gerenciamento de regras de processamento',
			},
			{ name: 'Replay', description: 'Reprocessamento de eventos' },
		],
		components: {
			schemas: {
				Error: {
					type: 'object',
					properties: {
						error: { type: 'string' },
						message: { type: 'string' },
						details: { type: 'object' },
					},
				},
				Event: {
					type: 'object',
					properties: {
						id: { type: 'integer' },
						external_id: { type: 'string' },
						type: { type: 'string' },
						payload: { type: 'object' },
						state: {
							type: 'string',
							enum: ['pending', 'processing', 'processed', 'failed'],
						},
						received_count: { type: 'integer' },
						created_at: { type: 'string', format: 'date-time' },
						processing_started_at: {
							type: 'string',
							format: 'date-time',
							nullable: true,
						},
						processed_at: {
							type: 'string',
							format: 'date-time',
							nullable: true,
						},
						replayed_at: {
							type: 'string',
							format: 'date-time',
							nullable: true,
						},
					},
				},
				Rule: {
					type: 'object',
					properties: {
						id: { type: 'integer' },
						name: { type: 'string' },
						event_type: { type: 'string' },
						active: { type: 'boolean' },
						created_at: { type: 'string', format: 'date-time' },
						updated_at: { type: 'string', format: 'date-time' },
						current_version: {
							type: 'object',
							nullable: true,
							properties: {
								id: { type: 'integer' },
								condition: { type: 'object' },
								action: { type: 'object' },
								version: { type: 'integer' },
								created_at: { type: 'string', format: 'date-time' },
							},
						},
					},
				},
				ListResponse: {
					type: 'object',
					properties: {
						data: { type: 'array', items: {} },
						count: { type: 'integer' },
						limit: { type: 'integer' },
						offset: { type: 'integer' },
					},
				},
			},
		},
	},
	apis: ['./src/api/controllers/*.ts'],
};

export const swaggerSpec = swaggerJSDoc(options);
