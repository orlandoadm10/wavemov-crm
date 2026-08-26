# Guia de Design - Wavemov CRM

## Identidade visual

- Produto: Wavemov CRM
- Estilo geral: CRM SaaS operacional, limpo, claro, denso e profissional
- Personalidade visual: confiável, objetiva, moderna, com predominância de azul
- Layout base: superfícies claras, cards brancos, bordas suaves, sombras leves
- Biblioteca de ícones: Lucide
- Fonte principal: Inter

## Cores principais

- primary-50: #eff6ff
- primary-100: #dbeafe
- primary-200: #bfdbfe
- primary-300: #93c5fd
- primary-400: #60a5fa
- primary-500: #3b82f6
- primary-600: #2563eb
- primary-700: #1d4ed8
- primary-800: #1e40af
- primary-900: #1e3a8a

## Cores de superfície

- background da aplicação: #f5f7fb
- card: #ffffff
- linha/borda: #e6eaf2
- superfície secundária clara: #f8fafc
- superfície secundária translúcida: #f8fafc com opacidade aproximada de 60% a 80%
- overlay modal: #0f172a com 40% de opacidade
- scrollbar: #cbd5e1

## Cores de texto

- texto principal: #0f172a
- texto secundário: #475569
- texto fraco/placeholder/metadados: #94a3b8
- texto sobre azul: #ffffff
- texto de link/ação primária: #2563eb
- texto de link hover: #1d4ed8

## Cores semânticas

- sucesso principal: #059669
- sucesso médio: #10b981
- sucesso fundo: emerald-50
- sucesso texto: emerald-700
- erro principal: #e11d48
- erro hover: #be123c
- erro fundo: rose-50
- erro texto: rose-700
- alerta principal: #f59e0b
- alerta fundo: amber-50
- alerta texto: amber-700
- informação fria: cyan-50 / cyan-700
- destaque violeta: violet-50 / violet-700
- destaque laranja: orange-50 / orange-600
- neutro: slate-100 / slate-600

## Paleta para gráficos

- azul: #2563eb
- verde: #10b981
- amarelo: #f59e0b
- violeta: #8b5cf6
- vermelho: #ef4444
- ciano: #06b6d4
- slate: #64748b
- rosa: #ec4899
- grid dos gráficos: #eef1f6
- labels dos eixos: #94a3b8
- labels secundários: #475569
- tooltip background: #ffffff
- tooltip border: #e6eaf2
- tooltip radius: 12px
- tooltip shadow: 0 8px 24px rgb(15 23 42 / 0.08)

## Tipografia

- Fonte: Inter
- Fallback: ui-sans-serif, system-ui, sans-serif
- Antialiasing: ativado
- Feature settings: cv02, cv03, cv04
- H1 de página: 20px, peso 700, tracking tight, cor #0f172a
- Título de card: 14px, peso 600, cor #0f172a
- Título de modal: 16px, peso 600, cor #0f172a
- Texto padrão: 14px, peso 400, cor #0f172a
- Texto secundário: 14px, cor #475569
- Texto auxiliar: 12px, cor #94a3b8
- Label de formulário: 13px, peso 500, cor #475569
- Header de tabela: 11px, peso 600, uppercase, tracking wide, cor #94a3b8
- Badge: 12px, peso 500
- Contador pequeno: 10px, peso 700
- Stat grande: 30px, peso 700, tracking tight
- Hero de autenticação: 30px, peso 700, line-height tight, cor #ffffff

## Espaçamento

- Container principal: max-width 1600px
- Padding horizontal do app: 16px
- Padding vertical do main: 24px
- Gap padrão entre seções: 16px a 24px
- Gap entre controles: 8px
- Gap compacto: 4px a 6px
- Padding de card padrão: 20px
- Padding de card/form grande: 32px
- Padding de toolbar: 12px
- Padding de tabela: 20px horizontal, 14px vertical
- Padding de modal: header 24px x 16px, body 24px x 20px

## Bordas e raios

- Border color padrão: #e6eaf2
- Border width padrão: 1px
- Radius pequeno: 6px
- Radius botão/input: 8px
- Radius dropdown: 12px
- Radius card/painel/modal: 16px
- Radius ícone grande: 16px
- Radius badge/pill/avatar: 9999px
- Radius modal mobile: topo 16px
- Radius modal desktop: 16px

## Sombras

- Card: 0 1px 2px rgb(15 23 42 / 0.04), 0 4px 16px rgb(15 23 42 / 0.05)
- Popover/modal/hover forte: 0 4px 12px rgb(15 23 42 / 0.08), 0 12px 32px rgb(15 23 42 / 0.12)
- Botão primário: sombra pequena azul com 20% de opacidade
- Botão danger: sombra pequena rose com 20% de opacidade
- Botão success: sombra pequena emerald com 20% de opacidade

## Ícones

- Biblioteca: Lucide React
- Tamanho padrão em botões e navegação: 16px
- Ícone em botão compacto: 14px
- Ícone em toggle mobile: 20px
- Ícone de empty state: 24px
- Ícone de sucesso em formulário público: 32px
- Ícone de marca no header: 18px
- Ícone de marca em auth/onboarding: 20px a 24px
- Peso visual: stroke padrão do Lucide
- Uso: sempre acompanhado por texto quando a ação não for universal

## Componentes base

### Botões

- Estilo base: inline-flex, centralizado, radius 8px, peso 500, transição de cor
- Foco: outline 2px, offset 2px, cor #2563eb
- Disabled: opacidade 50%, sem interação
- Loading: ícone Loader2 girando, 16px
- Primary: background #2563eb, texto #ffffff, hover #1d4ed8
- Secondary: background #eff6ff, texto #1d4ed8, border #dbeafe, hover #dbeafe
- Outline: background #ffffff, texto #475569, border #e6eaf2, hover border #93c5fd, hover texto #1d4ed8
- Ghost: background transparente, texto #475569, hover #f1f5f9, hover texto #0f172a
- Danger: background rose-600, texto #ffffff, hover rose-700
- Success: background emerald-600, texto #ffffff, hover emerald-700
- Tamanho sm: altura 32px, padding horizontal 12px, texto 12px
- Tamanho md: altura 40px, padding horizontal 16px, texto 14px
- Tamanho lg: altura 44px, padding horizontal 24px, texto 14px
- Tamanho icon: 36px x 36px

### Inputs, selects e textareas

- Background: #ffffff
- Border: #e6eaf2
- Radius: 8px
- Altura input/select: 40px
- Padding horizontal: 14px
- Texto: 14px, #0f172a
- Placeholder: #94a3b8
- Focus border: #60a5fa
- Focus outline: #2563eb com 15% de opacidade
- Disabled background: #f8fafc
- Disabled text: #94a3b8
- Textarea: altura mínima 96px, padding vertical 10px
- Label: 13px, peso 500, #475569, margem inferior 6px
- Erro de campo: 12px, #e11d48, margem superior 4px

### Cards

- Background: #ffffff
- Border: #e6eaf2
- Radius: 16px
- Shadow: card
- Header: display flex, justify-between, gap 16px, border-bottom #e6eaf2
- Header padding: 20px horizontal, 16px vertical
- Título: 14px, peso 600, #0f172a
- Subtítulo: 12px, #94a3b8
- Hover em cards clicáveis: shadow pop

### Stat cards

- Padding: 20px
- Label: 14px, peso 600, #0f172a
- Sublabel: 12px, #94a3b8
- Valor: 30px, peso 700, #0f172a
- Hint: 12px, #94a3b8
- Indicador: bolinha 10px, radius full
- Tons: azul, verde, vermelho, amber, slate

### Badges

- Formato: pill
- Padding: 10px horizontal, 2px vertical
- Texto: 12px, peso 500
- Ring: 1px inset
- Dot opcional: 6px x 6px, cor currentColor
- Blue: background #eff6ff, texto #1d4ed8, ring #dbeafe
- Green: emerald-50, emerald-700, emerald-100
- Red: rose-50, rose-700, rose-100
- Amber: amber-50, amber-700, amber-100
- Slate: slate-100, slate-600, slate-200
- Violet: violet-50, violet-700, violet-100
- Cyan: cyan-50, cyan-700, cyan-100
- Orange: orange-50, orange-600, orange-100

### Tabelas

- Container: scroll horizontal no mobile
- Background: #ffffff
- Border: #e6eaf2
- Radius: 16px
- Shadow: card
- Tabela mínima: 640px
- Texto da tabela: 14px
- Header: background slate-50 com 80% de opacidade
- Header texto: 11px, uppercase, peso 600, tracking wide, #94a3b8
- Células: padding 20px horizontal, 14px vertical
- Body: divisórias #e6eaf2
- Hover de linha: primary-50 com 40% de opacidade
- Linha clicável: cursor pointer
- Footer: border-top #e6eaf2, padding 20px x 12px, texto 12px #94a3b8

### Dropdowns

- Container: position absolute, z-index alto
- Margin top: 6px
- Min width: 176px
- Background: #ffffff
- Border: #e6eaf2
- Radius: 12px
- Padding interno: 6px
- Shadow: pop
- Animação: fade-up 250ms
- Item: 14px, padding 12px x 8px, radius 8px
- Item normal: texto #475569, hover #f8fafc, hover texto #0f172a
- Item danger: texto rose-600, hover rose-50

### Modais

- Overlay: #0f172a com 40% de opacidade
- Overlay blur: 2px
- Z-index: 50
- Desktop: centralizado, padding externo 24px
- Mobile: alinhado ao fundo, sem padding externo
- Background modal: #ffffff
- Radius desktop: 16px
- Radius mobile: topo 16px
- Max height: 92vh
- Shadow: pop
- Header: border-bottom #e6eaf2, padding 24px x 16px
- Título: 16px, peso 600, #0f172a
- Subtítulo: 12px, #94a3b8
- Body: padding 24px x 20px, scroll vertical
- Botão fechar: 30px aproximado, radius 8px, texto #94a3b8, hover #f1f5f9
- Tamanhos: sm 384px, md 512px, lg 672px, xl 896px

### Empty states

- Layout: coluna centralizada
- Background: #ffffff com 60% de opacidade
- Border: dashed #e6eaf2
- Radius: 16px
- Padding: 56px vertical, 24px horizontal
- Ícone container: 56px x 56px, radius 16px, background #eff6ff, cor #3b82f6
- Título: 14px, peso 600, #0f172a
- Descrição: 14px, #94a3b8, largura máxima 384px
- Ação: margem superior 20px

### Avatares

- Formato: circular
- Ring: 2px branco
- Imagem: object-cover
- Fallback: background #dbeafe, texto #1d4ed8, peso 600
- xs: 24px, texto 10px
- sm: 32px, texto 12px
- md: 40px, texto 14px
- lg: 56px, texto 18px
- xl: 80px, texto 24px

### Switch

- Container: inline-flex, gap 8px
- Label: 14px, peso 500, #475569
- Track: 44px x 24px, radius full
- Track ativo: #2563eb
- Track inativo: slate-300
- Thumb: 20px x 20px, branco, sombra pequena
- Thumb offset: 2px
- Disabled: opacidade 50%

### Skeleton

- Radius padrão: 8px
- Background: shimmer horizontal
- Cores do shimmer: #eef1f6, #f7f9fc, #eef1f6
- Duração: 1.4s linear infinito
- Uso em tabelas: linhas com avatar 36px e barras de texto
- Uso em cards: altura aproximada 128px
- Uso em Kanban: colunas 288px, cards 112px

## Layouts

### App autenticado

- Background geral: #f5f7fb
- Altura mínima: 100vh
- Header fixo no topo: sticky, top 0, z-index 40
- Header height: 56px
- Header background: #ffffff com 90% de opacidade
- Header blur: backdrop blur
- Header border-bottom: #e6eaf2
- Container do header: max-width 1600px, padding horizontal 16px
- Main: max-width 1600px, padding horizontal 16px, padding vertical 24px

### Navegação superior

- Logo fallback: 32px x 32px, radius 12px, background #2563eb, ícone branco
- Nome da organização: 14px, peso 700, #0f172a
- Link desktop: radius 8px, padding 12px x 8px, texto 14px, peso 500
- Link ativo: background #eff6ff, texto #1d4ed8, ícone #2563eb
- Link inativo: texto #475569, ícone #94a3b8
- Link hover: background #f8fafc, texto #0f172a
- Badge de tarefas: altura 20px, min-width 20px, background #2563eb, texto 10px, peso 700, branco
- Menu mobile: aparece abaixo do header, background branco, border-top #e6eaf2
- Link mobile: padding 16px x 12px

### Header de página

- Margin bottom: 24px
- Layout: flex, wrap, justify-between
- Gap: 12px
- Título: 20px, peso 700, #0f172a
- Subtítulo: 14px, #94a3b8
- Ações: flex wrap, gap 8px

### Auth

- Layout desktop: duas colunas
- Painel de marca: 45% da largura, background #1e3a8a, padding 40px
- Painel de marca: oculto no mobile
- Efeito visual: gradientes radiais azuis com 40% de opacidade
- Logo auth: 40px x 40px, radius 16px, background branco 10%, texto branco
- Título hero: 30px, peso 700, branco
- Texto hero: 14px, line-height relaxed, #bfdbfe
- Copyright: 12px, #93c5fd
- Área de formulário: background #f5f7fb, centralizada
- Card de login/register: max-width 448px, background branco, radius 16px, border #e6eaf2, padding 32px, shadow card

### Onboarding

- Background: #f5f7fb
- Card: max-width 448px, padding 32px, radius 16px, border #e6eaf2, shadow card
- Ícone de marca: 48px x 48px, radius 16px, background #2563eb, branco
- Título: 20px, peso 700
- Texto auxiliar: 14px, #94a3b8
- CTA: botão primary grande full-width

### Formulário público

- Background: #f5f7fb
- Layout: centralizado, min-height 100vh, padding 16px horizontal, 40px vertical
- Container: max-width 512px
- Marca superior: centralizada, gap 8px, texto #94a3b8
- Logo: 32px x 32px, radius 12px, background #2563eb
- Card: background branco, radius 16px, border #e6eaf2, padding 32px, shadow card
- Título: 20px, peso 700
- Descrição: 14px, #94a3b8
- Form: margin-top 24px, gap vertical 16px
- CTA: botão primary grande full-width
- Mensagem de segurança: 12px, centralizada, #94a3b8
- Estado de sucesso: ícone 64px, radius full, background emerald-50, cor emerald-500

## Padrões por tela

### Dashboard

- Usa cards estatísticos em grid responsivo
- Gráficos dentro de cards brancos
- Altura padrão de gráficos: 220px a 240px
- Barras com radius 6px
- Linhas com stroke 2.5px
- Labels de gráfico pequenos: 11px
- Tooltips arredondados, borda clara e sombra suave

### Kanban de negociações

- Altura: viewport menos aproximadamente 136px
- Toolbar/filtros: card branco, radius 16px, padding 12px
- Colunas: largura 280px no mobile, 300px em telas maiores
- Header da coluna: card branco, radius 12px, padding 14px x 10px
- Área da coluna: radius 12px, padding 4px, scroll vertical
- Drop ativo: background primary-50 com 80% de opacidade, ring primary-200
- Card de negociação: background branco, radius 12px, border #e6eaf2, padding 14px, shadow card
- Card hover: shadow pop
- Card arrastando: opacidade 30%
- Card overlay: rotação leve, shadow pop
- Empty da coluna: altura 96px, border dashed #e6eaf2, texto 12px #94a3b8

### Atendimento WhatsApp

- Layout desktop: grid com 3 colunas, 320px / 1fr / 300px
- Altura: viewport menos aproximadamente 120px
- Painéis: background branco, radius 16px, border #e6eaf2, shadow card
- Header do módulo: card branco compacto, padding 16px x 10px
- Lista de conversas: border-bottom por item, padding 14px x 12px
- Conversa selecionada: background primary-50 com 70% de opacidade
- Conversa hover: background #f8fafc
- Badge de não lidas: emerald-500, texto branco, 10px, peso 700
- Área de mensagens: background slate-50 com 60% de opacidade, padding 16px
- Balão enviado: background #2563eb, texto branco, radius 16px, canto inferior direito 6px
- Balão recebido: background branco, texto #0f172a, border #e6eaf2, radius 16px, canto inferior esquerdo 6px
- Largura máxima do balão: 75%
- Hora/status: 10px
- Composer: border-top #e6eaf2, padding 12px
- Botões do composer: radius 12px, border #e6eaf2, padding 10px

### Tarefas

- Toolbar: card branco, radius 16px, padding 12px
- Banner da próxima tarefa: background #1d4ed8, texto branco, radius 16px, padding 20px x 16px
- Texto secundário no banner: primary-200
- Chip do banner: background branco, texto #1d4ed8
- Item de tarefa: background branco, radius 16px, border #e6eaf2, padding 16px x 12px, shadow card
- Checkbox custom: 22px x 22px, radius 6px, border 2px
- Checkbox concluído: emerald-500, texto branco
- Ações rápidas: botões ghost de 32px a 36px, hover primary-50 ou rose-50

### Pessoas, contatos, empresas, formulários e admin

- Toolbar/filtros: card branco, radius 16px, padding 12px, gap 8px
- Busca: input com ícone Search 16px à esquerda, padding-left 36px
- Listagens principais: tabelas responsivas ou cards em grid
- Grid de formulários: 1 coluna mobile, 2 colunas sm, 3 colunas lg
- Cards de formulário: background branco, radius 16px, border #e6eaf2, padding 20px, shadow card, hover shadow pop
- Ações em cards: grid de 2 colunas, gap 8px, border-top #e6eaf2

### Perfil

- Container: max-width 672px
- Cards empilhados com gap 16px
- Header do perfil: card com layout flex, padding 20px
- Barra de completude: altura 12px, background slate-100, preenchimento emerald-500, radius full
- Texto da porcentagem: 18px, peso 700
- Formulário: grid 2 colunas em telas maiores, 1 coluna no mobile

### Detalhe de negociação

- Layout baseado em cards e listas
- Indicadores de etapa: botões/pills com border e background azul quando ativo
- Barra de progresso: altura 6px, background slate-100, preenchimento #2563eb
- Atividades: linha temporal com bolinhas coloridas e ring suave
- Tipos de atividade: emerald para sucesso/mensagem, rose para perda/erro, amber para nota/alerta, primary para padrão

## Estados e feedback

- Mensagem de erro: background rose-50, texto rose-700, radius 8px, padding 12px x 8px, texto 14px
- Mensagem de sucesso: background emerald-50, texto emerald-700, radius 8px, padding 12px x 8px, texto 14px
- Aviso/sistema: background amber-50, texto amber-700, ring amber-100, pill
- Loading de botão: spinner 16px antes do texto
- Loading de tela/lista: skeleton shimmer
- Hover padrão em item clicável: #f8fafc ou primary-50 translúcido
- Focus em controles: outline azul claro, não usar sombra pesada
- Disabled: opacidade 50% ou surface #f8fafc com texto #94a3b8

## Animações

- Fade-up: duração 250ms, ease-out
- Fade-up início: opacity 0, translateY 6px
- Fade-up fim: opacity 1, translateY 0
- Shimmer skeleton: duração 1.4s, linear, infinito
- Transições padrão: color, background, border e shadow

## Responsividade

- Mobile first
- Header desktop a partir de lg
- Menu mobile abaixo do header, com links em bloco
- Grids comuns: 1 coluna mobile, 2 colunas em sm, 3 ou 4 colunas em lg
- Tabelas: manter largura mínima e scroll horizontal
- Kanban: colunas horizontais com scroll
- WhatsApp: alterna painéis no mobile; 3 colunas no desktop
- Modais: bottom sheet no mobile, modal centralizado no desktop
- Cards e toolbars: usar flex-wrap para evitar overflow

## Conteúdo e linguagem visual

- Tom do texto: direto, funcional e em português do Brasil
- Labels curtos e claros
- Subtítulos explicam contexto em uma frase curta
- CTAs usam verbos de ação: Criar, Salvar, Enviar, Editar, Confirmar
- Estados vazios sempre têm ícone, título, descrição curta e ação quando aplicável
- Evitar excesso de texto explicativo dentro da interface
- Usar emoji apenas pontualmente em mensagens leves de sucesso ou temperatura, sem depender dele como único indicador

## Checklist para aplicar em outro app

- Background geral: #f5f7fb
- Fonte global: Inter
- Texto principal: #0f172a
- Texto secundário: #475569
- Texto auxiliar: #94a3b8
- Cor primária de ação: #2563eb
- Hover primário: #1d4ed8
- Cards: #ffffff, border #e6eaf2, radius 16px, shadow card
- Inputs: altura 40px, radius 8px, border #e6eaf2, focus azul
- Botões: radius 8px, altura 40px padrão, peso 500
- Header: 56px, branco 90%, blur, border-bottom #e6eaf2
- Container: max-width 1600px, padding 16px
- Ícones: Lucide, 16px padrão
- Badges: pill, 12px, cores semânticas suaves
- Tabelas: header slate claro, texto uppercase 11px, hover primary-50 translúcido
- Modais: overlay #0f172a 40%, blur 2px, radius 16px
- Empty states: border dashed, ícone em bloco azul claro
- Gráficos: azul #2563eb como série principal, paleta auxiliar multicolorida
