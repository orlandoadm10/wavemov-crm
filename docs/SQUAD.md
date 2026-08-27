# Squad de desenvolvimento — Wavemov CRM

Antes desta entrega **o projeto não tinha nenhum agente configurado**: as pastas
`.agents/`, `.claude/agents/` e `.claude/skills/` estavam vazias ou inexistentes.
Os agentes abaixo foram criados em `.claude/agents/` e ficam disponíveis para
qualquer sessão do Claude Code aberta neste repositório.

Todos obedecem a `docs/ENGINEERING_STANDARDS.md`. `AGENTS.md` e `CLAUDE.md`
encaminham ferramentas diferentes para o mesmo contrato com um resumo mínimo.

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

Antes da implementação, Produto fecha problema, escopo, papéis e critérios de
aceite; Engenharia informa arquivos, responsabilidades e impacto. Depois, QA
exige evidências dos gates aplicáveis, aponta riscos residuais e decide se a
entrega pode seguir. Documentação encerra mantendo o repositório verdadeiro.

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

1. Ler e aplicar `docs/ENGINEERING_STANDARDS.md`.
2. Verificar antes de afirmar. Nenhum "passou" sem a saída real do comando.
3. Informar arquivos, responsabilidades e impacto antes de editar.
4. Não criar componente que já existe em `components/ui/`.
5. Não adicionar dependência sem justificativa registrada — o app precisa ficar leve.
6. Toda query filtra por `organization_id`, mesmo com RLS ativo.
7. Migration aplicada é imutável: correção vira migration nova.
8. QA é o portão final e documentação é parte da entrega (`crm-docs`).
