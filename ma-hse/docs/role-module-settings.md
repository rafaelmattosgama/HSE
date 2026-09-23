# Módulos por perfil no Admin de N3

O N3 dispõe de uma tabela **Módulos por perfil** no Admin da sua fábrica, com colunas para N4 Supervisor, N5 Operator e N6 HR. Cada escolha aplica-se a todos os utilizadores desse perfil nessa fábrica.

- Só são apresentados módulos autorizados pelo N0 para a fábrica e disponíveis nas permissões atuais de pelo menos um dos três perfis. Uma célula sem controlo indica que esse perfil não dispõe do módulo.
- N3 pode restringir ou repor o acesso dentro dessas permissões. Não pode alterar a autorização da fábrica, os perfis superiores ou a configuração de outra fábrica.
- A API valida a autorização efetiva da fábrica em cada gravação, incluindo alterações feitas pelo N0 depois de o formulário ter sido aberto.
- As escolhas são guardadas em `SystemParameter`, com `plantId` e chave `ROLE_MODULE_TOGGLES`. Sem configuração, mantém-se o acesso existente. Não é necessária migration.
- A configuração global e a autorização específica da fábrica continuam a ser geridas pelo N0. Uma desativação da fábrica prevalece sempre sobre uma ativação por perfil. Reautorizar o módulo conserva a última escolha do N3.
- A navegação, as páginas acedidas diretamente e as APIs dos módulos aplicam as escolhas. O proxy fornece o caminho real ao template e aos guards; não aceita o cabeçalho de caminho enviado pelo cliente como fonte de autorização.
- A vista agregada de todas as fábricas só disponibiliza um módulo se todas as fábricas incluídas o permitirem ao utilizador. As vistas individuais continuam disponíveis nas fábricas autorizadas.
- As alterações são auditadas com o utilizador e a fábrica. A API de gestão admite N0 e o N3 da fábrica; a secção é apresentada no Admin de N3.

Os módulos conservam as permissões funcionais de cada perfil (por exemplo, HR mantém consulta de S-EWO, sem obter aprovação ou edição).
