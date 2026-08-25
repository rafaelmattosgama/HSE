# Prompt — Propriedade do catálogo de competências pelo N3 da planta

Implementa a decisão §2.7 de `docs/modulo-competencias-autorizacoes.md`. Companheiro de `docs/prompt-catalogo-incendio.md`, que faz o equivalente para o módulo de incêndio.

## Estado verificado antes de escrever este prompt

| Peça | Estado |
|---|---|
| Schema completo do módulo | ✅ existe |
| `lib/modules.ts` — `COMPETENCE_AUTHORIZATIONS` e nav `competences` | ✅ registado |
| Painel de inserção dos três níveis (`competence-cell-detail-panel.tsx`, 28 KB) | ✅ existe e está completo |
| `admin/competence-types/route.ts` | ⚠️ existe, mas **N0-only** em GET/POST/DELETE |
| `admin/competence-requirements/route.ts` | ⚠️ existe, mas **N0-only** |
| `competence-type-manager.tsx` | ❌ não existe |
| `CompetenceRequirementManager` no ecrã de admin | ⚠️ montado, mas atrás de `actorRole === N0_ADMIN` |
| Seed `upsertCompetenceTypes` | ✅ 4 tipos, só nas plantas de demonstração (`pl01`, `pl02`, `pl1`) |

Consequência na `maap`: catálogo vazio, logo matriz sem colunas, logo o painel de inserção é inalcançável — e o N3 nem vê a secção de administração para o resolver.

---

## Prompt

```
Lê docs/modulo-competencias-autorizacoes.md §2.7 e a tabela de papéis do §2.3.

O catálogo de competências e a matriz de requisitos passam a pertencer à
planta: define-os o N3_SAFETY dessa planta, no módulo Admin da planta, com o
N1_CORPORATE a poder intervir. O N0_ADMIN fica BLOQUEADO de criar e editar.
Hoje está exatamente ao contrário — as duas rotas usam
requirePlantAccess(plantCode, [RoleCode.N0_ADMIN]) e o ecrã de admin gateia
tudo em actorRole === RoleCode.N0_ADMIN, pelo que o N3 nem vê a secção.

1. ECRÃ NOVO: components/feature/competence-type-manager.tsx

   CRUD sobre a rota admin/competence-types que já existe. Campos: code, name,
   category (CompetenceCategory), requiresTraining, requiresAssessment,
   requiresAuthorization, validityMonths, refresherMonths, legalReference,
   displayOrder. Desativação por isActive (a rota já faz soft delete).
   Segue o padrão de components/feature/professional-risks-manager.tsx.

   Monta-o no ecrã de admin da planta ACIMA do CompetenceRequirementManager.
   A ordem importa e deve ser visível: primeiro define-se o catálogo, só
   depois se define quem o exige. Um requisito sem tipo não existe.

2. PERMISSÕES — cuidado, este guard já nos enganou três vezes

   Em lib/rbac/evaluator.ts, hasPlantAccess devolve true para N0_ADMIN sem
   olhar para allowedRoles (linhas 14-16), e requirePlantAccess devolve mais
   cedo para N0 e N1 antes de validar allowedRoles (guards.ts:36-44). Logo
   NÃO é possível excluir o N0 por lista de papéis — tem de ser verificação
   explícita depois do guard.

   Nas rotas admin/competence-types e admin/competence-requirements:

     // GET — leitura aberta a N0 para suporte
     const auth = await requirePlantAccess(plantCode,
       [RoleCode.N1_CORPORATE, RoleCode.N3_SAFETY]);
     if ("error" in auth) return auth.error;

     // POST e DELETE — o catálogo pertence à planta (§2.7). O guard admite
     // N0 por bypass global; aqui é bloqueado de propósito.
     if (auth.role === RoleCode.N0_ADMIN) {
       return fail("FORBIDDEN",
         "O catálogo de competências é definido pelo N3 da planta", 403);
     }

   Confirma que as rotas continuam a resolver o plantId com
   getPlantByCode(plantCode) e nunca por auth.plantId — o guard não devolve
   plantId nos ramos N0/N1. As rotas atuais já fazem isto bem; não regridas.

3. ECRÃ DE ADMIN: troca o gate actorRole === RoleCode.N0_ADMIN por
   N1_CORPORATE ou N3_SAFETY, tanto na busca de dados (as três ternárias com
   competenceType/listRequirements/getRequirementCoverage) como na renderização
   do CompetenceRequirementManager e do novo CompetenceTypeManager. Para o N0,
   mostra os dois ecrãs em modo leitura, com os botões de escrita desativados
   e uma linha a explicar porquê — não os esconde, para o suporte poder ver
   como a planta está configurada.

4. AUDITORIA: writeAuditLog() na criação, edição e desativação de um
   CompetenceType. É uma alteração de configuração que muda o que passa a ser
   exigido a pessoas — precisa de autor e data. Escreve-o DEPOIS da transação,
   conforme a correção do item 8 de docs/revisao-modulo-competencias.md.

5. PROTEÇÃO NA DESATIVAÇÃO: não permitas desativar um CompetenceType que tenha
   WorkerAuthorization, TrainingRecord ou CompetenceAssessment associados.
   Devolve um erro a dizer quantos registos existem. Hoje o soft delete passa
   sempre e deixaria histórico órfão numa matriz sem a coluna correspondente.

6. ESTADO VAZIO NA MATRIZ (obrigatório, não acabamento)

   Com o catálogo a nascer vazio em todas as plantas novas, a matriz sem
   colunas passa a ser o estado normal de arranque. Em
   competence-matrix-manager.tsx, quando matrix.competenceTypes.length === 0,
   substitui a tabela por um estado vazio (.app-empty) que diz que o catálogo
   está vazio e explica o caminho: Admin -> Catálogo de competências. Mostra o
   link só a quem tem papel para lá ir (N1, N3). Sem isto, cada planta nova
   repete o beco sem saída da maap.

   Faz o mesmo no painel "Competências" da ficha individual, que hoje renderiza
   uma grelha vazia sem explicação.

7. SEED: mantém upsertCompetenceTypes, mas acrescenta um comentário a dizer
   que é fixture de desenvolvimento e que só corre para as plantas de
   demonstração (pl01, pl02, pl1), a par das comunicações e S-EWO fictícios.
   NÃO o propagues ao fluxo de criação de plantas em
   app/api/corporate/plants/route.ts — o catálogo de uma planta real é criado
   de raiz pelo N3 (§2.7), não pelo sistema.

8. TESTES:
   - N0_ADMIN recebe 403 em POST e DELETE de competence-types e
     competence-requirements, e 200 em GET
   - N3_SAFETY da planta consegue criar, editar e desativar
   - N3_SAFETY de outra planta recebe 403
   - N1_CORPORATE consegue criar
   - N2_PLANT_MANAGER e N4_SUPERVISOR recebem 403
   - desativar um tipo com autorizações associadas falha
   - as asserções verificam o array passado a requirePlantAccess, não só o
     código de estado (ver item M1 de docs/revisao-modulo-competencias.md)

TERMINA COM: npm run build && npm run test:unit, ambos limpos.
```

---

## Ordem de arranque na `maap`, depois disto

1. Admin → Catálogo de competências: criar Empilhador, Plataforma elevatória, Ponte rolante, Trabalhos em altura (12 meses cada, avaliação prática obrigatória)
2. Admin → Requisitos: definir que funções exigem o quê — é isto que torna o cinzento automático em vez de suposição
3. Módulo → Adicionar trabalhador, com a área atribuída no modal
4. Matriz → clicar numa célula → registar formação, avaliação prática e autorização

O passo 1 é o que hoje não tem ecrã. O passo 2 exige ter as funções (`roleName`) levantadas — e nota que os 101 trabalhadores importados da Medicina do Trabalho ficaram sem função, por decisão tomada na importação; a função do módulo de Competências vive em `CompetenceWorker.roleName` e define-se aqui.
