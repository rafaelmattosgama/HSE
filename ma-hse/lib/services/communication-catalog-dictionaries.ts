const PT_UNSAFE_CONDITION_CATEGORY_LABELS: Record<string, string> = {
  "FACILITIES / EQUIPMENT": "INSTALACOES / EQUIPAMENTOS",
  "PROCEDURE / SYSTEMS": "PROCEDIMENTOS / SISTEMAS",
};

const PT_UNSAFE_CONDITION_NAME_BY_CODE: Record<string, string> = {
  "UC-FAC-01": "Funcionamento anomalo de equipamentos / instalacoes",
  "UC-FAC-02": "Equipamentos ou instalacoes inadequados",
  "UC-FAC-03": "Fabricacao / instalacao incorreta",
  "UC-FAC-04": "Falha / avaria",
  "UC-FAC-05": "Falta de ciclos de limpeza",
  "UC-FAC-06": "Falta de manutencao",
  "UC-FAC-07": "Iluminacao insuficiente",
  "UC-FAC-08": "Fragilidade no desenho",
  "UC-PROC-01": "Metodos de trabalho complexos",
  "UC-PROC-02": "Falta de procedimento normalizado e/ou regras de seguranca",
  "UC-PROC-03": "Outros",
  "UC-PROC-04": "Procedimento inadequado",
  "UC-PROC-05": "Itens de protecao inadequados",
};

const PT_UNSAFE_ACT_CATEGORY_LABELS: Record<string, string> = {
  "COMPETENCE / KNOWLEDGE": "COMPETENCIA / CONHECIMENTO",
  "ATTITUDE / BEHAVIOR": "ATITUDE / COMPORTAMENTO",
  MANAGEMENT: "GESTAO",
  PRECAUTION: "PRECAUCAO",
  "PERSONAL CONDITION": "CONDICAO PESSOAL",
};

const PT_UNSAFE_ACT_NAME_BY_CODE: Record<string, string> = {
  "UA-COMP-01": "Formacao inadequada",
  "UA-COMP-02": "Experiencia limitada na tarefa especifica",
  "UA-ATT-01": "Falta de concentracao",
  "UA-ATT-02": "Utilizacao incorreta de itens de protecao",
  "UA-ATT-03": "Quebra de regras de seguranca",
  "UA-ATT-04": "Incumprimento de ciclos de trabalho e procedimentos",
  "UA-ATT-05": "Circunstancias duvidosas",
  "UA-ATT-06": "Nao utilizacao de EPI",
  "UA-MGT-01": "EPI inadequado",
  "UA-MGT-02": "Inaptidao para a funcao",
  "UA-MGT-03": "Ciclos de manutencao nao realizados",
  "UA-MGT-04": "Ciclos de limpeza nao realizados",
  "UA-MGT-05": "Pressao",
  "UA-MGT-06": "Outro",
  "UA-PREC-01": "Excesso de autoconfianca",
  "UA-PREC-02": "Execucao de operacoes fora da sua competencia",
  "UA-PREC-03": "Falta de comunicacao",
  "UA-PERS-01": "Problemas fisicos",
  "UA-PERS-02": "Fadiga fisica",
  "UA-PERS-03": "Mal-estar repentino",
  "UA-PERS-04": "Problemas pessoais / familiares",
  "UA-PERS-05": "Problemas de saude",
};

const PT_NEAR_MISS_NAME_BY_CODE: Record<string, string> = {
  NMT01: "Operacoes de elevacao",
  NMT02: "Seguranca no transporte",
  NMT03: "Bloqueio / Etiquetagem (LOTO)",
  NMT04: "Trabalhos em altura",
  NMT05: "Seguranca de maquinas",
  NMT06: "Espaco confinado",
  NMT07: "Libertacao de energia",
  NMT08: "Nenhum",
};

const PT_PROFESSIONAL_RISK_CATEGORY_LABELS: Record<string, string> = {
  Mechanical: "Mecanico",
  Electrical: "Eletrico",
  Chemical: "Quimico",
  Ergonomic: "Ergonomico",
  Environmental: "Ambiental",
  "Work Activity": "Atividade de trabalho",
  "Fire & Explosion": "Incendio e explosao",
  "Biological & Psychosocial": "Biologico e psicossocial",
};

export function getFixedLocalizedCatalogName(
  code: string | null | undefined,
  locale: string,
) {
  if (!code) return null;
  if (locale !== "pt") return null;

  return (
    PT_UNSAFE_CONDITION_NAME_BY_CODE[code] ??
    PT_UNSAFE_ACT_NAME_BY_CODE[code] ??
    PT_NEAR_MISS_NAME_BY_CODE[code] ??
    null
  );
}

export function getFixedLocalizedCatalogCategory(
  category: string | null | undefined,
  locale: string,
) {
  if (!category) return null;
  if (locale !== "pt") return null;

  return (
    PT_UNSAFE_CONDITION_CATEGORY_LABELS[category] ??
    PT_UNSAFE_ACT_CATEGORY_LABELS[category] ??
    PT_PROFESSIONAL_RISK_CATEGORY_LABELS[category] ??
    null
  );
}
