export type DefaultProfessionalRisk = {
  code: string;
  category: string;
  name: string;
};

const PROFESSIONAL_RISK_GROUPS: Array<{
  prefix: string;
  category: string;
  items: string[];
}> = [
  {
    prefix: "MEC",
    category: "Mechanical",
    items: [
      "Esmagamento",
      "Corte por máquina",
      "Aprisionamento entre equipamentos",
      "Aprisionamento de mãos/dedos",
      "Arrastamento por partes móveis",
      "Projeção de partículas",
      "Rotura de ferramenta",
      "Falta de proteção de máquina",
      "Batida contra objetos fixos",
      "Batida contra objetos móveis",
      "Desabamento de carga",
      "Queda de objetos",
      "Queda de materiais",
      "Colapso de estruturas",
      "Contacto com superfícies quentes",
    ],
  },
  {
    prefix: "ELE",
    category: "Electrical",
    items: [
      "Choque elétrico",
      "Fuga de ar comprimido",
    ],
  },
  {
    prefix: "CHE",
    category: "Chemical",
    items: [
      "Derrame químico",
      "Inalação de vapores",
      "Contacto com substâncias químicas",
      "Exposição a gases",
      "Exposição a fumos",
      "Exposição a poeiras",
      "Atmosfera perigosa",
      "Queimadura química",
    ],
  },
  {
    prefix: "ERG",
    category: "Ergonomic",
    items: [
      "Postura inadequada",
      "Movimentação manual de cargas",
      "Sobrecarga física",
      "Fadiga física",
      "Exposição a vibrações",
      "Risco ergonómico",
    ],
  },
  {
    prefix: "ENV",
    category: "Environmental",
    items: [
      "Pavimento escorregadio",
      "Pavimento irregular",
      "Falha de iluminação",
      "Ventilação insuficiente",
      "Temperaturas extremas",
      "Stress térmico",
      "Exposição a ruído elevado",
      "Visibilidade reduzida",
      "Queda ao mesmo nível",
    ],
  },
  {
    prefix: "WAC",
    category: "Work Activity",
    items: [
      "Trabalhos em altura",
      "Trabalhos a quente",
      "Trabalhos em espaço confinado",
      "Soldadura / radiação UV",
      "Utilização incorreta de EPI",
      "Utilização de ferramenta defeituosa",
      "Trânsito industrial",
      "Choque com veículos industriais",
      "Atropelamento por empilhador",
    ],
  },
  {
    prefix: "FEX",
    category: "Fire & Explosion",
    items: [
      "Incêndio",
      "Explosão",
      "Queimadura termica",
    ],
  },
  {
    prefix: "BIO",
    category: "Biological & Psychosocial",
    items: [
      "Risco biológico",
      "Risco psicossocial",
    ],
  },
];

export const DEFAULT_PROFESSIONAL_RISKS: DefaultProfessionalRisk[] = PROFESSIONAL_RISK_GROUPS.flatMap((group) =>
  [...group.items]
    .sort((left, right) => left.localeCompare(right))
    .map((name, index) => ({
      code: `PR-${group.prefix}-${String(index + 1).padStart(3, "0")}`,
      category: group.category,
      name,
    })),
);

export const DEFAULT_PROFESSIONAL_RISK_CATEGORIES = PROFESSIONAL_RISK_GROUPS.map((group) => group.category);
