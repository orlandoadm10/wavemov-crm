# Instruções obrigatórias do repositório

Antes de planejar ou alterar qualquer arquivo, leia integralmente:

1. `docs/HANDOFF.md` — estado atual, riscos e regras de domínio;
2. `docs/ENGINEERING_STANDARDS.md` — arquitetura, processo e Definition of Done;
3. `DESIGN_GUIDE.md` quando houver interface.

`docs/ENGINEERING_STANDARDS.md` é a fonte canônica das regras de engenharia.
Informe arquivos e impacto antes de editar; reutilize antes de criar; aplique as
fronteiras de Clean Architecture de forma incremental; execute os gates
aplicáveis; relate riscos e mantenha a documentação verdadeira.

Para alterações em `app/`, `components/`, `lib/` ou `supabase/`, use o checklist
de `.claude/agents/qa-engineer.md` como portão final, independentemente da
ferramenta utilizada.
