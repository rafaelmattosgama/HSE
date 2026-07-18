# Traduções do Plant Master Data

O MA HSE preserva o nome original e o idioma de origem de departamentos, postos de trabalho, equipamentos e riscos profissionais. As traduções são guardadas em `MasterDataTranslation`; códigos e identificadores nunca são traduzidos.

## Configuração

Configure o fornecedor apenas por variáveis de ambiente:

```env
TRANSLATION_PROVIDER=openai
OPENAI_API_KEY=...
OPENAI_TRANSLATION_MODEL=gpt-5.2
```

`TRANSLATION_PROVIDER=disabled` desativa a geração automática sem impedir a criação ou edição dos dados principais. `OPENAI_BASE_URL` pode apontar para um endpoint compatível. Nenhuma credencial deve ser adicionada ao repositório.

Depois de aplicar a migration, gere o Prisma Client e reinicie a aplicação e o worker:

```powershell
npm run db:migrate:deploy
npm run db:generate
npm run worker
```

## Resolução e fallback

A apresentação segue esta ordem:

1. tradução concluída para a língua efetiva do utilizador;
2. original, se já tiver essa língua como origem;
3. tradução inglesa de fallback;
4. original.

Uma tradução vazia nunca substitui o original. Alterar a preferência de idioma faz a leitura seguinte resolver os mesmos IDs na nova língua. A pesquisa da API de master data considera nome original, nome localizado e código; a ordenação usa o nome localizado.

## Backfill

Primeiro valide o âmbito sem gravar:

```powershell
npm run db:backfill-master-data-translations -- --dry-run --batch-size=200
```

Execute o backfill completo:

```powershell
npm run db:backfill-master-data-translations -- --batch-size=200
```

Filtros opcionais:

```powershell
npm run db:backfill-master-data-translations -- --plant=PT11 --entity=AREA --batch-size=100
```

Entidades válidas: `AREA`, `WORKSTATION`, `EQUIPMENT` e `RISK_THEME`. O processo usa paginação por cursor, é idempotente, não duplica traduções, preserva versões marcadas como manuais e pode ser repetido após falhas. O progresso e os erros são emitidos como JSON no terminal. Estados `FAILED` ficam disponíveis para nova tentativa.

## Administração e segurança

O endpoint administrativo `GET/PATCH /api/plants/{plantCode}/admin/master-data/translations` exige `N0_ADMIN`, valida que a entidade pertence à planta da rota e permite consultar ou corrigir traduções manualmente. As traduções manuais não são substituídas pelo processamento automático.

As gravações de master data persistem primeiro o registo principal e preparam a tradução de forma assíncrona. Uma indisponibilidade do fornecedor ou da fila não elimina nem reverte o original; o estado durável fica pendente ou falhado para repetição.
