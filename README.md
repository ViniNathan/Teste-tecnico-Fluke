# Event Processing Platform

Uma plataforma mínima de processamento de eventos assíncronos com regras dinâmicas, replay consciente e rastreamento completo de estados.

**Desafio Técnico:** Sistema orientado a eventos onde duplicatas, falhas e mudanças de regras são comportamentos normais, não exceções.

---

## 📋 Índice

- [Visão Geral](#visão-geral)
- [Arquitetura](#arquitetura)
- [Instalação e Execução](#instalação-e-execução)
- [Funcionalidades](#funcionalidades)
- [Decisões Técnicas e Trade-offs](#decisões-técnicas-e-trade-offs)
- [Perguntas Obrigatórias](#perguntas-obrigatórias)
- [Limitações Conhecidas](#limitações-conhecidas)

---

## Visão Geral

Este sistema processa eventos externos de forma assíncrona, aplicando regras dinâmicas que podem ser modificadas durante a execução. É consciente de suas limitações e deixa explícito:

- ✅ **O que garante**: Deduplicação por `external_id`, isolamento de falhas, rastreamento completo
- ⚠️ **O que NÃO garante**: Ordem de processamento, execução exatamente uma vez (exactly-once)
- 🔍 **O que expõe**: Estados, erros, tentativas, versões de regras aplicadas

### Stack

- **Backend**: Node.js 20+ | TypeScript | Express | PostgreSQL 16 | Pino | Zod | JSONLogic | WebSocket
- **Frontend**: Next.js 16 | React 19 | TypeScript | Tailwind CSS | Radix UI
- **Infraestrutura**: Docker | node-pg-migrate

---

### Componentes

1. **API Server** (`backend/src/api/server.ts`):
   - REST API para ingestão, consulta e replay
   - WebSocket bridge (Postgres NOTIFY → clients)
   - Middleware: CORS, logging, validação, error handling

2. **Worker** (`backend/src/worker/worker.ts`):
   - Processa eventos em loop infinito (polling)
   - Claim atômico com `FOR UPDATE SKIP LOCKED`
   - Timeout configurável por processamento
   - Isolamento: falha em uma regra não afeta outras

3. **Database Schema** (`backend/src/db/migrations/`):
   - `events`: Eventos recebidos (estados: pending → processing → processed/failed)
   - `event_attempts`: Histórico de tentativas
   - `rules`: Regras com versionamento
   - `rule_versions`: Condições (JSONLogic) e ações versionadas
   - `rule_executions`: Registro de cada avaliação de regra

4. **Frontend** (`frontend/app/`):
   - `/`: Landing page
   - `/events`: Lista de eventos com filtros e stats
   - `/events/[id]`: Detalhes, histórico e replay
   - `/rules`: CRUD de regras com editor JSON

---

## Instalação e Execução

### Pré-requisitos

- Node.js 20+
- Docker e Docker Compose
- npm ou pnpm

### 1. Clone o Repositório

```bash
git clone <repository-url>
cd Teste-tecnico-Fluke
```

### 2. Inicie o Banco de Dados

```bash
cd backend
docker-compose up -d
```

Aguarde o healthcheck (5-10 segundos):

```bash
docker-compose ps
# postgres deve estar "healthy"
```

### 3. Configure Variáveis de Ambiente

**Backend** (`backend/.env`):

```bash
cp .env.example .env
# Editar se necessário (valores padrão funcionam com Docker Compose)
```

Variáveis importantes:

- `DATABASE_URL`: Conexão Postgres (padrão: `postgres://postgres:postgres@localhost:5432/event_platform`)
- `WORKER_POLL_INTERVAL_MS`: Intervalo de polling (padrão: 1000ms)
- `PROCESSING_TIMEOUT_MS`: Timeout por evento (padrão: 60000ms)
- `EMAIL_MODE`: `disabled` ou `log` (simula envio de emails)
- `CORS_ORIGIN`: Frontend URL (padrão: `http://localhost:3001`)

**Frontend** (`frontend/.env.local`):

```bash
cp .env.example .env.local
```

- `NEXT_PUBLIC_API_BASE_URL`: Backend URL (padrão: `http://localhost:3000`)
- `NEXT_PUBLIC_WS_URL`: WebSocket URL (padrão: `ws://localhost:3000/ws`)

### 4. Instale Dependências e Execute Migrações

**Backend**:

```bash
cd backend
npm install
npm run db:up  # Executa migrações
```

### 5. Inicie os Serviços

**Terminal 1 - API Server**:

```bash
cd backend
npm run dev
# Server running on http://localhost:3000
```

**Terminal 2 - Worker**:

```bash
cd backend
npm run worker
# Worker started, polling for events...
```

**Terminal 3 - Frontend**:

```bash
cd frontend
npm install
npm run dev
# Next.js running on http://localhost:3001
```

### 6. Teste a Instalação

**Crie um evento**:

```bash
curl -X POST http://localhost:3000/events \
  -H "Content-Type: application/json" \
  -d '{
    "id": "order-123",
    "type": "order.created",
    "data": { "amount": 100, "user_id": "user-456" }
  }'
```

**Crie uma regra**:

```bash
curl -X POST http://localhost:3000/rules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Log high value orders",
    "event_type": "order.created",
    "condition": { ">=": [{ "var": "amount" }, 50] },
    "action": {
      "type": "log",
      "params": { "level": "info", "message": "High value order detected" }
    },
    "active": true
  }'
```

Acesse o console: **http://localhost:3001/events**

---

## Funcionalidades

### 1. Ingestão de Eventos

**Endpoint**: `POST /events`

**Payload**:

```json
{
  "id": "external-id-123",       // ID externo (único)
  "type": "payment.completed",   // Tipo do evento
  "data": { "amount": 250 }      // Payload arbitrário (JSON)
}
```

**Comportamento com Duplicatas**:

- Se `external_id` já existe: incrementa `received_count`, **NÃO reprocessa**
- Motivação: Evitar duplicação de ações externas (emails, webhooks) em retries
- Limitação: Payloads diferentes com mesmo `external_id` são ignorados

### 2. Regras Dinâmicas

**Estrutura de Regra**:

```json
{
  "name": "Webhook on fraud suspicion",
  "event_type": "payment.completed",
  "condition": {
    "and": [
      { ">": [{ "var": "amount" }, 10000] },
      { "==": [{ "var": "country" }, "BR"] }
    ]
  },
  "action": {
    "type": "call_webhook",
    "params": {
      "url": "https://api.fraud-detection.com/alerts",
      "method": "POST",
      "body": { "event_id": "{{ external_id }}" }
    }
  },
  "active": true
}
```

**Condições**: [JSONLogic](http://jsonlogic.com/) - avalia `condition` contra `event.data`

**Ações Suportadas**:

| Tipo | Idempotente? | Descrição |
|------|-------------|-----------|
| `log` | ✅ Sim | Logging estruturado |
| `noop` | ✅ Sim | No-operation (testes) |
| `call_webhook` | ⚠️ Não* | HTTP request externo |
| `send_email` | ⚠️ Não* | Envio de email (simulado com `EMAIL_MODE=log`) |

\* *Dedupadas no replay - ver [Replay](#3-replay)*

### 3. Replay

**Endpoint**: `POST /events/:id/replay`

**Comportamento**:

1. Valida estado (`processed` ou `failed` apenas)
2. Marca `replayed_at` timestamp
3. Retorna evento para `pending`
4. Worker reprocessa com **regras atuais** (não versão original)

**Deduplicação de Ações Não-Idempotentes**:

- Sistema verifica `rule_executions` anteriores
- Se ação já foi `applied` ou `deduped`: pula execução, marca `deduped`
- **Garantia**: At-most-once execution para webhooks e emails
- **Falha**: Se `rule_version_id` mudou, deduplicação NÃO funciona

### 4. Rastreamento Completo

**Por Evento**:

- `GET /events/:id` → Estado atual, timestamps
- `GET /events/:id/attempts` → Histórico de tentativas com:
  - `status`: `success` | `failed`
  - `error`: Stack trace completo
  - `duration_ms`: Tempo de processamento
  - `rule_executions`: Regras avaliadas (applied/skipped/failed/deduped)

**Agregado**:

- `GET /events/stats` → Total, pending, processing, processed, failed, failed_last_24h

---

## Decisões Técnicas e Trade-offs

### 1. Polling vs. Queue (RabbitMQ, SQS)

**Escolha**: Polling com `FOR UPDATE SKIP LOCKED`

**Justificativa**:
- ✅ Simplicidade: Sem infraestrutura adicional
- ✅ Transacional: Claim + processamento em uma transação
- ✅ Suficiente para escala moderada (centenas de eventos/segundo)

**Trade-off**:
- ❌ Não escala para milhões de eventos/segundo
- ❌ Polling constante (CPU ociosa se sem eventos)

**Alternativa para produção**: Queue distribuída com workers horizontalmente escaláveis

---

### 2. Deduplicação por `external_id`

**Escolha**: Constraint UNIQUE em `external_id`

**Justificativa**:
- ✅ Previne duplicação de ações externas (at-most-once ingestion)
- ✅ Permite retries idempotentes do cliente

**Trade-off**:
- ⚠️ Race condition: Janela < 1ms onde dois requests simultâneos podem criar duplicata (improvável, mas possível)
- ❌ Payload diferente com mesmo ID é ignorado

**Mitigação**: Cliente deve usar `external_id` semanticamente único (ex: `order-123`, não `retry-1`)

---

### 3. Replay com Regras Atuais (não versionadas)

**Escolha**: Replay usa `current_version_id` das regras

**Justificativa**:
- ✅ Permite corrigir bugs em regras (replay com lógica atualizada)
- ✅ Simplifica lógica (não precisa armazenar snapshot de regras)

**Trade-off**:
- ⚠️ **Não-determinístico**: Replay pode produzir resultado diferente do original
- ❌ Dificulta auditoria ("por que este evento teve resultado X?")

**Alternativa não implementada**: Armazenar `rule_version_id` aplicada e permitir replay com versão específica

---

### 4. Deduplicação de Ações Não-Idempotentes

**Escolha**: Query `rule_executions` para verificar se ação já foi aplicada

**Justificativa**:
- ✅ Previne envio duplicado de emails/webhooks em replays
- ✅ Trade-off consciente entre performance e segurança

**Trade-off**:
- ❌ Query adicional por replay (JOIN em `event_attempts` + `rule_executions`)
- ⚠️ Falha se `rule_version_id` mudou (interpreta como regra diferente)

**Limitação consciente**: Se regra muda (nova versão), ação é reexecutada

---

### 5. Worker Single-Threaded

**Escolha**: Um worker processa um evento por vez

**Justificativa**:
- ✅ Simplicidade: Sem locks, sem race conditions
- ✅ Suficiente para MVP (throughput ~10-100 eventos/segundo)

**Trade-off**:
- ❌ Throughput limitado por latência de ações (webhooks lentos bloqueiam tudo)

**Alternativa para produção**: Pool de workers (múltiplos processos/threads)

---

## Perguntas Obrigatórias

### 1. Em que cenários este sistema pode produzir resultados inconsistentes?

#### a) Replay com Regras Modificadas
**Cenário**: Evento processado com Regra v1, depois reprocessado com Regra v2 (condição ou ação diferente).

**Exemplo**:
- Processamento original: Regra "enviar email se `amount > 100`" → Email enviado
- Regra atualizada: Condição mudou para `amount > 200`
- Replay: Condição não bate mais, email NÃO é enviado

**Resultado inconsistente**: Histórico mostra duas tentativas com resultados diferentes para o mesmo evento.

**Por que acontece**: Sistema usa `current_version_id` no replay, não a versão original.

---

#### b) Race Condition na Deduplicação
**Cenário**: Dois requests simultâneos criam evento com mesmo `external_id`.

**Timing crítico** (janela < 1ms):

```
T0: Request A → SELECT * FROM events WHERE external_id = 'x' → Não encontrado
T1: Request B → SELECT * FROM events WHERE external_id = 'x' → Não encontrado
T2: Request A → INSERT INTO events (external_id = 'x') → Sucesso
T3: Request B → INSERT INTO events (external_id = 'x') → CONFLITO (bloqueado por constraint UNIQUE)
```

**Resultado esperado**: Request B retorna 201 com evento existente (incrementa `received_count`).

**Resultado em caso de failure**: Se constraint falhar (improvável), duplicata criada.

**Probabilidade**: Extremamente baixa (< 0.001%) com índice UNIQUE.

---

#### c) Worker Crash Durante Transação
**Cenário**: Worker morre após executar ação externa, mas antes de COMMIT.

**Fluxo**:

1. Worker marca evento como `processing`
2. Executa webhook (sucesso, servidor externo recebeu)
3. **CRASH** (antes de `COMMIT`)
4. Evento volta para `pending` (transação abortada)
5. Novo worker reprocessa → Webhook executado novamente

**Resultado inconsistente**: Ação externa executada 2x, mas banco mostra apenas 1 tentativa.

**Por que acontece**: Ações externas não são transacionais com o banco.

---

#### d) Timeout com Ação Parcialmente Executada
**Cenário**: Processamento excede timeout (60s), mas webhook já foi enviado.

**Fluxo**:

1. Worker inicia processamento
2. Webhook demora 65 segundos (timeout = 60s)
3. Timeout handler marca evento como `failed`, volta para `pending`
4. Novo worker reprocessa → Webhook enviado novamente

**Resultado inconsistente**: Webhook duplicado, evento marcado como falho.

---

### 2. Que garantias de idempotência existem — e onde elas falham?

#### Garantias Implementadas

##### a) Ingestão Idempotente (At-Most-Once Ingestion)
**Garantia**: Mesmo `external_id` enviado N vezes → evento criado **UMA** vez.

**Implementação**:

```sql
INSERT INTO events (external_id, type, payload, state)
VALUES ($1, $2, $3, 'pending')
ON CONFLICT (external_id)
DO UPDATE SET received_count = events.received_count + 1
```

**Onde funciona**: ✅ Retries do cliente (ex: network timeout)

**Onde falha**: ⚠️ Payloads diferentes com mesmo `external_id` (segundo payload ignorado)

---

##### b) Ações Idempotentes (Log, Noop)
**Garantia**: Replay de `log` ou `noop` **sempre** produz mesmo resultado.

**Implementação**: Ações sem efeitos colaterais externos.

**Onde funciona**: ✅ Replay ilimitado sem duplicação

**Onde falha**: ❌ Nunca (são verdadeiramente idempotentes)

---

##### c) Deduplicação de Ações Não-Idempotentes (At-Most-Once Execution)
**Garantia**: Replay **não reexecuta** ações `send_email` ou `call_webhook` já aplicadas.

**Implementação**:

```typescript
const alreadyApplied = await wasRuleAppliedForEvent(
  client,
  eventId,
  ruleVersionId
);

if (alreadyApplied) {
  result = 'deduped'; // Pula ação
}
```

**Onde funciona**:
- ✅ Replay com mesma `rule_version_id`
- ✅ Múltiplos replays do mesmo evento

**Onde falha**:
- ❌ Se regra foi atualizada (`rule_version_id` diferente) → ação reexecutada
- ❌ Se worker crashou antes de registrar `rule_executions` → deduplicação falha

---

#### Não-Garantias Explícitas

##### a) Exactly-Once Execution
**NÃO garantido**: Ações externas podem ser executadas mais de uma vez.

**Cenários de duplicação**:
- Worker timeout (ação executada, mas transação abortada)
- Regra atualizada (nova `rule_version_id` → deduplica falha)

**Recomendação**: APIs externas devem ser idempotentes (ex: webhook com `idempotency_key`).

---

##### b) Ordem de Processamento
**NÃO garantido**: Eventos não são processados em ordem de `created_at`.

**Por que**: Worker usa `ORDER BY created_at ASC` + `SKIP LOCKED`, mas eventos podem chegar fora de ordem ou processar em paralelo (múltiplos workers).

---

### 3. O que acontece se dois eventos iguais forem processados ao mesmo tempo?

Este cenário depende de "iguais" significar **mesmo `external_id`** ou **eventos distintos com payload idêntico**.

#### Cenário A: Mesmo `external_id` (Duplicata Real)

**Setup**: Dois requests HTTP simultâneos criam evento `external_id = "order-123"`.

**Fluxo no Banco (com constraint UNIQUE)**:

```sql
-- Request A (T0)
BEGIN;
INSERT INTO events (external_id, ...) VALUES ('order-123', ...); -- Sucesso
COMMIT; -- T2

-- Request B (T1, microsegundos depois)
BEGIN;
INSERT INTO events (external_id, ...) VALUES ('order-123', ...); -- CONFLITO
-- Constraint UNIQUE DEFER ou ON CONFLICT dispara:
DO UPDATE SET received_count = events.received_count + 1;
COMMIT; -- T3
```

**Resultado**:
- ✅ **Um** evento criado (id = 1)
- ✅ `received_count = 2` (incrementado)
- ✅ Ambos requests retornam 201 com mesmo evento
- ✅ Worker processa **UMA** vez (estado = `pending` apenas no primeiro INSERT)

**Proteção**: Constraint `UNIQUE (external_id)` + `ON CONFLICT`.

---

#### Cenário B: Payloads Idênticos, IDs Externos Diferentes

**Setup**: Dois eventos distintos (`order-123`, `order-456`) com `data = { "amount": 100 }`.

**Fluxo**:

```
Worker 1 (T0):
  - Claim evento "order-123" (FOR UPDATE SKIP LOCKED)
  - Processa regras

Worker 2 (T1, simultaneamente):
  - Claim evento "order-456" (SKIP LOCKED impede pegar "order-123")
  - Processa regras
```

**Resultado**:
- ✅ Processados em **paralelo** (sem lock)
- ✅ Cada evento tem sua própria transação
- ⚠️ Se mesma regra aplicar ação externa (ex: webhook) → duplicação legítima (eventos diferentes)

**Proteção**: `FOR UPDATE SKIP LOCKED` evita processar **mesmo** evento 2x, mas não evita ações duplicadas para eventos diferentes.

---

#### Cenário C: Dois Workers Claim Mesmo Evento (Impossível)

**Por que impossível**:

```sql
SELECT id FROM events WHERE state = 'pending'
ORDER BY created_at ASC
LIMIT 1
FOR UPDATE SKIP LOCKED;
```

- `FOR UPDATE`: Bloqueia row
- `SKIP LOCKED`: Se row já bloqueada, pula (retorna vazio)

**Garantia**: Apenas **UM** worker pode claim cada evento.

---

### 4. O que você mudaria para lidar com concorrência real?

**Contexto**: "Concorrência real" = milhares de eventos/segundo, múltiplos workers, alta disponibilidade.

#### Mudanças de Arquitetura

##### a) Queue Distribuída (RabbitMQ, AWS SQS, Kafka)

**Por que**: Polling não escala além de ~1000 eventos/segundo.

**Implementação**:

```
API → Publish to Queue → [Worker 1, Worker 2, ..., Worker N]
```

**Benefícios**:
- ✅ Throughput horizontal (adicionar workers sem modificar código)
- ✅ Backpressure automático (queue buffer)
- ✅ Dead letter queue para eventos falhos

**Trade-off**:
- ❌ Infraestrutura adicional (RabbitMQ cluster)
- ❌ Complexidade operacional (monitoring, configuração)

---

##### b) Particionamento por Tipo de Evento

**Por que**: Eventos de tipos diferentes não competem por workers.

**Implementação**:

```
Queue "payment.created" → Worker Pool 1 (3 workers)
Queue "order.shipped"   → Worker Pool 2 (2 workers)
```

**Benefícios**:
- ✅ Scaling independente (mais workers para tipos críticos)
- ✅ Isolamento de falhas (bug em regra de "payment" não afeta "order")

**Trade-off**:
- ❌ Overhead de configuração (N queues × M workers)

---

##### c) Database Sharding por Event Type

**Por que**: Evitar lock contention em tabela `events` gigante.

**Implementação**:

```
events_payment (partition por type = 'payment.*')
events_order   (partition por type = 'order.*')
```

**Benefícios**:
- ✅ Queries mais rápidas (menos rows)
- ✅ Vacuum/maintenance paralelo

**Trade-off**:
- ❌ Complexidade de queries cross-partition
- ❌ Migração trabalhosa de schema existente

---

##### d) Connection Pooling Otimizado

**Problema atual**: Cada worker usa uma conexão do pool por evento.

**Solução**:

```typescript
// Atual: pool.connect() → claim → process → release
// Otimizado: Pool dedicado por worker + reuso de conexão
const worker = new Worker({ dedicatedConnection: true });
```

**Benefícios**:
- ✅ Reduz overhead de `BEGIN/COMMIT`
- ✅ Menos contenção no pool (max_connections de Postgres)

---

##### e) Caching de Regras

**Problema atual**: Cada processamento carrega regras do banco.

**Solução**:

```typescript
const rulesCache = new LRUCache({ max: 1000, ttl: 60000 });
const rules = await rulesCache.getOrLoad(eventType, () => loadRules(eventType));
```

**Benefícios**:
- ✅ Reduz queries ao banco (regras mudam raramente)

**Trade-off**:
- ⚠️ Staleness: Worker pode usar regra desatualizada por até TTL (60s)
- ❌ Invalidação de cache complexa (precisa de pub/sub ou polling)

---

#### Mudanças de Lógica

##### f) Retry Exponencial com Backoff

**Problema atual**: Evento falho fica `failed` até replay manual.

**Solução**:

```typescript
const retryConfig = {
  maxRetries: 3,
  backoff: [1000, 5000, 30000] // 1s, 5s, 30s
};
```

**Benefícios**:
- ✅ Falhas transitórias (network timeout) são recuperadas automaticamente

**Trade-off**:
- ❌ Eventos permanentemente quebrados (bug na regra) ficam em loop

**Mitigação**: Dead letter queue após N tentativas.

---

##### g) Timeout Dinâmico por Tipo de Evento

**Problema atual**: Timeout global de 60s (eventos rápidos desperdiçam tempo).

**Solução**:

```json
{
  "event_type": "order.created",
  "processing_timeout_ms": 10000  // 10s (webhook rápido)
}
{
  "event_type": "report.generated",
  "processing_timeout_ms": 300000 // 5min (processamento pesado)
}
```

**Benefícios**:
- ✅ Otimiza throughput (eventos rápidos liberam worker mais cedo)

---

##### h) Sandbox para JSONLogic

**Problema atual**: Regra maliciosa pode travar worker.

**Exemplo de ataque**:

```json
{
  "condition": { "some": [ [1, 2, 3, ..., 999999], { "==": [1, 1] } ] }
}
```

**Solução**:

```typescript
import { VM } from 'vm2'; // Sandbox isolado
const result = vm.run(jsonLogic, { timeout: 1000 }); // 1s max
```

**Benefícios**:
- ✅ Previne DoS por regras maliciosas

---

### 5. Qual parte do sistema você menos confia hoje?

#### Deduplicação em Race Condition (Críticidade: Alta)

**Componente**: `POST /events` → `ON CONFLICT (external_id)`

**Problema**:

Janela de vulnerabilidade entre SELECT e INSERT:

```sql
-- Request A
SELECT * FROM events WHERE external_id = 'x'; -- T0
-- Request B
SELECT * FROM events WHERE external_id = 'x'; -- T1 (antes de A fazer INSERT)
-- Request A
INSERT INTO events (...); -- T2 → Sucesso
-- Request B
INSERT INTO events (...); -- T3 → Depende de timing
```

**Por que desconfio**:
- ⚠️ Constraint UNIQUE **provavelmente** funciona, mas edge cases de Postgres com `SERIALIZABLE` isolation podem falhar
- ❌ Sem teste de carga simulando race condition extrema

**Mitigação**:
- Teste de integração com 100 requests simultâneos para mesmo `external_id`
- Monitoramento: alarme se `received_count > 1` para eventos recentes (indica race potencial)

---

## Limitações Conhecidas

### Escala

- ⚠️ **Throughput**: ~100-500 eventos/segundo (single worker, polling)
- ⚠️ **Latência**: Mínima = `POLL_INTERVAL_MS` (1s) se fila vazia
- ❌ **Horizontal scaling**: Múltiplos workers funcionam, mas aumentam contenção no banco

### Concorrência

- ⚠️ **Race condition**: Duplicatas com janela < 1ms (mitigado por constraint UNIQUE)
- ❌ **Worker timeout**: Pode duplicar ações externas se timeout ocorrer após execução

### Idempotência

- ⚠️ **Exactly-once**: NÃO garantido para ações externas
- ⚠️ **Deduplicação**: Quebra se regra atualizada (`rule_version_id` muda)

### Replay

- ⚠️ **Não-determinístico**: Usa regras atuais (não versão original)
- ❌ **Sem histórico de payload**: Não é possível replay com payload antigo

### Segurança

- ❌ **JSONLogic sem sandbox**: Regras maliciosas podem travar worker
- ❌ **Sem autenticação**: API aberta (adicionar JWT/API keys em produção)

---

## Testes

```bash
# Backend
cd backend
npm test             # Roda todos os testes
npm run test:watch   # Watch mode

# Frontend
cd frontend
npm test
```

---

## Melhorias Futuras

1. **Queue Distribuída**: RabbitMQ ou AWS SQS
2. **Retry Automático**: Backoff exponencial
3. **Dead Letter Queue**: Eventos permanentemente falhos
4. **Sandbox JSONLogic**: VM2 ou Worker Threads
5. **Métricas**: Prometheus + Grafana
6. **Autenticação**: JWT ou API Keys

---

## Licença

MIT

---

Desenvolvido como desafio técnico para Fluke.