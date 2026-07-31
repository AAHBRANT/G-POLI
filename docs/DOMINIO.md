# Domínio — G-Políticas (Regras de Negócio)

Especificação do sistema em linguagem de negócio. Descreve **o que o sistema
deve fazer**, independentemente de tecnologia (framework, banco, nuvem). É a
referência para qualquer implementação futura: cada mudança de código deve
justificar-se como *"implementa a regra definida no DOMINIO.md"*.

As regras aqui foram **decididas conscientemente**, não inferidas do código.

---

## O que é uma Norma

Uma **Norma** (política normativa) é um documento oficial que estabelece regras,
diretrizes ou procedimentos que valem para a organização. É a unidade central do
sistema — tudo gira em torno do seu ciclo de vida, do rascunho à revogação.

Cada Norma tem:
- um **código** único e imutável (padrão `POL-<SIGLA>-NNN`, por área);
- um **título**, único dentro da sua área;
- uma **classificação de sensibilidade**: `público interno`, `restrito` ou `confidencial`;
- um **conteúdo estruturado** em seções;
- um **histórico de versões** de documentos anexos;
- registros de **ciência** (confirmações de leitura).

---

## Papéis

| Papel | O que faz |
|---|---|
| **SGI / Qualidade** | Dono do conteúdo. Redige e edita todas as seções (em rascunho). |
| **Gestor de Setor** | Contribui apenas nas seções **liberadas** do **seu setor**. |
| **Diretoria** | Publica, revoga e reabre normas. Não redige conteúdo. |
| **Colaborador** | Lê normas publicadas e dá ciência. |
| **Administrador / Super Admin** | Gestão de usuários e setores, além das alçadas acima. |

**Quem pode criar uma Norma:** SGI, Administrador ou Super Admin.

---

## Estados

Uma Norma existe sempre em **um** destes estados:

- **Rascunho** — em construção; editável.
- **Publicada** — oficial e vigente; **congelada** (não editável).
- **Revogada** — deixou de valer; o histórico é preservado.

---

## Transições

Somente **Diretoria / Admin / Super Admin** movem uma Norma entre estados:

- **Publicar:** Rascunho → Publicada *(exige o conteúdo mínimo — ver abaixo)*
- **Revogar:** Publicada → Revogada
- **Reabrir:** Publicada ou Revogada → Rascunho *(destrava nova edição)*

Nenhuma outra transição é válida. Uma Norma publicada **pode** voltar a rascunho
(reabrir) quando precisar de revisão — o que gera uma nova versão do texto ao ser
republicada.

---

## Quando uma Norma pode ser publicada

Uma Norma só pode ser publicada quando possuir, **no mínimo**, o seu **núcleo**:

- **Objetivo**
- **Diretrizes Gerais**

As demais seções (Abrangência, Princípios, Definições, Responsabilidades,
Disposições Finais, Anexos) **podem permanecer vazias** quando não forem
aplicáveis ao tipo da norma.

**Por que essas duas (o "porquê" da regra):** o *Objetivo* diz **para que** a
norma existe; as *Diretrizes Gerais* são **o conteúdo normativo em si** — aquilo
que deve ser cumprido. Sem esses dois, não há norma: há apenas um cabeçalho. As
demais seções complementam, mas nem toda norma precisa de todas. Registrar isto
evita que, no futuro, alguém pergunte "por que justamente essas duas?" e tenha de
redescobrir a decisão.

---

## O que significa "Publicada"

Publicar torna a Norma **oficial e vigente**. A partir daí:

- o conteúdo fica **congelado** — ninguém edita seções nem envia versões;
- registra-se **quem** publicou e **quando**;
- gera-se um **snapshot** (ver abaixo);
- a Norma passa a ser **visível a todos** e pode receber **ciência**.

Para voltar a editar, é preciso **reabrir** (o que a devolve a rascunho).

---

## Snapshot

O **snapshot** é uma **cópia congelada do texto** no momento exato da publicação.
É o **texto oficial** — o que a organização reconhece como válido — e não muda
enquanto a Norma estiver publicada, mesmo que o rascunho seja alterado depois.

- Toda Norma publicada **tem** um snapshot.
- Reabrir e republicar gera um **novo** snapshot (refletindo a revisão).

O snapshot garante que "o que foi publicado" seja auditável e imutável, separado
do rascunho de trabalho.

---

## Versionamento (documentos)

Cada versão tem **um documento obrigatório**, e o histórico é **imutável**: uma
versão **nunca é apagada** — apenas substituída. Existem dois tipos de documento,
distinguidos pelo campo `Documento.oficial`, com regras de substituição
diferentes:

- **Documento oficial** (`oficial: true`) — gerado **automaticamente** ao
  publicar (ou republicar) a Norma, preenchendo o modelo Word real
  (`gerarDocumentoOficial`, em `lib/politica/gerarDocx.ts`, chamado dentro de
  `publicarPolitica`, em `app/(shell)/catalogo/[id]/estado-actions.ts`). A cada
  republicação, o documento oficial anterior passa a **substituído** — só existe
  **uma versão oficial ativa** por vez. A geração é **fail-closed**: se falhar
  (template ausente, tag inválida etc.), a publicação inteira é bloqueada e nada
  muda no banco.
- **Anexo manual** (`oficial: false`) — upload feito pelo usuário
  (`adicionarVersao`, em `app/(shell)/catalogo/[id]/actions.ts`; ex.: uma
  planilha de apoio, um ISO externo). Nunca substitui nada: múltiplos anexos
  **coexistem**, todos `ativa` ao mesmo tempo.
- **O mesmo arquivo pode pertencer a mais de uma Norma** (ex.: uma ISO, um
  formulário institucional ou um POP reutilizado). A unicidade de um anexo é
  **dentro da Norma**, não global.

---

## Ciência (leitura oficial)

**Ciência** é a confirmação registrada de que uma pessoa **leu** uma Norma:

- qualquer colaborador pode dar ciência de uma Norma **publicada**;
- há **no máximo uma** ciência por (pessoa, Norma);
- a ciência é uma **prova auto-contida**: guarda nome e e-mail de quem leu no
  momento do registro, sobrevivendo a mudanças posteriores no cadastro da pessoa.

> **Limite atual:** o valor **jurídico/LGPD** da ciência foi **adiado** por decisão
> do responsável. Hoje a ciência é um controle de gestão (acompanhar quem leu),
> **não** uma prova legal. Rever antes de tratá-la como evidência jurídica.

---

## IA (assistente de redação)

A IA **assiste** a redação, gerando um rascunho das seções a partir de um tema:

- a IA **nunca publica** — apenas propõe conteúdo;
- o resultado é **revisado por um humano** antes de ser aplicado;
- só quem já pode editar a Norma pode usar a IA;
- **aplicar o rascunho da IA é tudo-ou-nada**: ou todas as seções do rascunho são
  atualizadas, ou nenhuma — nunca um estado parcial.

---

## Invariantes — regras que nunca podem ser quebradas

1. Toda Norma tem **um código único e imutável**.
2. O **título é único dentro da área**.
3. **Só rascunho é editável.** Publicada e revogada são congeladas.
4. Publicar **exige o núcleo** (Objetivo + Diretrizes Gerais).
5. **Toda Norma publicada tem um snapshot**; o snapshot é imutável enquanto publicada.
6. Uma Norma está **sempre em exatamente um estado**, e só muda por transição válida.
7. Existe **no máximo um documento oficial ativo** por Norma (substituído a cada
   republicação); anexos manuais coexistem sem limite, nunca substituindo nada
   (ver "Versionamento" acima).
8. **Versão nunca é apagada** — o histórico é imutável.
9. **Uma ciência por (pessoa, Norma)**, e somente de Norma publicada.
10. **Aplicar IA é atômico** (tudo-ou-nada).
11. **Acesso desativado bloqueia**, mesmo no modo de acesso aberto.

---

## Acesso

- Modo **aberto**: qualquer pessoa do domínio da organização entra (perfil
  Colaborador). Modo **fechado**: somente por convite.
- **Desativar** uma pessoa bloqueia o acesso, independentemente do modo.
- A visibilidade de normas segue o papel: gestão/SGI/diretoria veem tudo; Gestor de
  Setor vê publicadas + as do seu setor; Colaborador vê apenas publicadas.
