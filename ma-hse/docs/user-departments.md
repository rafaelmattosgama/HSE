# Departamentos dos utilizadores N2 e N4

- A criação ou edição de um utilizador N2/N4 exige a seleção de um departamento ativo da respetiva planta.
- A lista usa o catálogo **Plant Master Data → Departamentos** (`Area`), incluindo as traduções existentes, e atualiza ao focar o campo.
- A associação fica em `UserPlantRole.departmentId`, para permitir departamentos diferentes por planta. Não altera as permissões do perfil.
- Os utilizadores existentes são preservados; o departamento é solicitado quando forem editados. Não é atribuído automaticamente um departamento aos registos antigos.
- Para plantas novas, configure os departamentos e depois crie o N2 em **Gestão de utilizadores**. O formulário de criação da planta continua a criar N1 e N3.
- A API valida a planta e o estado ativo do departamento. Outros perfis não recebem associação a departamento.

## Instalação

Aplicar a migration `20260921110000_add_user_department` antes de executar a nova versão:

```sh
npm run db:migrate:deploy
npm run db:generate
```

Reiniciar a aplicação e os workers para carregarem o Prisma Client atualizado.

## Filtro no Dashboard de Segurança

- O seletor **Departamento** usa apenas os departamentos ativos do **Plant Master Data**, com os respetivos códigos e traduções. Departamentos antigos inativados não aparecem como opções duplicadas; os registos associados continuam incluídos em **Todos os departamentos**.
- N2/N4 entram com o departamento da sua associação à planta selecionado. A associação é consultada na base de dados em cada acesso, sem exigir novo login quando é alterada.
- É possível selecionar outro departamento ou **Todos os departamentos**. Outros perfis e utilizadores antigos sem departamento começam com a planta completa.
- O filtro aplica-se à pirâmide (incluindo a comparação homóloga), aos rankings dos Indicadores da Planta e às respetivas séries mensais. Os cartões gerais de KPI e dias sem acidentes continuam a representar a planta.
- As comunicações usam `areaId`. Os S-EWO usam o seu departamento ou, quando não preenchido, o da comunicação associada. Registos sem departamento entram apenas na opção Todos.
- Na visualização de indicadores por departamento estão disponíveis eventos validados, quase acidentes, lesões e causas raiz. Os indicadores de ações e índices baseados em horas são apresentados apenas na vista de toda a planta, pois não têm uma base departamental completa.
- O URL guarda `departmentId`; a escolha explícita `all` prevalece sobre o departamento predefinido. Alterar ou repor datas preserva a seleção.
