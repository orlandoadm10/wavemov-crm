# Guia de estilo do CRM Jidianos

> Documento de transferência visual e de interação para reproduzir o CRM da JID Mídia em outro aplicativo com máxima fidelidade.

## 0. Como este guia se aplica ao CRM JID Mídia (leia primeiro)

Este é o contrato visual do CRM a partir da versão com o design Jidianos
(decisão do P.O. em 25/09/2026). O guia anterior está em
`docs/DESIGN_GUIDE_v1.md`, só como histórico. O CSS de origem do Jidianos está
em `docs/referencias/css-jidianos.css` — **referência de consulta, nunca
importado**; o que vale no app é `app/globals.css`.

O documento abaixo descreve o Jidianos, a plataforma interna da JID. O CRM é
um produto multiempresa usado pelas empresas clientes, então:

1. **Adota-se a linguagem visual inteira**: tokens, tipografia, densidade,
   fundo, sombras, sidebar azul recolhível, cabeçalho translúcido, cartões,
   Kanban, gaveta do lead, filtros, estados, responsividade e modo escuro.
2. **Mantêm-se o menu e as funcionalidades do CRM.** Os itens das seções 6 e 8
   (Atlas, Calculadora de metas, Painel TV, Rotina SDR, Relacionamento,
   Perdas, Origens…), o bloco "Melhor vendedor" (9) e as telas das seções 16 e
   17 descrevem o Jidianos. Só entram no CRM como funcionalidade nova, com
   pedido próprio — nunca como parte de um ajuste visual.
3. **Marca: "CRM JID Mídia".** Nada de "MÓDULO · COMERCIAL" nem "jidianos · JID
   Mídia" no rodapé: quem usa é a empresa cliente.
4. A seção 23 é o prompt de quem gerou este guia e não se aplica aqui.

### Tokens no código

`app/globals.css` define os tokens semânticos da seção 3 (`bg-background`,
`bg-card`, `text-foreground`, `text-muted-foreground`, `bg-primary`,
`text-primary-foreground`, `border-border`, `bg-success`, `bg-warning`,
`bg-destructive`, `bg-sidebar`…) e as fontes `font-sans` (Plus Jakarta Sans) e
`font-display` (Space Grotesk, aplicada a `h1`–`h3`).

**Componentes do padrão Jidianos.** `StatCard` é o indicador tingido (print
5). `Card`, `CardHeader` e `DataTable` aceitam `tint` (sky, violet, emerald,
rose, amber, cyan, fuchsia…) para painéis de análise com faixa no topo
(prints 6–11); sem `tint`, o cartão branco — padrão de formulários e
configurações. Filtros de barra de ferramentas: 40 px, raio de 12 px, busca
com borda azul de 2 px; filtro fora do padrão fica âmbar.

**Regras de padronização (QA + front, 25/09).** Valem para todo código novo:

1. Cartão/painel `rounded-2xl`; bloco interno `rounded-xl`; badge `rounded-md`;
   contador `rounded-full`.
2. Barra de filtros solta sobre o fundo (sem cartão em volta): controles
   `FILTER_CONTROL` (40 px, `rounded-xl`), busca `ui/search-field`
   (`SearchField`, com "x" e Esc), filtro fora do padrão com `ACTIVE_FILTER`.
3. Ações da página (criar, configurar) no `PageHeader actions`, não na linha
   de filtros; atalhos administrativos num menu "…".
4. Título de seção `font-sans text-sm font-semibold`; título de página só no
   `PageHeader` (eyebrow = grupo do menu).
5. Texto secundário `text-muted-foreground`; `ink-faint` (86%, AA) só para
   metadado de menor peso e placeholder.
6. Erro/aviso com `ui/alert` (`role="alert"`); vazio com `EmptyState`
   (`compact` dentro de painel).
7. Texto sobre cor escolhida pelo usuário (etapa) com `textOnColor()`
   (`lib/utils/color.ts`), nunca branco fixo.
8. Alvo de toque mínimo 32 px (40 px no celular) e `aria-label` em todo botão
   só com ícone.
9. Situação da negociação com um vocabulário só: Em aberto, Venda realizada,
   Perdida, Arquivada (`DealStatusBadge`).

**Transição.** As classes do guia v1 continuam funcionando e já apontam para os
tokens novos: `text-ink` → `foreground`, `text-ink-soft` / `text-ink-faint` →
tons de `muted-foreground`, `border-line` → `border`, `primary-50…900` → mistura
do `primary` com o fundo. Código NOVO usa os tokens semânticos; o antigo migra
tela a tela. Cores fixas (`bg-white`, `slate-*`, `rose-*`, `emerald-*`,
`amber-*`) não têm tema escuro — por isso a alternância de tema só será
oferecida ao usuário quando a varredura dessas cores terminar.

## 1. Direção obrigatória

O CRM deve parecer uma ferramenta operacional corporativa da **JID Mídia**, e não um painel genérico.

- Identidade dominante: **azul JID + branco**, com superfícies azul-claro no modo claro e azul-grafite no modo escuro.
- Visual: tecnológico, limpo, denso e profissional.
- Prioridade: leitura rápida de muitos leads, etapas e alertas sem perder hierarquia.
- Personalidade: cantos suaves, bordas azuis discretas, sombras leves e ícones lineares.
- Não redesenhar, simplificar ou “modernizar” livremente. Replicar estrutura, proporções, cores, densidade e comportamento.
- Todo texto visível deve estar em **português do Brasil**.

## 2. Tipografia

### Famílias

- Interface e textos: **Plus Jakarta Sans** — pesos 400, 500, 600 e 700.
- Títulos e números de destaque: **Space Grotesk** — pesos 500, 600 e 700.
- Alternativas: `ui-sans-serif, system-ui, sans-serif`.

### Escala predominante

| Uso | Tamanho | Peso |
|---|---:|---:|
| Nome do módulo no topo | 10 px, caixa alta | 600 |
| Título da página | 18 px no celular / 20 px no computador | 700 |
| Subtítulo da página | 12 px no celular / 14 px no computador | 400 |
| Título de coluna | 14 px | 600 |
| Nome do lead no cartão | 16 px | 700 |
| Texto normal compacto | 12 px | 500 |
| Metadados | 10–11 px | 500–600 |
| Botões pequenos | 12 px | 500–700 |
| Cabeçalho de tabela | 10 px, caixa alta | 600 |

A interface é compacta. Não ampliar todos os textos nem criar grandes áreas vazias.

## 3. Paleta e variáveis

Usar variáveis semânticas. Evitar espalhar valores de cor diretamente nos componentes.

### Modo claro — padrão principal

```css
:root {
  --radius: 0.9rem;

  --background: oklch(0.972 0.014 252);
  --foreground: oklch(0.22 0.05 262);
  --surface: oklch(1 0 0);
  --surface-foreground: oklch(0.22 0.05 262);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.22 0.05 262);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.22 0.05 262);

  --primary: oklch(0.53 0.23 262);
  --primary-foreground: oklch(0.99 0.002 258);
  --secondary: oklch(0.918 0.05 254);
  --secondary-foreground: oklch(0.32 0.11 262);
  --muted: oklch(0.93 0.04 253);
  --muted-foreground: oklch(0.48 0.07 258);
  --accent: oklch(0.86 0.085 256);
  --accent-foreground: oklch(0.28 0.13 262);

  --destructive: oklch(0.55 0.2 25);
  --destructive-foreground: oklch(0.99 0 0);
  --success: oklch(0.56 0.13 165);
  --success-foreground: oklch(0.99 0 0);
  --warning: oklch(0.72 0.15 70);
  --warning-foreground: oklch(0.22 0.05 70);

  --border: oklch(0.53 0.23 262 / 18%);
  --input: oklch(0.53 0.23 262 / 24%);
  --ring: oklch(0.55 0.21 262);

  --sidebar: oklch(0.42 0.19 262);
  --sidebar-foreground: oklch(0.99 0.002 262);
  --sidebar-primary: oklch(0.66 0.18 262);
  --sidebar-primary-foreground: oklch(0.99 0.002 262);
  --sidebar-accent: oklch(1 0 0 / 13%);
  --sidebar-accent-foreground: oklch(0.99 0.002 262);
  --sidebar-border: oklch(1 0 0 / 15%);
  --sidebar-ring: oklch(0.66 0.18 262 / 60%);
}
```

### Modo escuro

```css
.dark {
  --background: oklch(0.145 0.024 262);
  --foreground: oklch(0.975 0.004 258);
  --surface: oklch(0.185 0.028 262);
  --surface-foreground: oklch(0.975 0.004 258);
  --card: oklch(0.195 0.028 262);
  --card-foreground: oklch(0.975 0.004 258);
  --popover: oklch(0.2 0.03 262);
  --popover-foreground: oklch(0.975 0.004 258);

  --primary: oklch(0.63 0.185 258);
  --primary-foreground: oklch(0.99 0.002 258);
  --secondary: oklch(0.245 0.032 262);
  --secondary-foreground: oklch(0.95 0.006 258);
  --muted: oklch(0.235 0.03 262);
  --muted-foreground: oklch(0.72 0.022 258);
  --accent: oklch(0.28 0.05 260);
  --accent-foreground: oklch(0.97 0.005 258);

  --destructive: oklch(0.6 0.2 25);
  --destructive-foreground: oklch(0.99 0 0);
  --success: oklch(0.68 0.14 165);
  --success-foreground: oklch(0.15 0.02 165);
  --warning: oklch(0.78 0.14 75);
  --warning-foreground: oklch(0.2 0.04 75);

  --border: oklch(1 0 0 / 9%);
  --input: oklch(1 0 0 / 14%);
  --ring: oklch(0.63 0.185 258);

  --sidebar: oklch(0.22 0.10 265);
  --sidebar-foreground: oklch(0.99 0.002 265);
  --sidebar-primary: oklch(0.60 0.18 265);
  --sidebar-primary-foreground: oklch(0.99 0.002 265);
  --sidebar-accent: oklch(1 0 0 / 10%);
  --sidebar-accent-foreground: oklch(0.99 0.002 265);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.60 0.18 265 / 50%);
}
```

### Cores de situação

- Principal/ação/etapa padrão: azul JID.
- Venda ganha, WhatsApp e resultado positivo: verde.
- Aviso, pendência do dia e filtro ativo: âmbar/amarelo.
- Perda, atraso grave e exclusão: vermelho.
- Cada etapa do funil pode ter sua própria cor; essa cor aparece na faixa superior, borda, título, contador e valor da coluna.

## 4. Fundo, bordas, sombras e raios

### Fundo da área de trabalho

Usar fundo azul-claro com brilho discreto no modo claro e azul-noite no modo escuro:

```css
.app-background {
  background-color: var(--background);
  background-image:
    radial-gradient(1000px 560px at 80% -12%, var(--app-glow-1), transparent 66%),
    radial-gradient(820px 500px at 2% 104%, var(--app-glow-2), transparent 64%),
    linear-gradient(180deg, var(--app-1) 0%, var(--app-2) 100%);
  background-attachment: fixed;
}
```

### Padrões de superfície

- Cartões: `background: card`, borda fina semântica, raio entre 12 e 16 px.
- Colunas e barras principais: raio de 16 px.
- Botões e campos: raio de 6 a 12 px.
- Pílulas e contadores: raio completo.
- Sombra de painel: destaque interno de 1 px + sombra azul suave e baixa.
- Não usar sombras pretas pesadas.

```css
--shadow-panel: 0 1px 0 var(--ink-hi) inset,
                0 18px 40px -26px var(--ink-shadow);
--shadow-lift: 0 1px 0 var(--ink-hi) inset,
               0 28px 60px -30px var(--ink-shadow-strong);
```

## 5. Estrutura geral da tela

### Computador

```text
┌───────────────┬──────────────────────────────────────────────────┐
│ Sidebar azul  │ Cabeçalho fixo: módulo, título, ações, usuário  │
│ 256 px        ├──────────────────────────────────────────────────┤
│ recolhível    │ Navegação secundária do CRM                     │
│ para 72 px    ├──────────────────────────────────────────────────┤
│               │ Ranking / indicadores rápidos                   │
│               ├──────────────────────────────────────────────────┤
│               │ Resumo + filtros                                │
│               ├──────────────────────────────────────────────────┤
│               │ Quadro Kanban horizontal ou tabela              │
└───────────────┴──────────────────────────────────────────────────┘
```

- Sidebar: fixa, altura total, 256 px aberta e 72 px recolhida.
- Área principal: largura restante, sem rolagem horizontal no corpo.
- Cabeçalho: fixo no topo, fundo translúcido com desfoque, borda inferior.
- Conteúdo: 32 px de margem interna no computador; 16 px no celular.
- O quadro Kanban tem sua própria rolagem horizontal.

### Celular — 390 px

- A sidebar desaparece.
- O cabeçalho exibe título, subtítulo, tema, notificações, avatar e saída.
- As ações da página ficam em uma segunda linha horizontal rolável.
- A navegação do módulo fica abaixo do cabeçalho e também rola horizontalmente.
- A navegação do CRM forma uma barra branca independente, com abas roláveis.
- Filtros começam recolhidos no botão **Filtros**.
- O corpo nunca ultrapassa 390 px; somente áreas intencionalmente roláveis podem ter conteúdo largo.

## 6. Sidebar principal

- Fundo azul sólido da marca.
- Logotipo branco no topo.
- Quando um módulo está aberto, mostrar um seletor destacado com ícone, rótulo “MÓDULO” e nome “Comercial”.
- Links com ícone linear de 16 px e texto de 14 px.
- Item ativo: fundo azul mais claro/translúcido, texto branco e anel fino azul.
- Item inativo: branco com leve transparência; no hover recebe fundo branco translúcido.
- Rodapé: cargo em caixa alta, depois “jidianos · JID Mídia”.
- Permitir recolher; recolhida, mostrar somente logotipo e ícones.

Itens visíveis no módulo Comercial:

1. CRM JID
2. Dados comerciais
3. Atlas
4. Calculadora de metas
5. Metas da JID Mídia
6. Indicadores comerciais
7. Painel TV
8. Propostas comerciais
9. Controle de reuniões — selo “Em breve”
10. Histórico de indicadores

## 7. Cabeçalho da página

- Eyebrow: `MÓDULO · COMERCIAL`, azul, 10 px, caixa alta.
- Título: `CRM JID`, 18–20 px, negrito.
- Subtítulo: `Cada lead do primeiro contato até a venda, com origem, tarefas e histórico completo.`
- À direita: seletor quadro/lista, botão **Configurar funil**, botão primário **Criar negociação**, alternância de tema, notificações, avatar com nome/cargo e sair.
- No celular, título e ícones ficam na primeira faixa; ações ficam na faixa rolável logo abaixo.

## 8. Navegação interna do CRM

Usar uma faixa branca com borda, sombra leve e rolagem horizontal. Cada item leva ícone de 16 px e texto de 12 px.

Ordem:

1. Negociações
2. Rotina SDR
3. Atividades
4. Relacionamento
5. Conversas
6. Distribuição
7. Contatos
8. Empresas
9. Perdas
10. Origens

Estado ativo:

- Fundo azul principal.
- Texto e ícone brancos.
- Raio de 12 px.

Atividades e Relacionamento podem mostrar:

- contador amarelo para pendências de hoje;
- contador vermelho para atrasos.

## 9. Bloco “Melhor vendedor”

- Painel em azul muito claro com borda âmbar discreta e raio de 16 px.
- Cabeçalho com troféu e texto `MELHOR VENDEDOR`.
- Controle de período em pílulas: `Todo o período`, `Este mês`, `Mês passado`, `Personalizado`.
- Vencedor em cartão maior com avatar sobre medalha/coroa, nome em negrito e números em verde/azul.
- Demais posições em pílulas com posição, avatar, nome, valor e conversão.
- No celular, controles quebram em linhas organizadas e posições ficam empilhadas.

## 10. Barra de resumo

Faixa horizontal clara com rolagem própria no celular. Mostrar pílulas compactas:

- total de negociações — azul sólido;
- situação atual — lilás claro;
- valor em aberto — azul claro;
- vendas e valor vendido — verde;
- conversão — âmbar;
- tarefas atrasadas, de hoje e futuras — vermelho, âmbar e verde/azul.

Nunca quebrar os indicadores dentro da pílula. No celular, permitir deslizar lateralmente.

## 11. Filtros

### Computador

Filtros aparecem abertos em uma linha flexível com quebra quando necessário:

- funil;
- busca;
- responsáveis;
- botão “Minhas negociações”;
- situação;
- ordenação;
- origem;
- filtros personalizados.

### Celular

- Mostrar apenas o botão branco **Filtros** com ícone de ajustes e texto `Mostrar`.
- Quando houver filtro ativo, usar borda/fundo/texto amarelos e um contador.
- Ao abrir, os campos ficam empilhados ou quebram em linhas, ocupando até 92% da largura da tela.
- Incluir ação vermelha **Limpar filtros**.

### Busca

- Altura de 40 px.
- Borda azul de 2 px.
- Lupa azul à esquerda.
- Botão circular “x” à direita quando houver texto.
- Placeholder: `Buscar lead, empresa, telefone…`.
- Pressionar `Esc` limpa a busca.

### Estado ativo

Qualquer filtro diferente do padrão recebe:

```text
borda âmbar 60% + fundo âmbar 15% + texto âmbar
```

## 12. Quadro Kanban

### Contêiner

- Fundo azul muito claro/translúcido.
- Borda fina, raio de 16 px e margem interna de 16 px.
- Altura mínima aproximada de 416 px.
- Colunas em linha com espaço de 16 px.
- Rolagem horizontal independente.

### Coluna

- Largura no celular: **85vw**.
- Largura a partir de 640 px: **290 px**.
- Não encolher.
- Raio de 16 px, borda e fundo derivados da cor da etapa com baixa opacidade.
- Faixa superior colorida de 6 px.
- Cabeçalho em grade `texto flexível + valor fixo`.
- Nome e contador à esquerda; soma monetária à direita.
- Lista interna com rolagem vertical própria e carregamento progressivo.

Etapas atuais do funil principal:

1. Novos Leads
2. Em contato
3. Nutrir
4. Reunião agendada
5. Reunião realizada
6. No-show
7. Follow Up
8. Relacionamento
9. Negociação
10. Venda realizada

### Arrastar e mover

- Computador: cartão arrastável entre colunas.
- Durante o arraste: leve rotação e opacidade de 40%.
- Coluna de destino: escala de 1,01 e sombra elevada.
- Celular e acessibilidade: menu `…` no cartão com **Mover para** e todas as etapas disponíveis.
- Nunca depender exclusivamente de arrastar e soltar.

## 13. Cartão do lead

Estrutura visual, de cima para baixo:

1. Faixa colorida da situação/etapa.
2. Situação em 10 px, caixa alta e negrito.
3. Menu `…` à direita.
4. Nome do lead em até duas linhas, 16 px e negrito.
5. Empresa com ícone de prédio, 12 px, caixa alta, truncada.
6. Caixa de origem/UTM em azul claro com ícone de megafone.
7. Duas caixas lado a lado: faturamento e qualificação.
8. Alertas de tempo sem contato, tarefa vencida ou venda sem cadastro.
9. Telefone, data, hora e avatar do responsável.
10. Barra inferior dividida: próxima tarefa/criar tarefa e conversa.

### Aparência

- Fundo branco no modo claro.
- Borda fina e sombra curta.
- Raio de 12 px.
- No hover do computador: subir 2 px e aumentar discretamente a sombra.
- Perdido: borda e fundo vermelho muito suave.
- Ganho: borda e fundo verde muito suave.

### Alertas

- Sem contato recente: azul até 2 horas, âmbar a partir de 2 horas e vermelho após 24 horas.
- Tarefa atrasada: vermelho.
- Venda sem cadastro: borda âmbar dupla, fundo âmbar claro e ícone pulsante.

## 14. Visualização em lista

- Alternância quadro/lista em controle segmentado de dois ícones.
- Tabela dentro de contêiner com rolagem horizontal.
- Largura interna mínima aproximada: 880 px.
- Cabeçalho em 10 px, caixa alta, fundo de superfície.
- Linhas clicáveis com hover azul-claro.
- Colunas: seleção, negociação, empresa, etapa, responsável, situação e valor.
- Permitir seleção em massa e exibir barra de ações para mover, definir responsável, alterar situação ou excluir.

## 15. Painel lateral do lead

Abrir ao clicar em qualquer lead, sem sair da tela.

- Gaveta pela direita.
- Largura total no celular.
- Máximo de aproximadamente 768 px no computador.
- Rolagem vertical interna.
- Fundo escurecido sobre a página.

### Cabeçalho do painel

- Fundo com degradê muito sutil de azul para branco/cartão.
- Nome do lead grande.
- Etapa e situação em pílulas.
- Quantidade de dias na etapa.
- Valor da negociação em caixa à direita.
- Ações rápidas de telefone, WhatsApp e e-mail em pílulas.
- Botões: **Marcar venda** em verde e **Marcar perda** em vermelho.
- Navegação horizontal das etapas do funil.
- Abas roláveis com os dados, atividades, notas, histórico e conversas.

### Comportamento

- Ao marcar venda: feedback forte, celebração breve e encerramento das pendências.
- Ao marcar perda: abrir confirmação com motivo obrigatório.
- Toda ação mostra sucesso ou erro no canto superior direito.

## 16. Atividades

- Entra mostrando as tarefas do próprio usuário, exceto chefia comercial, que pode iniciar em visão geral.
- Filtros: busca, situação, tipo e responsável.
- Cada atividade é uma linha-cartão com checkbox, controle de conclusão, título, tipo/data, lead clicável, status, WhatsApp, editar/reprogramar, avatar e exclusão quando permitida.
- Status em badges: `A fazer`, `Pendente hoje`, `Em atraso`, `Concluída`.
- Título concluído fica riscado e com cor reduzida.
- Lead abre no mesmo painel lateral usado no quadro.

## 17. Relacionamento

- Abre filtrado para o vendedor conectado.
- Qualquer usuário do Comercial pode trocar para “Todos os vendedores”.
- Cards de resumo em grade 2 colunas no celular e 4 no computador: leads na rotina, em atraso, hoje e próximos dias.
- Um cartão por lead, com empresa, etapa, data de entrada na rotina, badge de situação, avatar, progresso de 4 contatos, vendedor, WhatsApp, última interação, próxima ação e situação.
- Progresso: quatro barras curtas; concluídas em azul, futuras em cor neutra.
- Ação principal: `Concluir contato X/4`.
- Ao concluir, pedir resultado; o próximo contato é programado automaticamente.

## 18. Componentes base

### Botões

- Altura normal: 36 px; pequeno: 32 px; grande: 40 px.
- Primário: azul sólido, texto branco e sombra curta.
- Outline: fundo da página, borda do campo, hover azul-claro.
- Destrutivo: vermelho sólido.
- Ícones: 16 px, sempre sem deformar.
- Botões somente com ícone: 32 ou 36 px quadrados e tooltip/`aria-label`.

### Campos e seletores

- Altura: 36 px.
- Raio: 6 px.
- Borda fina azul translúcida.
- Foco com anel azul de 1 px.
- Texto: 12–14 px.
- Menus e popovers: largura máxima `min(360px, 92vw)`.

### Badges

- Compactos, 10–12 px, peso 600.
- Badge comum: raio de 4–6 px.
- Contadores e indicadores de resumo: pílula completa.

### Diálogos

- Largura no celular: `calc(100% - 2rem)`.
- Altura máxima: `90dvh`.
- Rolagem vertical interna.
- No computador, larguras extras começam em `sm:`.
- Fundo externo preto a 80%.
- Rodapé empilhado e invertido no celular; ações alinhadas à direita no computador.

### Ícones

- Estilo linear consistente, semelhante ao Lucide.
- Tamanho padrão: 16 px.
- Nunca misturar ícones preenchidos pesados com ícones lineares.

## 19. Movimento e feedback

- Transições de cor curtas, entre 150 e 200 ms.
- Entrada de menus, diálogos e gavetas com fade + zoom/deslizamento suave.
- Hover dos cartões: elevação de 2 px.
- Feedback de venda pode usar pulso/confete curto.
- Alertas realmente urgentes podem pulsar.
- Respeitar `prefers-reduced-motion` e remover movimentos não essenciais.
- Toasts ricos no canto superior direito para sucesso, erro e informação.

## 20. Regras de responsividade obrigatórias

1. Cabeçalhos com texto e ações usam grade `minmax(0, 1fr) + auto`.
2. Todo bloco textual flexível recebe `min-width: 0`.
3. Títulos longos usam truncamento ou no máximo duas linhas.
4. Ícones e avatares nunca encolhem.
5. Colunas Kanban usam `85vw` no celular e 290 px a partir de 640 px.
6. O quadro tem rolagem horizontal própria.
7. Toda ação de arrastar tem alternativa por toque em `Mover para…`.
8. Tabelas ficam dentro de rolagem horizontal; a largura mínima pertence à tabela, não ao corpo.
9. Filtros ficam recolhidos no celular.
10. Diálogos têm margem lateral de 16 px e altura máxima de 90% da tela.
11. Menus e popovers não ultrapassam 92vw.
12. Em 390 px, `document.body.scrollWidth` deve ser exatamente `390`.
13. Todas as ações principais precisam ser alcançáveis por toque.

## 21. Estados obrigatórios

Toda tela deve contemplar:

- carregando;
- vazio;
- erro;
- sem acesso;
- somente leitura;
- sucesso;
- filtro sem resultados;
- dados truncados com título acessível;
- ação desabilitada;
- conexão/recarregamento sem desmontar visualmente o quadro.

## 22. Critérios de aceite visual

A réplica só está pronta quando:

- [ ] A sidebar, o cabeçalho e a navegação interna têm a mesma hierarquia do Jidianos.
- [ ] O azul JID, os fundos claros e os estados semânticos usam os valores deste documento.
- [ ] O quadro mostra colunas de 290 px no computador e 85vw no celular.
- [ ] Os cartões mantêm a mesma densidade de informações.
- [ ] O lead abre em painel lateral, não em nova página.
- [ ] Há visão Kanban e visão de tabela.
- [ ] Filtros ativos ficam amarelos.
- [ ] A interface funciona em modo claro e escuro.
- [ ] Não existe rolagem horizontal no corpo em 390 px.
- [ ] Menus, filtros, diálogos e ações continuam utilizáveis por toque.
- [ ] Drag-and-drop possui a opção “Mover para…” no próprio cartão.
- [ ] O idioma visível é português do Brasil.
- [ ] A interface não parece um template genérico ou um CRM de outra marca.

## 23. Prompt mestre para usar no outro aplicativo

Copie o texto abaixo junto com este documento:

```text
Reproduza o CRM Jidianos da JID Mídia seguindo integralmente o guia de estilo anexado.

A meta é fidelidade, não inspiração. Não redesenhe e não simplifique a estrutura. Mantenha a identidade azul e branca, Plus Jakarta Sans na interface, Space Grotesk nos títulos e números, sidebar azul recolhível, cabeçalho fixo translúcido, navegação interna rolável, ranking de vendedor, barra de resumo, filtros, quadro Kanban e painel lateral do lead.

O CRM deve abrir na visão Kanban e oferecer visão em lista. Cada etapa deve ter faixa, borda e indicadores na própria cor. Os cartões precisam mostrar situação, lead, empresa, origem, faturamento, qualificação, alertas, responsável, tarefa e conversa. Clicar em qualquer lead abre a ficha completa em uma gaveta pela direita sem sair da tela.

No celular de 390 px, esconda a sidebar, torne as barras superiores roláveis, recolha os filtros, use colunas Kanban de 85vw e mantenha document.body.scrollWidth igual a 390. Toda interação de arrastar deve possuir “Mover para…” por toque.

Use os tokens semânticos e as medidas exatas do documento. Preserve os estados de sucesso, aviso, atraso, perda e venda. Todos os textos devem estar em português do Brasil. Não use estética genérica de painel, não use roxo como cor dominante e não substitua o azul JID.
```

---

**Versão documentada:** CRM Jidianos em 25 de setembro de 2026.
