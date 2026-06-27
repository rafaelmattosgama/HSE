---
title: "Manual de Utilizador"
subtitle: "MA HSE"
author: "MA HSE"
date: "25 de junho de 2026"
lang: "pt-PT"
toc: true
toc-depth: 3
numbersections: true
geometry: margin=22mm
colorlinks: true
---

<div class="cover">
  <div class="cover-brand">MA HSE</div>
  <h1 class="cover-title">Manual de Utilizador</h1>
  <div class="cover-subtitle">MA HSE</div>
  <div class="cover-meta">
    <p><strong>Publico:</strong> Utilizadores finais</p>
    <p><strong>Data:</strong> 25 de junho de 2026</p>
    <p>Guia funcional para utilizacao dos modulos MA HSE.</p>
  </div>
</div>

<div class="page-break"></div>

# Manual de Utilizador - MA HSE

Versao gerada por analise do projeto em 2026-06-25.

## 1. Objetivo

O MA HSE e uma aplicacao web para gestao de Saude, Seguranca e Ambiente em contexto multi-planta. Permite registar comunicacoes de seguranca, gerir acoes corretivas, acompanhar indicadores, validar ocorrencias, executar analises S-EWO, registar auditorias SMAT, controlar saude ocupacional, contractors, inputs mensais e mapas operacionais.

Este manual destina-se aos utilizadores finais da aplicacao. Algumas opcoes podem nao aparecer para todos os utilizadores, porque a visibilidade depende do perfil de acesso, da planta selecionada e dos modulos ativos.

## 2. Acesso

### 2.1 Entrar na aplicacao

1. Abrir o endereco da aplicacao no navegador.
2. Introduzir o email e a palavra-passe.
3. Selecionar a area/planta disponivel no menu lateral ou entrar pelo dashboard apresentado.

Se a conta tiver sido criada com uma palavra-passe temporaria, o sistema pode pedir a alteracao da palavra-passe antes de permitir o acesso normal.

### 2.2 Alterar palavra-passe

1. Abrir o menu do utilizador.
2. Entrar no perfil ou na pagina de alteracao de palavra-passe, quando solicitado.
3. Introduzir a palavra-passe atual e a nova palavra-passe.
4. Guardar.

### 2.3 Idioma

A aplicacao suporta varios idiomas. O idioma pode ser definido pelo utilizador ou herdado da configuracao da planta. Algumas areas ainda podem apresentar textos tecnicos em ingles, dependendo do modulo.

## 3. Navegacao Principal

Dentro de uma planta, o menu lateral pode apresentar:

- Safety Dashboard
- Environment Dashboard
- Validation
- Communications
- Actions
- S-EWO
- SMAT
- Occupational Health
- Monthly Inputs
- Contractors
- MAPA
- Admin

Utilizadores com permissao corporativa podem tambem aceder ao dashboard corporativo. Administradores globais podem aceder a Settings.

## 4. Safety Dashboard

O dashboard de seguranca resume o desempenho da planta para um periodo selecionado.

### 4.1 Filtrar periodo

1. Abrir `Safety Dashboard`.
2. Selecionar ano, mes ou intervalo de datas.
3. Clicar em `Apply`.
4. Usar `Clear dates` ou `Current year` para repor filtros.

### 4.2 Indicadores apresentados

O dashboard pode mostrar:

- dias sem acidente;
- comunicacoes validadas;
- horas trabalhadas;
- acoes em atraso;
- minhas acoes abertas;
- comunicacoes abertas;
- comunicacoes pendentes de validacao;
- casos clinicos;
- piramide de seguranca;
- top 5 de causas raiz S-EWO;
- top 5 por tipos de ato inseguro, condicao insegura e near miss;
- rankings por trabalhador, departamento e local.

Os indicadores KPI consideram comunicacoes em estados validados, em curso ou fechadas.

## 5. Communications

O modulo `Communications` e usado para registar e consultar ocorrencias de seguranca.

### 5.1 Tipos de comunicacao

A aplicacao suporta, de acordo com permissao e origem:

- Unsafe Act
- Unsafe Condition
- Near Miss
- First Aid
- Injury / Accident
- 5S Improvement
- Improvement Suggestion

### 5.2 Criar comunicacao

1. Abrir `Communications`.
2. Preencher o formulario de criacao rapida.
3. Selecionar tipo, data/hora, area, local, trabalhador envolvido quando aplicavel, descricao e acao sugerida.
4. Se disponivel, associar uma acao corretiva.
5. Submeter.

Alguns campos clinicos, como natureza da lesao ou parte do corpo, aparecem apenas para eventos que os exigem.

### 5.3 Consultar comunicacoes

A lista mostra as comunicacoes recentes da planta, incluindo codigo, data, tipo, estado, reportador, departamento, local e descricao. Consoante a permissao, tambem podem aparecer classificacoes tecnicas, tipos de ato inseguro, condicao insegura ou near miss.

### 5.4 Detalhe da comunicacao

Ao abrir uma comunicacao, o utilizador pode consultar os dados registados, estados, anexos, acoes ligadas e historico operacional disponivel.

## 6. Validacao

O modulo `Validation` e usado principalmente por perfis de seguranca e corporativos.

### 6.1 Validar comunicacoes

1. Abrir `Validation`.
2. Rever as comunicacoes em estado submetido ou pendente.
3. Confirmar os dados da ocorrencia.
4. Aprovar/validar ou tratar conforme as opcoes disponiveis.

Uma comunicacao validada passa a contar para dashboards e KPI.

### 6.2 Validacao S-EWO

Utilizadores corporativos podem ver tambem a fila de validacao/aprovacao S-EWO, quando existirem registos pendentes.

## 7. Actions

O modulo `Actions` gere planos de acao corretiva e preventiva.

### 7.1 Criar acao

1. Abrir `Actions`.
2. Preencher titulo, descricao, responsavel, prioridade, prazo e origem.
3. Associar a uma comunicacao quando aplicavel.
4. Guardar.

### 7.2 Acompanhar acoes

A tabela apresenta:

- codigo sequencial;
- titulo e descricao;
- nivel;
- prioridade;
- estado;
- responsavel;
- prazo;
- data de fecho;
- local;
- origem;
- evidencias.

### 7.3 Fechar acao

1. Abrir a acao.
2. Adicionar comentario de fecho.
3. Anexar evidencia obrigatoria, quando solicitado.
4. Confirmar o fecho.

Sem evidencia e comentario, o fecho pode ser recusado pelo sistema.

## 8. S-EWO

O modulo `S-EWO` e usado para analise estruturada de ocorrencias, causas e acoes.

### 8.1 Criar S-EWO

1. Abrir `S-EWO`.
2. Escolher criar novo registo ou iniciar a partir de uma comunicacao existente.
3. Preencher dados do evento, local, trabalhador, turno e descricao.
4. Preencher os campos de analise.
5. Selecionar causas e marcar causas raiz.
6. Criar ou associar acoes.
7. Submeter para aprovacao quando aplicavel.

### 8.2 Estados

Os estados podem incluir rascunho, submetido, aprovado, rejeitado ou fechado, conforme o fluxo configurado.

### 8.3 Aprovacao

A aprovacao final e normalmente feita por perfil de gestao/corporativo autorizado. Comentarios de aprovacao ou rejeicao ficam associados ao registo.

## 9. SMAT

O modulo `SMAT` permite registar auditorias comportamentais e observacoes em campo.

### 9.1 Criar auditoria

1. Abrir `SMAT`.
2. Preencher auditor, data, hora, area e local.
3. Registar numero de pessoas observadas e envolvidas.
4. Preencher observacoes de atos seguros, condicoes seguras, atos inseguros e condicoes inseguras.
5. Responder ao guia de perguntas.
6. Adicionar fotos/anexos e acoes, se necessario.
7. Guardar.

### 9.2 Exportar auditoria

Auditorias recentes podem ser exportadas para PDF ou Excel.

## 10. Occupational Health

O modulo `Occupational Health` gere trabalhadores e validade de exames.

### 10.1 Consultar trabalhadores

A tabela apresenta numero, nome, idade, data de exame, validade, estado e observacoes.

### 10.2 Adicionar ou editar trabalhador

1. Abrir `Occupational Health`.
2. Clicar em `Add worker` ou no nome do trabalhador.
3. Preencher dados pessoais, posto, funcao, nacionalidade, data de exame e estado.
4. Guardar.

A idade e a validade do exame sao calculadas automaticamente com base nas datas introduzidas.

### 10.3 Importar e exportar

O modulo permite:

- importar Excel;
- descarregar template;
- exportar Excel;
- exportar PDF;
- inativar trabalhadores selecionados.

## 11. Monthly Inputs

O modulo `Monthly Inputs` recolhe dados mensais usados nos dashboards de seguranca, operacao e ambiente.

### 11.1 Preencher dados

1. Abrir `Monthly Inputs`.
2. Confirmar o ano.
3. Selecionar o mes.
4. Preencher os indicadores por seccao.
5. Guardar.

### 11.2 Modos de visualizacao

- `Month`: foco num mes.
- `Year`: revisao anual completa.

A pagina mostra percentagem de preenchimento mensal e anual, numero de indicadores ativos e horas standard calculadas.

### 11.3 Excel

E possivel exportar template, exportar dados e importar ficheiro Excel preenchido.

## 12. Environment Dashboard

O `Environment Dashboard` usa os inputs mensais para apresentar indicadores ambientais por planta ou corporativos. A disponibilidade depende do modulo ativo e das permissoes do utilizador.

## 13. Contractors

O modulo `Contractors` gere empresas externas, trabalhadores externos e respetiva documentacao.

### 13.1 Convidar empresa externa

1. Abrir `Contractors`.
2. Introduzir o email de contacto da empresa.
3. Enviar convite.

A empresa recebe/acede a um link de registo.

### 13.2 Consultar empresas e trabalhadores

A tabela permite filtrar por:

- nome;
- tipo: empresa ou trabalhador;
- estado de aprovacao;
- estado ativo/inativo.

### 13.3 Portal da empresa externa

No portal, a empresa externa pode:

- consultar estado de aprovacao;
- submeter documentos da empresa em PDF;
- criar trabalhadores;
- submeter documentos dos trabalhadores em PDF;
- ativar, inativar ou eliminar trabalhadores, conforme o fluxo disponivel.

## 14. MAPA

O modulo `MAPA` permite visualizar mapas/documentos da planta com camadas e pontos de interesse.

Funcionalidades principais:

- consultar documentos de mapa;
- visualizar camadas;
- posicionar areas e postos de trabalho;
- ver marcadores automaticos agregados de incidentes por tipo.

## 15. Registo Publico por QR Code

Algumas plantas podem ter links publicos por QR Code para reportar situacoes sem login.

### 15.1 Submeter ocorrencia por QR

1. Abrir o QR Code ou link publico.
2. Selecionar o tipo de comunicacao.
3. Preencher data/hora, nome do reportador, numero, area, local, turno, trabalhador envolvido quando aplicavel, descricao e acao sugerida.
4. Anexar fotografias se necessario.
5. Submeter.

### 15.2 Fotografias

Limites aplicados:

- maximo de 5 fotografias;
- maximo de 5 MB por fotografia;
- maximo de 20 MB no total;
- formatos aceites: JPG, JPEG, PNG, WEBP, HEIC e HEIF.

O sistema bloqueia datas futuras e evita duplicados recentes no periodo configurado.

## 16. Alertas e Notificacoes

A aplicacao pode apresentar alertas flutuantes e notificacoes internas, por exemplo:

- alertas de repetibilidade;
- S-EWO rejeitado;
- comunicacoes de seguranca pendentes;
- acoes em atraso;
- emails de digest ou relatorios, quando os jobs estiverem ativos.

## 17. Boas Praticas

- Registar ocorrencias logo apos o evento.
- Usar descricoes objetivas e completas.
- Associar areas, locais e trabalhadores corretos.
- Anexar evidencias quando ajudam a compreender a situacao.
- Validar comunicacoes pendentes regularmente.
- Fechar acoes apenas quando a acao foi realmente executada e existe evidencia.
- Manter dados mensais atualizados antes de analisar KPI.

## 18. Resolucao de Problemas

### Nao consigo entrar

Confirmar email, palavra-passe e estado da conta. Se a palavra-passe for temporaria, concluir a alteracao obrigatoria.

### Nao vejo um modulo

O modulo pode estar desativado para a planta ou o perfil pode nao ter permissao.

### Os KPI parecem incompletos

Verificar se as comunicacoes foram validadas e se os inputs mensais, como horas trabalhadas, foram preenchidos.

### Nao consigo fechar uma acao

Confirmar que foi introduzido comentario e anexada evidencia quando obrigatoria.

### O QR Code nao abre

O token pode estar incorreto, revogado ou expirado por regeneracao. Pedir novo QR Code ao administrador da planta.

