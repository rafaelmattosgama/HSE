# MAxSafety — Knowledge Base de incidentes S-EWO — Fase 5

## Integração operacional implementada

- Após aprovação Corporate, os S-EWO aprovados entram numa fila Redis e são projetados em registos da Knowledge Base. S-EWO fechados continuam elegíveis enquanto a aprovação Corporate se mantiver.
- A projeção inclui contexto operacional, descrição e mecanismo, causas avaliadas, ações relacionadas e evidências estruturadas. Não copia nomes/números de trabalhadores, responsáveis nem campos clínicos; campos de lesão e consequência permanecem nulos nesta integração.
- Causas marcadas como raiz são `CONFIRMED`; restantes causas selecionadas são `UNCERTAIN`. As ações mantêm estado, prazo previsto e data real separados.
- Atualizações e mudanças nas ações sincronizam novamente o registo. Rejeição, revogação ou reabertura que retire a elegibilidade arquiva o registo operacional, remove os chunks vetoriais e impede a pesquisa através dos filtros de aprovação.
- Reaprovação cria uma nova versão do registo e agenda nova indexação. Se embeddings/Redis não estiverem disponíveis, a informação aprovada continua acessível pela pesquisa textual e estruturada.
- O processamento é idempotente: um hash do conteúdo minimizado evita reescritas e reindexação se nada mudou.

## Correspondência e deduplicação

- S-EWO atuais sincronizados verificam PDFs históricos aprovados da mesma planta. A correspondência usa primeiro o código de ocorrência; como alternativa, exige mês, ano, planta, número sequencial e tipo compatíveis.
- A aprovação Corporate enfileira a sincronização automaticamente. O scheduler também inicia uma reconciliação automática por planta ao arrancar e repete-a diariamente às 03:15 no fuso horário da planta, cobrindo registos aprovados antes desta funcionalidade e eventuais falhas temporárias.
- Uma correspondência única liga o documento histórico ao S-EWO operacional e evita criar uma segunda ocorrência. O PDF e a sua aprovação HSE permanecem como fonte documental.
- Se o PDF histórico for aprovado depois do registo operacional, o fluxo agenda a verificação inversa para os S-EWO aprovados/fechados candidatos da mesma planta e mês.
- Se houver mais de uma correspondência possível, a ocorrência operacional não é indexada e é criado um registo de auditoria para revisão manual. A correspondência não é adivinhada.
- O botão **Reconciliar aprovados** é um recurso de recuperação manual para N0/N3. O endpoint confirma o RBAC no servidor e limita a operação à planta autorizada; o fluxo normal não depende dele.

## Como ativar e validar localmente

1. Reiniciar `npm run dev:all` para o scheduler enfileirar a reconciliação inicial por planta e iniciar o worker.
2. Acompanhar os estados de indexação na lista da Knowledge Base. O documento só fica consultável se estiver aprovado e não arquivado.
3. Aprovar um S-EWO operacional para confirmar a sincronização automática após a decisão Corporate.
4. Aprovar um PDF histórico que possa corresponder a um S-EWO atual para validar a deduplicação inversa.

Não foi executada uma sincronização real durante a implementação; a reconciliação automática será iniciada no próximo arranque do scheduler/`npm run dev:all`.

## Verificações executadas

- Testes focados da sincronização automática, reconciliação, aprovação histórica e notificações S-EWO: **14 testes passaram**.
- ESLint nos ficheiros alterados desta fase: passou.
- `npx tsc --noEmit --pretty false`: não apresentou erros nos ficheiros da Fase 5; continua a falhar em testes preexistentes de outros módulos (tipos de mocks/fixtures), conforme os erros listados na saída do comando.
- Não foi feita chamada ao OpenAI/Ollama, sincronização de dados reais, migration nova nem alteração em produção.

## Limitações e validação pendente

- A verificação de duplicados por sequência/tipo depende dos dados existentes no PDF e do nome/código do documento. Pares ambíguos ficam por indexar até revisão humana.
- A validação ponta a ponta com os três PDFs de aceitação continua pendente porque falta o Documento C original (`S-EWO_MAAP_08_FIRST AIDS_2025_03.pdf`). O S-EWO operacional atual não substitui a validação dos três documentos de referência.
- É necessário confirmar localmente o processamento real no worker e rever os registos resultantes antes de considerar a fase aceite pelos utilizadores.
