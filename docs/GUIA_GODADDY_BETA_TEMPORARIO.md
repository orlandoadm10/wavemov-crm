# Guia temporário — criar `beta.crmjidmidia.com` na GoDaddy

## Objetivo

Criar o endereço:

```text
https://beta.crmjidmidia.com
```

para direcionar somente o subdomínio `beta` ao novo CRM hospedado na Vercel.

Esta alteração **não deve modificar o site atual**:

```text
crmjidmidia.com      → continua no Bubble
www.crmjidmidia.com  → continua no Bubble
beta.crmjidmidia.com → passa a apontar para a Vercel
```

Não é necessário comprar outro domínio, contratar hospedagem, transferir o
domínio para a Vercel nem alterar os nameservers.

## Informação necessária antes de começar

A equipe técnica fornecerá o **destino CNAME exibido pela Vercel**.

Preencher aqui antes de executar:

```text
Destino fornecido pela Vercel: __________________________________________
```

O destino normalmente se parece com um nome terminado em
`.vercel-dns.com`, mas deve ser copiado exatamente do painel da Vercel.
**Não usar um valor encontrado em tutorial e não adicionar `https://`.**

Se a equipe técnica ainda não enviou esse valor, interromper o procedimento e
solicitá-lo antes de criar o registro.

## Passo 1 — acessar o domínio

1. Entrar em [godaddy.com](https://www.godaddy.com/).
2. Abrir **Meus produtos** ou **Portfólio de domínios**.
3. Localizar `crmjidmidia.com`.
4. Abrir **Configurações do domínio**.
5. Selecionar **DNS** ou **Gerenciar DNS**.

## Passo 2 — confirmar que o DNS é gerenciado pela GoDaddy

Na página do domínio, localizar a seção **Nameservers**.

- Se estiver usando os nameservers padrão da GoDaddy e a lista de registros
  puder ser editada, continuar.
- Se aparecer Cloudflare ou outro provedor, ou se a lista não puder ser
  editada, **não trocar os nameservers**. Tirar uma captura da tela e enviar à
  equipe técnica, pois o registro deverá ser criado no provedor que gerencia o
  DNS.

## Passo 3 — verificar se `beta` já existe

Na lista de registros DNS, pesquisar por `beta`.

- Se não existir nenhum registro com esse nome, continuar para o passo 4.
- Se já existir um registro `A`, `AAAA` ou `CNAME` com nome `beta`, **não
  excluir nem editar**. Tirar uma captura da tela e enviar à equipe técnica
  para validação.

## Passo 4 — adicionar o CNAME

1. Selecionar **Adicionar novo registro**.
2. Escolher o tipo **CNAME**.
3. Preencher os campos conforme a tabela:

| Campo na GoDaddy | Valor |
|---|---|
| Tipo | `CNAME` |
| Nome, Host ou Name | `beta` |
| Valor, Destino, Aponta para ou Value | destino exato fornecido pela Vercel |
| TTL | padrão da GoDaddy, normalmente `1 hora` |

Exemplo apenas do formato:

```text
Tipo:    CNAME
Nome:    beta
Destino: valor-fornecido-pela-vercel.vercel-dns.com
TTL:     1 hora
```

Regras importantes:

- no campo **Nome**, digitar somente `beta`;
- não digitar `beta.crmjidmidia.com` no campo Nome;
- no **Destino**, não colocar `https://`, `/` ou qualquer caminho;
- não usar `@` e não alterar o registro `www`.

4. Conferir os dados.
5. Selecionar **Salvar**.
6. Concluir a confirmação de identidade da GoDaddy, caso seja solicitada.

## Passo 5 — enviar a confirmação

Depois de salvar, enviar à equipe técnica:

1. captura de tela do novo registro, mostrando Tipo, Nome, Destino e TTL;
2. horário aproximado em que o registro foi salvo;
3. confirmação de que nenhum outro registro foi alterado.

Não é necessário aguardar a propagação para enviar essas informações. A equipe
técnica fará a verificação e a emissão do certificado HTTPS pela Vercel.

## O que não deve ser alterado

Para evitar indisponibilidade do Bubble ou do e-mail, **não alterar nem
excluir**:

- registros com nome `@`;
- registros com nome `www`;
- registros `MX`;
- registros `TXT`, incluindo SPF, DKIM e DMARC;
- registros de e-mail, verificação ou outros subdomínios;
- nameservers do domínio;
- encaminhamento do domínio principal.

Se a GoDaddy sugerir substituir, conectar ou configurar automaticamente o site
principal, cancelar essa sugestão. A única alteração autorizada por este guia é
a criação de **um CNAME com nome `beta`**.

## Prazo esperado

A mudança costuma começar a funcionar em minutos ou em aproximadamente uma
hora. Dependendo dos caches de DNS, a propagação global pode levar até 48
horas. O site atual no Bubble deve continuar funcionando durante todo o
processo.

## Como desfazer, se solicitado

O rollback deste procedimento é excluir **somente o registro CNAME com nome
`beta` criado por este guia**.

Não executar o rollback por iniciativa própria. Aguardar solicitação da equipe
técnica e confirmar o destino exato antes de excluir, principalmente se já
existia algum registro `beta` antes do procedimento.

## Checklist para o gestor da conta

- [ ] Recebi da equipe técnica o destino CNAME exato da Vercel.
- [ ] Confirmei que o DNS pode ser editado na GoDaddy.
- [ ] Confirmei que não existia outro registro chamado `beta`.
- [ ] Criei um registro do tipo `CNAME`.
- [ ] Preenchi o Nome somente com `beta`.
- [ ] Colei o destino sem `https://` e sem `/`.
- [ ] Mantive o TTL padrão.
- [ ] Não alterei `@`, `www`, MX, TXT ou nameservers.
- [ ] Enviei captura de tela e horário da alteração à equipe técnica.

## Referência oficial

Procedimento da GoDaddy para criação de CNAME:
[Add a CNAME record](https://www.godaddy.com/en-in/help/add-a-cname-record-19236).
