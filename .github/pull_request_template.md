## 🎯 Objetivo
<!-- Descreva o que este PR implementa (ex: Ingestão de eventos com deduplicação) -->

## 🛠️ Mudanças Principais
- [ ] Feature A
- [ ] Feature B
- [ ] Refatoração C

## 🧠 Decisões Técnicas e Trade-offs
<!-- OBRIGATÓRIO: Explique por que escolheu esta abordagem. -->
<!-- Ex: "Usei SKIP LOCKED para garantir que workers não processem o mesmo evento, aceitando o trade-off de..." -->

## 🛡️ Garantias e Riscos
<!-- O que este código GARANTE? O que ele NÃO GARANTE? -->
- **Garantia:** (Ex: Evento só é salvo se transação comitar)
- **Risco:** (Ex: Se o worker morrer após o processamento mas antes do update, pode haver duplicação)

## 🧪 Como Testar
1. Passo 1
2. Passo 2
3. Resultado esperado

## 📸 Screenshots (se frontend)

---
**Checklist:**
- [ ] Testei cenários de falha
- [ ] Sem variáveis de ambiente hardcoded