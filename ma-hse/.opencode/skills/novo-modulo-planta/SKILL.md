---
name: novo-modulo-planta
description: "Use ONLY when creating a new plant module/page (ex: audits, inspections, training). Use when the user says 'criar módulo', 'nova página', 'novo módulo', 'add page', 'add module'. Creates page route, API routes, service, UI strings, nav link, and optionally schema migration following MA-HSE conventions."
---

# Skill: Novo Módulo de Planta

Use esta skill para criar um novo módulo/página dentro de `app/(secure)/app/[plant]/` seguindo as convenções do projeto MA-HSE.

## Passos

### 1. Decidir naming
- O módulo tem um nome curto em inglês (ex: `audits`, `inspections`, `training`)
- Este nome será usado para o diretório, ficheiros de página e API routes
- O nome em PT/outros idiomas fica nos ficheiros de tradução

### 2. Criar a page route
Criar `app/(secure)/app/[plant]/<module>/page.tsx`:
- Server component (sem `"use client"`) por omissão
- Importar `getServerSession` e `requirePlantAccess`
- Obter o locale com `getUserLocaleFromSession()` do ficheiro `lib/server-ui-language.ts`
- Usar `import { RoleCode } from "@prisma/client"`
- Para listas: usar `.app-table-shell` + `.app-table`
- Para KPIs: usar `.app-kpi-card`
- Para formulários: `"use client"` + `react-hook-form` + `zod resolver`

### 3. Criar API routes (se necessário)
Criar `app/api/plants/[plantCode]/<module>/route.ts`:
- `GET`, `POST`, `PUT`, `DELETE` conforme necessário
- Usar `parseBody()` de `@/lib/http` para parsing
- Usar `requirePlantAccess(plantCode, [roles permitidos])` para guard
- Validação com Zod em `lib/validation/dtos.ts` (Adicionar schema lá)
- Resposta sempre com `ok(data)` ou `fail(errorCode, message)` de `@/lib/api`

### 4. Criar service (se necessário)
Criar `lib/services/<module>-service.ts`:
- Nome do ficheiro em kebab-case
- Named exports para cada função
- Usar `prisma.$transaction()` para operações que envolvem múltiplas tabelas
- Chamar `writeAuditLog()` para operações críticas

### 5. Registar UI strings
Adicionar entradas em `lib/ui-language.ts`:
- Chave `modules.<moduleName>` para o nome traduzido
- Chaves `dashboard.<moduleName>.*` se houver dashboard widgets

### 6. Registar no navigation
Verificar `components/layout/plant-nav.tsx` para adicionar link:
- Seguir padrão: label de `ui.modules.<module>`, href `/app/${plant}/${module}`
- Usar ícone de `lucide-react`

### 7. Adicionar ao schema (se necessário)
- Editar `prisma/schema.prisma`
- Executar `npx prisma migrate dev --name descricao`
- Atualizar `prisma/seed.ts` se aplicável

## Convenções a manter
- Named exports sempre
- Ficheiros em kebab-case
- Componentes React em PascalCase
- `@/` path alias para imports
- API envelope: `{ ok: true, data }` / `{ ok: false, errorCode, message }`
- Zod schemas em `lib/validation/dtos.ts`
