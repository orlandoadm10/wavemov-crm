# Squad de desenvolvimento — Wavemov CRM

Antes desta entrega **o projeto não tinha nenhum agente configurado**: as pastas
`.agents/`, `.claude/agents/` e `.claude/skills/` estavam vazias ou inexistentes.
Os agentes abaixo foram criados em `.claude/agents/` e ficam disponíveis para
qualquer sessão do Claude Code aberta neste repositório.

## O time

| Agente | Arquivo | Quando acionar |
|---|---|---|
| **QA Engineer** | `.claude/agents/qa-engineer.md` | **Sempre**, ao final de qualquer alteração. É o portão de qualidade. |
| Frontend | `.claude/agents/crm-frontend.md` | Telas, componentes, interações, aderência ao `DESIGN_GUIDE.md` |
| Backend / Dados | `.claude/agents/crm-backend.md` | Migrations, RLS, queries, rotas de API, UAZAPI |
| Produto | `.claude/agents/crm-product.md` | Antes de construir tela nova; leitura de telas de referência |
| Performance | `.claude/agents/crm-perf.md` | Tela lenta, revisão de query, peso de bundle, nova dependência |
| Documentação | `.claude/agents/crm-docs.md` | Ao final de toda entrega |

## Fluxo recomendado

```
crm-product  →  crm-backend  →  crm-frontend  →  crm-perf  →  qa-engineer  →  crm-docs
 (o que e       (dados e       (tela e         (custo)      (portão de     (registro)
  por quê)       acesso)        interação)                   qualidade)
```

O QA é obrigatório; os demais entram conforme a natureza da tarefa. Uma correção
de texto não precisa passar pelo Produto, mas passa pelo QA.

## Como usar

Peça pelo nome na sessão do Claude Code — por exemplo:

- "use o qa-engineer para auditar o que acabamos de mudar"
- "use o crm-product para especificar a tela de metas antes de codar"
- "use o crm-perf para olhar por que /contatos está pesado"

## Por que o QA é prioridade

O cliente exige uma experiência excelente, e este é um CRM multiempresa: um
defeito de isolamento por organização expõe dados de um cliente para outro. O
`qa-engineer` roda `npx tsc --noEmit` e `npm run build` a cada auditoria, e trata
qualquer falha de isolamento como **Bloqueador** — nunca "sugestão".

## Regras que valem para todos os agentes

1. Verificar antes de afirmar. Nenhum "passou" sem a saída real do comando.
2. Não criar componente que já existe em `components/ui/`.
3. Não adicionar dependência sem justificativa registrada — o app precisa ficar leve.
4. Toda query filtra por `organization_id`, mesmo com RLS ativo.
5. Migration aplicada é imutável: correção vira migration nova.
6. Documentação é parte da entrega (`crm-docs`).
