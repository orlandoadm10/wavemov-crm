# Padrões de engenharia — CRM JID Mídia

Este documento é o contrato técnico obrigatório do projeto. Ele vale para
desenvolvedores, agentes de IA, revisões e entregas. `docs/HANDOFF.md` descreve
o estado corrente; este arquivo descreve como o código deve evoluir.

## 1. Princípio arquitetural

Aplicar Clean Architecture de forma proporcional e incremental. Regras de
negócio devem ser independentes de React, Next.js, Supabase e UAZAPI. As
dependências apontam da entrega e da infraestrutura para os casos de uso e as
regras de domínio, nunca no sentido contrário.

Não criar camadas, interfaces, repositories ou casos de uso apenas para cumprir
um desenho abstrato. Uma extração precisa reduzir acoplamento real, eliminar
duplicação de conhecimento, permitir teste isolado ou separar uma integração.

### Fronteiras do repositório

| Área | Responsabilidade |
|---|---|
| `app/**` | Roteamento, autenticação, composição e entrega HTTP. Pages e routes devem permanecer finas. |
| `components/**` | Apresentação e interação. Regra de negócio reutilizável não fica em componente. |
| `lib/features/<feature>/domain` | Regras e tipos de domínio de fluxos complexos novos, sem dependência de framework. |
| `lib/features/<feature>/application` | Casos de uso e orquestração de fluxos complexos novos. |
| `lib/features/<feature>/infrastructure` | Implementações que falam com Supabase, UAZAPI ou outro serviço externo. |
| `lib/services/**` | Serviços e integrações existentes; reutilizar antes de criar uma feature modular nova. |
| `lib/validations/**` | Contratos Zod de entrada e fronteiras não confiáveis. |
| `lib/supabase/**` | Criação dos clientes e adaptação da infraestrutura Supabase. |
| `lib/utils/**` | Funções pequenas, puras e realmente transversais; não é depósito de regra de negócio. |
| `types/**` | Contratos compartilhados existentes. Tipos locais continuam junto do consumidor quando não são compartilhados. |

Uma consulta única, curta, filtrada por organização e sem regra de negócio pode
continuar num Server Component. Extraia quando houver duplicação, transformação
de domínio, transação, `service_role`, webhook, API externa ou necessidade de
teste isolado.

## 2. Antes de modificar

Antes da primeira edição:

1. Ler `docs/HANDOFF.md` e os documentos relevantes ao escopo.
2. Mapear a implementação atual com busca por componentes, serviços, schemas,
   tipos e migrations semelhantes.
3. Reutilizar componentes e serviços existentes antes de propor um novo.
4. Informar ao solicitante:
   - objetivo e escopo;
   - arquivos previstos e a responsabilidade de cada um;
   - impacto em UI, API, banco, RLS, integrações, deploy e documentação;
   - plano de validação.
5. Para feature nova, declarar critérios de aceite e permissões de
   `org_admin`, `seller`, `agent` e `viewer` quando aplicável.

Uma correção pequena pode usar uma explicação curta. Se o escopo mudar
materialmente durante o trabalho, atualizar o aviso antes de ampliar a edição.

## 3. Durante a implementação

- Cada módulo, componente, hook e função tem uma responsabilidade principal que
  pode ser descrita em uma frase.
- Usar nomes do domínio, explícitos e consistentes. Evitar siglas locais,
  booleanos ambíguos e nomes genéricos como `data`, `helper` ou `manager` quando
  houver um conceito mais preciso.
- Não duplicar regra de negócio, contrato de validação ou consulta sensível.
  Semelhança apenas visual ou acidental não justifica abstração prematura.
- Aplicar SOLID para aumentar coesão, testabilidade e substituição real de
  dependências — não para multiplicar arquivos sem necessidade.
- Não introduzir `any`, dependência nova, fallback permissivo, escrita sem
  tratamento de erro ou acesso multiempresa sem filtro explícito.
- Toda entrada externa é validada; toda escrita informa falha ao usuário ou ao
  chamador; update sob RLS só é sucesso quando a linha afetada é confirmada.
- As regras de segurança, migrations e design de `docs/HANDOFF.md` e
  `DESIGN_GUIDE.md` continuam invioláveis.

### Tamanho e coesão

Os números abaixo são gatilhos de revisão, não uma métrica isolada de qualidade:

- arquivo de produção acima de 300 linhas: avaliar extração;
- componente acima de 200 linhas: avaliar separar estado, apresentação e casos
  de uso;
- função ou hook acima de 50 linhas: avaliar decomposição;
- alteração que acrescente mais de 150 linhas a um arquivo: justificar a
  responsabilidade ou decompor;
- arquivo novo de produção acima de 400 linhas: decompor antes da entrega ou
  registrar justificativa arquitetural explícita.

Migrations, testes e arquivos gerados são exceções naturais. Arquivo legado já
acima desses gatilhos não bloqueia correção pequena, mas não deve ganhar uma
nova responsabilidade: extraia a responsabilidade nova ou registre um plano de
extração com risco e critério de conclusão.

### Soluções temporárias

Não introduzir workaround, `TODO`, fallback ou duplicação silenciosa para
contornar a arquitetura. Quando uma limitação externa exigir entrega em etapas,
registrar:

- por que a solução parcial é necessária;
- risco e alcance;
- condição objetiva de remoção;
- trabalho permanente no `HANDOFF` ou issue.

Uma v1 deliberadamente pequena não é solução temporária quando é íntegra,
segura e possui escopo final bem definido.

## 4. Depois de modificar

1. Revisar o diff procurando responsabilidades misturadas, duplicação,
   permissões incorretas, falhas silenciosas e dados sem organização.
2. Executar os gates aplicáveis e informar a saída real — nunca declarar
   “passou” sem executar.
3. Informar riscos residuais, validações manuais ainda necessárias e impacto de
   migration/deploy/rollback.
4. Avaliar a documentação. Atualizá-la quando houver mudança funcional, de API,
   schema, permissão, operação, arquitetura ou dívida conhecida. Para alteração
   interna sem impacto, informar “documentação: não aplicável” com uma frase.

### Matriz mínima de validação

| Escopo | Validação obrigatória |
|---|---|
| Toda alteração de código | `git diff --check` e `npx tsc --noEmit` |
| Aplicação Next.js | `npm run build` |
| Migration, RLS ou regra de banco | `npm run test:db` e asserção da invariante nova |
| Correção de bug | Teste de regressão automatizado quando houver runner; caso contrário, cenário manual explícito |
| API, webhook ou `service_role` | Organização A/B, papéis, payload inválido, autenticação e idempotência quando aplicável |
| UI | Loading, vazio, erro, permissão, teclado, acessibilidade e 375/768/1440 px |

O projeto ainda não possui lint não interativo nem runner para a aplicação.
Esses gates não podem ser declarados como executados até serem configurados;
registre a lacuna e faça a validação dirigida correspondente.

## 5. Definition of Done

Uma entrega só está pronta quando:

- critérios de aceite e regras de negócio estão atendidos;
- o código está coeso, nomeado com clareza e sem nova duplicação relevante;
- fronteiras arquiteturais e isolamento por organização foram revisados;
- entradas, erros e estados aplicáveis foram validados;
- testes e builds aplicáveis passaram com evidência real;
- documentação afetada foi atualizada, ou a não aplicabilidade foi declarada;
- riscos residuais e passos operacionais foram informados;
- QA fez a revisão final de alterações em `app/`, `components/`, `lib/` ou
  `supabase/`.

Exceções precisam ser explícitas, justificadas e nunca podem reduzir isolamento
multiempresa, segurança, integridade de dados ou observabilidade de falhas.
