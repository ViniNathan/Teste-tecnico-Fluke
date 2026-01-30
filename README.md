# Teste-tecnico-Fluke

## Comportamento com Duplicatas

**Definição:** Evento duplicado = `external_id` já existe no banco.

**Comportamento atual:**

- Em `POST /events`, se o `external_id` já existir: apenas `received_count` é incrementado.
- O evento **não** é reprocessado (state e payload permanecem os do primeiro envio).
- Resposta HTTP 201 com o evento existente (incluindo `received_count` atualizado).

**Motivação:**

- Evitar duplicação de ações externas (email, webhook) em retries do cliente.
- Cliente pode usar `idempotency_key` próprio se precisar distinguir retries de eventos distintos.

**Limitações conhecidas:**

- Se payloads forem diferentes entre envios com o mesmo `external_id`, o segundo payload é ignorado (prevalece o primeiro).
- Em race condition extrema (janela &lt; 1 ms), a deduplicação pode falhar (raro).

**Melhorias futuras (não implementadas):**

- Flag `force_reprocess` no payload para forçar reprocessamento sob demanda.
- Campo `idempotency_key` separado de `external_id` para controle fino de idempotência.