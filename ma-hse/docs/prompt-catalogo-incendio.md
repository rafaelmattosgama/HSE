# Prompt — Propriedade do catálogo de incêndio pelo N3 da planta

Aplica ao módulo Equipamentos de Segurança Contra Incêndio a mesma regra decidida para as Competências no §2.7 de `docs/modulo-competencias-autorizacoes.md`: o catálogo pertence à planta, define-o o `N3_SAFETY` dessa planta no módulo Admin, com o `N1_CORPORATE` a poder intervir, e o `N0_ADMIN` está bloqueado de criar ou editar.

## Estado verificado antes de escrever este prompt

| Peça | Estado |
|---|---|
| Schema completo (tipos, equipamentos, fichas, checklists, execuções, conformidade, alertas) | ✅ existe |
| `lib/modules.ts` — `FIRE_SAFETY_EQUIPMENT` e nav `fire-equipment` | ✅ registado |
| API do equipamento (`route.ts`, `[id]/tag`, `[id]/tag/pdf`, `executions`, `export`) | ✅ existe |
| `admin/fire-equipment-types/route.ts` | ⚠️ existe, mas **N0-only** em GET/POST/DELETE |
| `admin/fire-checklist-templates/route.ts` | ❌ **não existe** |
| `fire-equipment-type-manager.tsx` | ❌ não existe |
| `fire-checklist-template-manager.tsx` | ❌ não existe |
| Secção de incêndio no ecrã de admin da planta | ❌ nada montado |
| Seed `upsertFireEquipmentTypes` | ✅ 4 tipos, só nas plantas de demonstração (`pl01`, `pl02`, `pl1`) |

Consequência: na `maap` o módulo está no mesmo beco em que estavam as competências, e por duas razões em vez de uma — sem tipos de equipamento e sem checklists definidas, não há nada a verificar nem forma de o configurar pela interface.

---

## Prompt

```
Lê docs/modulo-competencias-autorizacoes.md §2.7 (propriedade do catálogo) e a
especificação do módulo de incêndio, §3.1, §3.4 e §7.5. Aplica a mesma regra de
propriedade ao catálogo de incêndio e constrói os ecrãs que faltam.

REGRA: o catálogo de tipos de equipamento e o catálogo de checklists pertencem à
planta. Define-os o N3_SAFETY dessa planta, no módulo Admin da planta, com o
N1_CORPORATE a poder intervir. O N0_ADMIN fica BLOQUEADO de criar e editar, e vê
os ecrãs em leitura. Os catálogos nascem vazios e são criados de raiz — sem
defaults, sem sugestões, sem pré-preenchimento no fluxo de criação de plantas.

1. PERMISSÕES — o guard não consegue excluir o N0 por lista de papéis

   Em lib/rbac/evaluator.ts, hasPlantAccess devolve true para N0_ADMIN sem olhar
   para allowedRoles (linhas 14-16), e requirePlantAccess devolve mais cedo para
   N0 e N1 antes de validar allowedRoles (guards.ts:36-44). A exclusão do N0 tem
   de ser verificação explícita depois do guard.

   Em app/api/plants/[plantCode]/admin/fire-equipment-types/route.ts, as três
   handlers usam hoje requirePlantAccess(plantCode, [RoleCode.N0_ADMIN]) — o
   inverso do pretendido. Passa a:

     // GET — leitura aberta a N0 para suporte
     const auth = await requirePlantAccess(plantCode,
       [RoleCode.N1_CORPORATE, RoleCode.N3_SAFETY]);
     if ("error" in auth) return auth.error;

     // POST e DELETE — o catálogo pertence à planta. O guard admite N0 por
     // bypass global; aqui é bloqueado de propósito.
     if (auth.role === RoleCode.N0_ADMIN) {
       return fail("FORBIDDEN",
         "O catálogo de incêndio é definido pelo N3 da planta", 403);
     }

   Confirma que a rota continua a resolver o plantId por getPlantByCode(plantCode)
   e nunca por auth.plantId — o guard não devolve plantId nos ramos N0/N1.

2. ROTA NOVA: app/api/plants/[plantCode]/admin/fire-checklist-templates/route.ts

   Não existe. Sem ela não há forma de definir o que se verifica em cada
   equipamento, e o módulo não funciona mesmo com os tipos criados.

   CRUD de FireChecklistTemplate e dos seus FireChecklistItem. Mesmas permissões
   do ponto 1. Nota o @@unique([plantId, fireEquipmentTypeId, frequency]) do
   schema: existe no máximo um template ativo por (tipo, periodicidade) — trata
   a criação como upsert sobre essa chave, não como insert cego.

   Campos do template: fireEquipmentTypeId, frequency (QUARTERLY|ANNUAL), name,
   legalReference, version, isActive.
   Campos do item: code, label, helpText, responseType (OK_NOK, OK_NOK_NA,
   NUMERIC, TEXT), isCritical, displayOrder, isActive.

   REGRA DE INTEGRIDADE (§3.4 da especificação): um FireChecklistItem que já
   tenha FireChecklistItemResponse NÃO pode ter o label nem o responseType
   editados — editar mudaria retroativamente o significado de execuções
   passadas. Nesse caso devolve erro a explicar, e o caminho é desativar o item
   (isActive false) e criar um novo com code diferente. Vale o mesmo para
   apagar: nunca apagar um item já respondido.

3. ECRÃS NOVOS

   components/feature/fire-equipment-type-manager.tsx
     CRUD de FireEquipmentType: code, name, category (FireEquipmentCategory),
     codePrefix, legalReference, displayOrder, isActive.
     Atenção ao codePrefix: alimenta o internalCode dos equipamentos
     (EXT-MAAP-0032). Não permitas alterá-lo depois de existirem equipamentos
     desse tipo — os códigos já impressos em etiquetas físicas deixariam de
     corresponder. Bloqueia com erro explícito.

   components/feature/fire-checklist-template-manager.tsx
     Por cada (tipo, periodicidade): gestão da lista de itens — adicionar,
     reordenar por displayOrder, marcar isCritical, desativar. Mostra quantas
     execuções já usaram cada item, porque é isso que determina se pode ser
     editado (ponto 2).

   Ambos no padrão de components/feature/professional-risks-manager.tsx.

4. MONTAGEM NO ECRÃ DE ADMIN DA PLANTA

   app/(secure)/app/[plant]/admin/page.tsx não tem hoje nada de incêndio.
   Acrescenta os dois ecrãs, nesta ordem e visivelmente nesta ordem:
     1º Tipos de equipamento
     2º Checklists
   A ordem é informação: sem tipo não há template, e o segundo ecrã escolhe o
   tipo do primeiro. Gateia por N1_CORPORATE ou N3_SAFETY para escrita; para o
   N0 mostra em leitura com os botões desativados e uma linha a explicar porquê.

   Segue o mesmo tratamento que for aplicado ao CompetenceTypeManager e ao
   CompetenceRequirementManager, para os quatro ecrãs de configuração ficarem
   coerentes entre si.

5. PROTEÇÃO NA DESATIVAÇÃO DE UM TIPO

   Não permitas desativar um FireEquipmentType que tenha FireEquipment
   associados. Devolve erro a dizer quantos. Hoje o soft delete passa sempre e
   deixaria equipamentos e o seu histórico de conformidade sem tipo — e sem
   coluna na lista.

6. AUDITORIA

   writeAuditLog() na criação, edição e desativação de FireEquipmentType,
   FireChecklistTemplate e FireChecklistItem. São alterações de configuração que
   mudam o que passa a ser verificado, e por isso precisam de autor e data.
   Escreve o log DEPOIS da transação, não dentro (mesma correção do item 8 do
   relatório docs/revisao-modulo-competencias.md).

7. ESTADOS VAZIOS (obrigatório, não acabamento)

   Com os catálogos a nascerem vazios em todas as plantas, estes estados passam
   a ser o caminho normal de arranque, não exceções:

   - components/feature/fire-equipment-list.tsx: quando não há
     FireEquipmentType ativo, substitui a lista por um estado vazio (.app-empty)
     a dizer que o catálogo está vazio, com o caminho Admin -> Tipos de
     equipamento. Mostra o link só a quem tem papel para lá ir (N1, N3).
   - No formulário de nova verificação: quando o tipo do equipamento não tem
     template ativo para aquela periodicidade, diz isso explicitamente e aponta
     para Admin -> Checklists, em vez de mostrar um formulário sem itens.

   Foi a ausência destes estados que tornou o mesmo problema difícil de
   diagnosticar no módulo de Competências.

8. SEED

   Mantém upsertFireEquipmentTypes e acrescenta um comentário a dizer que é
   fixture de desenvolvimento e só corre para as plantas de demonstração
   (pl01, pl02, pl1). NÃO o propagues a app/api/corporate/plants/route.ts — o
   catálogo de uma planta real é criado de raiz pelo N3.

9. ESPECIFICAÇÃO

   Acrescenta à especificação do módulo de incêndio uma decisão nova, no §2, a
   registar esta regra de propriedade, com referência cruzada ao §2.7 do módulo
   de Competências. Acrescenta-a também à tabela do §13 (Estado das decisões),
   na secção das fechadas. Sem isto, quem implementar as fases seguintes volta
   a assumir N0 por omissão, que é o que aconteceu aqui.

10. TESTES

   - N0_ADMIN recebe 403 em POST e DELETE de fire-equipment-types e de
     fire-checklist-templates, e 200 em GET
   - N3_SAFETY da planta consegue criar, editar e desativar em ambos
   - N3_SAFETY de outra planta recebe 403
   - N1_CORPORATE consegue criar
   - N2_PLANT_MANAGER e N4_SUPERVISOR recebem 403
   - desativar um tipo com equipamentos associados falha
   - editar o label de um item de checklist já respondido falha
   - alterar o codePrefix de um tipo com equipamentos falha
   - as asserções verificam o array passado a requirePlantAccess, não só o
     código de estado

TERMINA COM: npm run build && npm run test:unit, ambos limpos.
```

---

## Ordem de arranque na `maap`, depois disto

1. Admin → Tipos de equipamento: criar Extintor, Carretel, Bloco autónomo, Central de incêndio (com os prefixos `EXT`, `CAR`, `BAE`, `CDI`)
2. Admin → Checklists: definir os itens para cada combinação tipo × periodicidade — são oito combinações com os quatro tipos
3. Módulo → Adicionar equipamento, com localização e código interno gerado
4. Imprimir etiquetas e afixar
5. Primeira ronda de verificação

Os passos 1 e 2 são os que hoje não têm ecrã. O passo 2 é o mais demorado e vale fazê-lo com o HSE ao lado — a lista de itens de exemplo do §3.4 da especificação é um ponto de partida, não uma checklist normativa, e o próprio documento avisa que as referências legais não foram verificadas.
