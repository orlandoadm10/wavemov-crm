# Migração do Bubble e transição de domínio

Este documento é o runbook para migrar a operação existente no Bubble para o
CRM JID Mídia hospedado na Vercel. Ele separa duas mudanças que não devem ser
confundidas:

1. **migração de dados e operação** — empresas, usuários, relacionamentos,
   históricos, arquivos e integrações;
2. **troca de domínio** — fazer `crmjidmidia.com` deixar de apontar para o
   Bubble e passar a apontar para a Vercel.

Trocar o DNS não migra nenhum dado. A troca do domínio é o último passo, depois
de a migração ter sido reconciliada e aprovada.

## Decisão recomendada

Usar **o mesmo domínio `crmjidmidia.com` como endereço definitivo** do novo
CRM. Não comprar outro domínio principal: isso fragmentaria a marca, criaria
links concorrentes e não reduziria o risco da migração dos dados.

Durante a preparação, manter o Bubble no domínio principal e validar o novo CRM
em uma destas URLs:

- `beta.crmjidmidia.com` (preferida para piloto com clientes); ou
- `wavemov-crm.vercel.app` (suficiente para validação interna).

Criar `beta.crmjidmidia.com` não exige comprar outro domínio. É apenas um
registro DNS adicional e não altera `crmjidmidia.com` nem `www`.

O nome interno do projeto Vercel pode continuar `wavemov-crm`. Renomeá-lo não é
pré-requisito para conectar um domínio personalizado e deve ficar fora do corte
para não misturar uma mudança cosmética com a migração operacional.

## Por que o domínio principal não deve mudar agora

A operação no Bubble contém aproximadamente 300 empresas e volume ainda não
inventariado de usuários e dados relacionados. Se o domínio for apontado para
a Vercel antes da migração:

- os usuários chegarão a um banco diferente, ainda incompleto;
- parte das pessoas poderá ver o Bubble e parte a Vercel durante a propagação
  do DNS;
- escritas feitas simultaneamente nas duas plataformas criarão divergência;
- voltar o DNS ao Bubble não devolverá automaticamente ao Bubble os dados já
  criados no CRM novo.

Por isso, a estratégia é **migrar primeiro, cortar depois**.

## Restrições conhecidas do Bubble

- O Bubble permite exportar dados em CSV, JSON e NDJSON; para volume e relações
  complexas, JSON/NDJSON ou a Data API tendem a ser mais adequados que uma
  importação manual por planilhas. Consulte a
  [documentação de exportação do Bubble](https://manual.bubble.io/help-guides/data/the-database/export-import-data/exporting-data).
- IDs e relações do Bubble precisam ser preservados em um mapa de legado para
  que referências entre registros possam ser reconstruídas e para que a
  importação seja idempotente.
- Campos de arquivo e imagem guardam URLs, não o conteúdo do arquivo. Arquivos
  que precisem sobreviver ao encerramento do Bubble devem ser baixados,
  verificados e enviados para armazenamento controlado pelo novo CRM; arquivos
  privados exigem tratamento que preserve autorização. Consulte
  [Files no Bubble](https://manual.bubble.io/help-guides/data/files).
- Senhas não são exportáveis: o campo é invisível ao desenvolvedor e usa hash
  unidirecional. Os usuários deverão receber convite, link mágico ou fluxo de
  definição/redefinição de senha no novo sistema. Consulte
  [User accounts no Bubble](https://manual.bubble.io/help-guides/data/user-accounts).
- Os bancos Development e Live do Bubble são separados. A origem oficial da
  migração deve ser explicitamente o banco **Live**.

## Fases da migração

### 1. Inventário e contrato de origem

Antes de desenvolver o importador:

- listar todos os tipos de dados do Bubble Live, campos, tipos e relações;
- contar registros por tipo e, quando aplicável, por empresa;
- identificar listas, option sets, slugs, datas, fusos, valores vazios e
  registros órfãos;
- inventariar arquivos, imagens, webhooks, workflows agendados e plugins;
- identificar quais registros podem mudar durante a janela de migração;
- definir a correspondência entre cada entidade do Bubble e o schema do
  Supabase;
- definir qual campo identifica de forma estável cada empresa, usuário e
  registro de negócio.

O resultado deve ser uma matriz de mapeamento versionada. Nenhum campo deve ser
descartado silenciosamente: campos sem destino precisam de decisão explícita de
negócio, arquivo histórico ou justificativa.

### 2. Estratégia de identidade

Antes do piloto, decidir:

- quais usuários serão criados no Supabase;
- como cada usuário será associado à organização correta;
- como papéis do Bubble viram `org_admin`, `seller`, `agent` ou `viewer`;
- se o primeiro acesso usará convite, link mágico ou redefinição de senha;
- como tratar e-mails duplicados, ausentes ou compartilhados;
- qual comunicação será enviada aos usuários e quando.

Criar a conta sem a associação correta à organização é falha de segurança. A
importação deve falhar fechada diante de ambiguidade, nunca escolher a primeira
empresa encontrada.

### 3. Importador repetível e ambiente de ensaio

Para este volume, preferir um pipeline versionado e repetível a alterações
manuais no painel. O importador deve:

- validar o formato da exportação antes de escrever;
- manter o ID do Bubble como referência de legado ou em tabela de mapeamento;
- executar na ordem das dependências;
- ser idempotente, permitindo repetir uma carga sem duplicar registros;
- registrar sucessos, rejeições e motivo por registro;
- filtrar e validar `organization_id` em todas as entidades multiempresa;
- suportar simulação sem escrita quando possível;
- produzir contagens e somas para reconciliação.

Primeiro executar em ambiente isolado, nunca diretamente no banco de produção.
Dados reais usados no ensaio devem receber a mesma proteção dos dados de
produção e ser removidos conforme o acordo de tratamento aplicável.

### 4. Piloto controlado

Selecionar poucas empresas representativas, com autorização, contemplando:

- empresa pequena e empresa com grande volume;
- múltiplos usuários e papéis;
- contatos, empresas, funis, etapas, negociações, tarefas e históricos;
- formulários, distribuição e WhatsApp, se usados no Bubble;
- anexos públicos e privados.

O piloto acessa `beta.crmjidmidia.com` ou a URL da Vercel. O domínio principal
continua no Bubble. Corrigir o mapeamento e repetir a carga até os critérios de
aceite serem atendidos.

### 5. Carga inicial completa

Com o importador aprovado:

1. registrar a data/hora de início da carga;
2. exportar o banco Live;
3. importar as aproximadamente 300 empresas e todas as dependências;
4. migrar e validar arquivos;
5. reconciliar contagens, totais e relações;
6. manter o Bubble como sistema oficial enquanto a operação continuar
   escrevendo nele.

A carga inicial não autoriza o corte porque dados podem ter mudado no Bubble
durante sua execução.

### 6. Ensaio do corte

Executar pelo menos um ensaio completo da janela final:

- medir duração da exportação, transformação, importação delta e validações;
- comprovar como identificar registros criados ou alterados desde a carga
  inicial;
- ensaiar a comunicação e o primeiro acesso dos usuários;
- ensaiar atualização de integrações e webhooks;
- definir responsáveis, janela, critérios de abortar e canal de suporte.

Se não for possível extrair um delta confiável, planejar uma janela de
indisponibilidade suficiente para uma nova exportação completa.

### 7. Corte de produção

Na janela aprovada:

1. bloquear ou suspender escritas no Bubble;
2. registrar o horário exato do congelamento;
3. exportar e importar o delta final, ou repetir a carga completa;
4. reconciliar os dados e obter aceite formal;
5. definir na Vercel
   `NEXT_PUBLIC_APP_URL=https://crmjidmidia.com` e fazer novo deploy;
6. atualizar no Supabase remoto o `Site URL` para
   `https://crmjidmidia.com` e manter temporariamente a URL antiga na lista de
   redirects permitidos;
7. atualizar UAZAPI, n8n, formulários e demais integrações que usem URL
   absoluta;
8. adicionar `crmjidmidia.com` e `www.crmjidmidia.com` ao projeto Vercel;
9. na GoDaddy, substituir somente os registros web de `@` e `www` pelos valores
   exatos mostrados pela Vercel;
10. preservar MX, SPF, DKIM, DMARC, TXT e subdomínios não relacionados;
11. validar DNS, certificado TLS, aplicação e integrações;
12. abrir o novo CRM para escrita e manter o Bubble somente leitura durante o
    período de observação.

Adicionar os domínios à Vercel antes de trocar o DNS reduz o trabalho durante a
janela. A Vercel documenta o fluxo em
[Setting up a custom domain](https://vercel.com/docs/domains/set-up-custom-domain).

### 8. Observação e encerramento

Durante o período acordado:

- acompanhar falhas de login, importação e integrações;
- comparar amostras e indicadores com o Bubble congelado;
- manter exportações originais, manifestos e logs de migração protegidos;
- não excluir dados nem cancelar o Bubble antes do aceite final e do prazo de
  retenção definido pelo negócio e pela privacidade;
- depois do aceite, remover o domínio do Bubble e encerrar serviços segundo o
  plano contratual.

## Critérios mínimos de aceite

- 100% das organizações previstas importadas, sem mistura entre empresas;
- contagem reconciliada por entidade e por organização;
- relações obrigatórias sem órfãos inesperados;
- usuários associados à organização e ao papel corretos;
- amostra funcional aprovada por clientes do piloto;
- arquivos acessíveis somente aos papéis autorizados;
- datas e relatórios coerentes em `America/Sao_Paulo`;
- login, formulários, n8n, UAZAPI/WhatsApp e webhooks aplicáveis validados;
- `crmjidmidia.com` e `www` com HTTPS e redirecionamento canônico definido;
- canonical da landing apontando para `https://crmjidmidia.com/`;
- plano de suporte e responsáveis ativos durante a estabilização.

## Rollback

Antes de liberar escritas na Vercel, o rollback pode ser a restauração dos
registros DNS da GoDaddy para o Bubble.

Depois que o novo CRM aceitar escritas, rollback **não é apenas voltar o DNS**.
É necessário:

1. congelar novas escritas no CRM;
2. preservar tudo o que foi criado depois do corte;
3. decidir como sincronizar esse delta de volta ao Bubble ou corrigir o CRM;
4. só então alterar o DNS, se o comitê do corte decidir pelo retorno.

Por isso, os valores DNS anteriores, TTLs, horários e responsáveis devem ser
registrados antes da mudança. O Bubble deve permanecer disponível em modo de
consulta durante a estabilização, sem se tornar novamente gravável por acidente.

## Decisões que ainda dependem de levantamento

- volume real por tipo de dado, não apenas número de empresas;
- tamanho, privacidade e destino dos arquivos;
- origem e qualidade dos vínculos entre empresas, usuários e registros;
- estratégia de primeiro acesso dos usuários;
- possibilidade de extração incremental confiável;
- duração da janela final e período de Bubble somente leitura;
- retenção e descarte seguro das exportações;
- responsáveis de negócio pelo aceite de cada lote e pelo comando de corte.
