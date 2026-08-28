# Histórico de versões e publicações

Atualizado em **27/08/2026**. Este é o índice operacional de commits, pushes e
deploys do CRM JID Mídia (repositório `wavemov-crm`).

## Estado atual

| Item | Estado |
|---|---|
| Versão declarada em `package.json` | **0.2.0** |
| Commit local (`main`) | `08a539f` — interface e relatórios de tags |
| Commit no GitHub (`origin/main`) | `7172fbb` — migration 0019 de tags |
| Commit em produção | `7172fbb` |
| Produção | [wavemov-crm.vercel.app](https://wavemov-crm.vercel.app) |
| Situação | **2 commits locais aguardando push e deploy** |
| Migrations no banco | `0001` a `0020` — a `0020` aplicada em 28/08/2026 |
| Tags/releases Git | Nenhuma tag criada |

> A `0020_set_deal_tags_preserva_tag_inativa.sql` nasceu da auditoria de QA da
> entrega de tags. A interface precisa reenviar o vínculo de uma tag desativada
> para preservá-lo, e a guarda `BEFORE INSERT` da `0019` dispara antes do
> `ON CONFLICT`, derrubando a transação. Sem ela aplicada, o código novo torna
> impossível editar tags em qualquer lead que tenha tag inativa — por isso a
> ordem de publicação é **migration primeiro, push depois** — cumprida: a
> `0020` foi aplicada em 28/08/2026, antes de qualquer push.
>
> O ledger `supabase_migrations.schema_migrations` do projeto remoto lista só
> `0001` a `0008`, porque o SQL é aplicado pelo painel e não passa pelo CLI. Não
> use o ledger para saber o que está no banco.

O deploy atualmente associado ao domínio de produção é
`dpl_DJpPbqN9VCqMxQtkhrAmwKEbxf4T`, criado em 27/08/2026 às 21:30:06 BRT,
com status `Ready`.

## Versões do aplicativo

| Versão | Primeiro commit | Período no histórico | Observação |
|---|---|---|---|
| `0.1.0` | `f605455` | 06/07/2026 a 25/08/2026 | Versão inicial |
| `0.2.0` | `4b3b8cf` | desde 26/08/2026 | Versão atual; ainda sem tag Git |

> A versão é a registrada em `package.json`. Commits não alteram a versão
> automaticamente; por isso vários commits e deploys pertencem à mesma versão.

## Pushes registrados

O Git não mantém um histórico remoto universal de pushes. A tabela abaixo lista
**todos os 23 pushes preservados no reflog deste clone**. O horário é o da
atualização local do ramo remoto; uma operação pode ter enviado mais de um
commit.

<details>
<summary>Ver os 23 pushes</summary>

| Data/hora BRT | Ramo | Commit final | Versão |
|---|---|---|---|
| 27/08/2026 21:30:02 | `main` | `7172fbb` | `0.2.0` |
| 27/08/2026 21:07:36 | `main` | `910cb36` | `0.2.0` |
| 27/08/2026 20:49:20 | `main` | `9b4926d` | `0.2.0` |
| 27/08/2026 20:21:37 | `main` | `38c1315` | `0.2.0` |
| 27/08/2026 20:10:24 | `main` | `5693107` | `0.2.0` |
| 27/08/2026 20:03:01 | `main` | `b1879d8` | `0.2.0` |
| 27/08/2026 18:47:56 | `main` | `79fd080` | `0.2.0` |
| 27/08/2026 18:35:49 | `main` | `eaad3d0` | `0.2.0` |
| 27/08/2026 18:22:45 | `main` | `8edbec5` | `0.2.0` |
| 27/08/2026 17:47:19 | `main` | `20a9319` | `0.2.0` |
| 27/08/2026 15:03:15 | `main` | `4c68408` | `0.2.0` |
| 27/08/2026 14:21:05 | `main` | `9743e30` | `0.2.0` |
| 27/08/2026 13:57:55 | `main` | `8ccf9b7` | `0.2.0` |
| 27/08/2026 13:33:30 | `main` | `9dc202d` | `0.2.0` |
| 27/08/2026 11:08:57 | `main` | `ba3130d` | `0.2.0` |
| 27/08/2026 11:06:38 | `main` | `61a4690` | `0.2.0` |
| 27/08/2026 00:20:13 | `main` | `ea30a2d` | `0.2.0` |
| 27/08/2026 00:08:53 | `main` | `e957dd6` | `0.2.0` |
| 26/08/2026 21:49:29 | `main` | `08aca41` | `0.2.0` |
| 26/08/2026 16:18:22 | `fix/isolamento-webhook-uazapi` | `4c38d89` | `0.2.0` |
| 26/08/2026 00:03:06 | `main` | `b7a4e86` | `0.2.0` |
| 26/08/2026 00:01:03 | `main` | `4b3b8cf` | `0.2.0` |
| 07/07/2026 00:01:11 | `main` | `f8c90be` | `0.1.0` |

</details>

O merge do PR #1 (`ff757ea`) ocorreu remotamente em 26/08/2026. Este clone o
registrou por `pull --ff-only` às 17:11:26, e não como um push local.

## Deploys da Vercel

Na consulta de 27/08/2026, a Vercel retornou **29 deploys**: 28 de produção e
1 preview, todos `Ready`. A “idade” abaixo é a exibida pela CLI no momento da
consulta; o identificador abre o endereço imutável daquele deploy.

<details>
<summary>Ver os 29 deploys</summary>

| Ordem | Idade | Ambiente | Versão | Deploy | Duração |
|---:|---:|---|---|---|---:|
| 1 | 2h | Produção | `0.2.0` | [e0acxywma](https://wavemov-e0acxywma-orlandoadm10s-projects.vercel.app) | 57s |
| 2 | 3h | Produção | `0.2.0` | [mes99b1xc](https://wavemov-mes99b1xc-orlandoadm10s-projects.vercel.app) | 47s |
| 3 | 3h | Produção | `0.2.0` | [pgwaxp5ad](https://wavemov-pgwaxp5ad-orlandoadm10s-projects.vercel.app) | 45s |
| 4 | 3h | Produção | `0.2.0` | [8ccj4sjt0](https://wavemov-8ccj4sjt0-orlandoadm10s-projects.vercel.app) | 1m |
| 5 | 4h | Produção | `0.2.0` | [dwoy2t7x0](https://wavemov-dwoy2t7x0-orlandoadm10s-projects.vercel.app) | 46s |
| 6 | 4h | Produção | `0.2.0` | [hgce9wss1](https://wavemov-hgce9wss1-orlandoadm10s-projects.vercel.app) | 46s |
| 7 | 5h | Produção | `0.2.0` | [e2i1t6btj](https://wavemov-e2i1t6btj-orlandoadm10s-projects.vercel.app) | 47s |
| 8 | 5h | Produção | `0.2.0` | [lbhuky90v](https://wavemov-lbhuky90v-orlandoadm10s-projects.vercel.app) | 46s |
| 9 | 5h | Produção | `0.2.0` | [fh1j4rzqu](https://wavemov-fh1j4rzqu-orlandoadm10s-projects.vercel.app) | 45s |
| 10 | 6h | Produção | `0.2.0` | [6bj6zu9wd](https://wavemov-6bj6zu9wd-orlandoadm10s-projects.vercel.app) | 49s |
| 11 | 9h | Produção | `0.2.0` | [fzf8srhcl](https://wavemov-fzf8srhcl-orlandoadm10s-projects.vercel.app) | 45s |
| 12 | 9h | Produção | `0.2.0` | [bthnicndx](https://wavemov-bthnicndx-orlandoadm10s-projects.vercel.app) | 49s |
| 13 | 10h | Produção | `0.2.0` | [9y3754h2z](https://wavemov-9y3754h2z-orlandoadm10s-projects.vercel.app) | 47s |
| 14 | 10h | Produção | `0.2.0` | [objxplfyl](https://wavemov-objxplfyl-orlandoadm10s-projects.vercel.app) | 49s |
| 15 | 13h | Produção | `0.2.0` | [br9d0ad99](https://wavemov-br9d0ad99-orlandoadm10s-projects.vercel.app) | 44s |
| 16 | 13h | Produção | `0.2.0` | [1i84pn0zz](https://wavemov-1i84pn0zz-orlandoadm10s-projects.vercel.app) | 51s |
| 17 | 24h | Produção | `0.2.0` | [lecxrksg3](https://wavemov-lecxrksg3-orlandoadm10s-projects.vercel.app) | 44s |
| 18 | 24h | Produção | `0.2.0` | [4w4qn0gqy](https://wavemov-4w4qn0gqy-orlandoadm10s-projects.vercel.app) | 58s |
| 19 | 1d | Produção (CLI) | `0.2.0` | [6vohjuzi7](https://wavemov-6vohjuzi7-orlandoadm10s-projects.vercel.app) | 48s |
| 20 | 1d | Produção | `0.2.0` | [8be6aoegu](https://wavemov-8be6aoegu-orlandoadm10s-projects.vercel.app) | 1m |
| 21 | 1d | Produção | `0.2.0` | [grc5g9rpd](https://wavemov-grc5g9rpd-orlandoadm10s-projects.vercel.app) | 48s |
| 22 | 1d | Produção | `0.2.0` | [2hfswjopy](https://wavemov-2hfswjopy-orlandoadm10s-projects.vercel.app) | 55s |
| 23 | 1d | Preview | `0.2.0` | [1469mv87p](https://wavemov-1469mv87p-orlandoadm10s-projects.vercel.app) | 55s |
| 24 | 1d | Produção | `0.2.0` | [o4c0r7pxz](https://wavemov-o4c0r7pxz-orlandoadm10s-projects.vercel.app) | 57s |
| 25 | 2d | Produção | `0.1.0` | [ll8gcicpl](https://wavemov-ll8gcicpl-orlandoadm10s-projects.vercel.app) | 33s |
| 26 | 2d | Produção | `0.1.0` | [mpsce3ou5](https://wavemov-mpsce3ou5-orlandoadm10s-projects.vercel.app) | 44s |
| 27 | 3d | Produção | `0.1.0` | [o3qb61rol](https://wavemov-o3qb61rol-orlandoadm10s-projects.vercel.app) | 53s |
| 28 | 52d | Produção | `0.1.0` | [k4ixqfnle](https://wavemov-k4ixqfnle-orlandoadm10s-projects.vercel.app) | 47s |
| 29 | 52d | Produção | `0.1.0` | [h7ju2palp](https://wavemov-h7ju2palp-orlandoadm10s-projects.vercel.app) | 2m |

</details>

As versões dos deploys antigos são inferidas pela versão vigente no histórico
Git na data de cada publicação. A Vercel não grava o campo `package.json.version`
como uma coluna própria do deploy.

## Todos os commits

Há **30 commits** no repositório: 29 já alcançaram o GitHub e 1 está apenas
local. A lista está em ordem do mais recente para o mais antigo.

<details>
<summary>Ver os 30 commits</summary>

| Data | Commit | Versão | GitHub | Descrição |
|---|---|---|---|---|
| 27/08/2026 | `08a539f` | `0.2.0` | Pendente | feat: adiciona interface e relatorios de tags |
| 27/08/2026 | `7172fbb` | `0.2.0` | Sim | feat(db): migration 0019 — tags de negociacao |
| 27/08/2026 | `910cb36` | `0.2.0` | Sim | docs: registra a 0018 aplicada |
| 27/08/2026 | `9b4926d` | `0.2.0` | Sim | fix: auditoria de QA da Frente C |
| 27/08/2026 | `38c1315` | `0.2.0` | Sim | feat: motor da fila ordenada e tela de configuração |
| 27/08/2026 | `5693107` | `0.2.0` | Sim | fix(db): corrige ordem da migration 0017 |
| 27/08/2026 | `b1879d8` | `0.2.0` | Sim | feat(db): migration 0017 — fila ordenada e plantão |
| 27/08/2026 | `79fd080` | `0.2.0` | Sim | feat: configuração da distribuição e rendimento por vendedor |
| 27/08/2026 | `eaad3d0` | `0.2.0` | Sim | feat: distribuição automática e deduplicação de leads |
| 27/08/2026 | `8edbec5` | `0.2.0` | Sim | feat(db): migration 0016 — distribuição automática |
| 27/08/2026 | `20a9319` | `0.2.0` | Sim | fix: auditoria de QA no recurso de edição |
| 27/08/2026 | `4c68408` | `0.2.0` | Sim | fix: quebras de linha do n8n |
| 27/08/2026 | `9743e30` | `0.2.0` | Sim | feat: lead editável e últimas mensagens |
| 27/08/2026 | `8ccf9b7` | `0.2.0` | Sim | test: caminhos públicos do middleware |
| 27/08/2026 | `9dc202d` | `0.2.0` | Sim | feat: respostas do formulário no lead |
| 27/08/2026 | `ba3130d` | `0.2.0` | Sim | docs: publicação da Frente B em produção |
| 27/08/2026 | `61a4690` | `0.2.0` | Sim | feat: ingestão externa via n8n |
| 27/08/2026 | `ea30a2d` | `0.2.0` | Sim | docs: publicação e terreno da Frente B |
| 27/08/2026 | `e957dd6` | `0.2.0` | Sim | docs: handoff do histórico do lead |
| 26/08/2026 | `778ce5e` | `0.2.0` | Sim | feat: histórico do lead separado das conversas |
| 26/08/2026 | `08aca41` | `0.2.0` | Sim | feat: funis e atendimento |
| 26/08/2026 | `ff757ea` | `0.2.0` | Sim | merge do PR #1 |
| 26/08/2026 | `4c38d89` | `0.2.0` | Sim | fix: isolamento de leads e modais |
| 26/08/2026 | `f031f29` | `0.2.0` | Sim | fix: isolamento no webhook da UAZAPI |
| 26/08/2026 | `b7a4e86` | `0.2.0` | Sim | docs: passagem de serviço |
| 26/08/2026 | `4b3b8cf` | `0.2.0` | Sim | feat: funis, relatórios e resumo da empresa |
| 06/07/2026 | `f8c90be` | `0.1.0` | Sim | fix: geração do QR Code |
| 06/07/2026 | `1bbbb06` | `0.1.0` | Sim | fix: Instance ID da UAZAPI |
| 06/07/2026 | `e5c5ee1` | `0.1.0` | Sim | fix: sessão e WhatsApp sem service role |
| 06/07/2026 | `f605455` | `0.1.0` | Sim | versão inicial completa |

</details>

## Como atualizar este relatório

- Commits: `git log --all --oneline --decorate`
- Pushes preservados: `git reflog show origin/main --date=iso`
- Deploys: `vercel ls wavemov-crm`
- Produção atual: `vercel inspect https://wavemov-crm.vercel.app`

Ao mudar `package.json.version`, registre a nova versão nesta página e crie uma
tag Git para que a relação entre versão e commit deixe de depender de inferência.
