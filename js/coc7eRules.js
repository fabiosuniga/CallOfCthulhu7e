// ============================================================================
// MOTOR DE REGRAS OFICIAL — CHAMADO DE CTHULHU 7ª EDIÇÃO (coc7eRules.js)
// Baseado em: regras/regras_criacao_investigadores_coc7e.pdf
//             regras/FICHA-EDITAVEL-CHAMADO-DE-CTHULHU.pdf
// ============================================================================

// 1. ATRIBUTOS PRIMÁRIOS E FÓRMULAS DE DADOS
export const PRIMARY_CHARACTERISTICS = [
  { key: "str", sigla: "FOR", name: "Força", formula: "3D6x5", desc: "Músculos, capacidade física e peso que consegue levantar." },
  { key: "con", sigla: "CON", name: "Constituição", formula: "3D6x5", desc: "Saúde, vigor, vitalidade e resistência a doenças e venenos." },
  { key: "siz", sigla: "TAM", name: "Tamanho", formula: "2D6+6x5", desc: "Altura e peso corporal. Usado para calcular PV e Dano Extra." },
  { key: "dex", sigla: "DES", name: "Destreza", formula: "3D6x5", desc: "Agilidade, reflexos e coordenação motora. Ordem de combate." },
  { key: "app", sigla: "APA", name: "Aparência", formula: "3D6x5", desc: "Atratividade física, charme e primeira impressão social." },
  { key: "int", sigla: "INT", name: "Inteligência (Ideia)", formula: "2D6+6x5", desc: "Raciocínio, memória e aprendizado (Gera Interesses Pessoais)." },
  { key: "pow", sigla: "POD", name: "Poder", formula: "3D6x5", desc: "Força de vontade, estabilidade espiritual e magia (Gera Sanidade)." },
  { key: "edu", sigla: "EDU", name: "Educação (Saber)", formula: "2D6+6x5", desc: "Conhecimento formal acumulado. Define Língua Natural e pontos." }
];

// 2. FUNÇÕES DE ROLAGEM DE DADOS E FRAÇÕES
export function rollDie(sides) {
  return Math.floor(Math.random() * sides) + 1;
}

export function rollDiceSum(count, sides) {
  const rolls = [];
  for (let i = 0; i < count; i++) {
    rolls.push(rollDie(sides));
  }
  return {
    rolls,
    sum: rolls.reduce((a, b) => a + b, 0)
  };
}

export function rollCharacteristic(formula) {
  if (formula === "2D6+6x5") {
    const r = rollDiceSum(2, 6);
    return {
      value: (r.sum + 6) * 5,
      detail: `(${r.rolls.join(" + ")} + 6) × 5 = ${(r.sum + 6) * 5}`
    };
  }
  const r = rollDiceSum(3, 6);
  return {
    value: r.sum * 5,
    detail: `(${r.rolls.join(" + ")}) × 5 = ${r.sum * 5}`
  };
}

export function calcFractions(value) {
  const v = Math.max(0, Math.min(99, Number(value) || 0));
  return {
    total: v,
    half: Math.floor(v / 2),
    fifth: Math.floor(v / 5)
  };
}

// 3. TABELA DE MODIFICADORES POR FAIXA ETÁRIA (15 A 90 ANOS)
export const AGE_BRACKETS = [
  {
    id: "15-19",
    min: 15,
    max: 19,
    label: "15 a 19 anos (Jovem)",
    eduChecks: 0,
    eduFixedPenalty: 5,
    physicalPenaltyTotal: 5,
    physicalTargets: ["str", "siz"],
    physicalTargetLabels: "FOR e TAM",
    appPenalty: 0,
    movPenalty: 0,
    doubleLuckRoll: true,
    summary: "Reduz 5 de EDU; reduz 5 pts distribuídos entre FOR e TAM; jogue Sorte 2x e mantenha o maior."
  },
  {
    id: "20-39",
    min: 20,
    max: 39,
    label: "20 a 39 anos (Adulto)",
    eduChecks: 1,
    eduFixedPenalty: 0,
    physicalPenaltyTotal: 0,
    physicalTargets: [],
    physicalTargetLabels: "Nenhum",
    appPenalty: 0,
    movPenalty: 0,
    doubleLuckRoll: false,
    summary: "1 Verificação de melhoria em EDU; nenhum ajuste físico; Sorte normal."
  },
  {
    id: "40-49",
    min: 40,
    max: 49,
    label: "40 a 49 anos (Meia-idade)",
    eduChecks: 2,
    eduFixedPenalty: 0,
    physicalPenaltyTotal: 5,
    physicalTargets: ["str", "con", "dex"],
    physicalTargetLabels: "FOR, CON e DES",
    appPenalty: 5,
    movPenalty: 1,
    doubleLuckRoll: false,
    summary: "2 Verificações de EDU; reduz 5 pts entre FOR/CON/DES; reduz APA em 5; reduz MOV em 1."
  },
  {
    id: "50-59",
    min: 50,
    max: 59,
    label: "50 a 59 anos",
    eduChecks: 3,
    eduFixedPenalty: 0,
    physicalPenaltyTotal: 10,
    physicalTargets: ["str", "con", "dex"],
    physicalTargetLabels: "FOR, CON e DES",
    appPenalty: 10,
    movPenalty: 2,
    doubleLuckRoll: false,
    summary: "3 Verificações de EDU; reduz 10 pts entre FOR/CON/DES; reduz APA em 10; reduz MOV em 2."
  },
  {
    id: "60-69",
    min: 60,
    max: 69,
    label: "60 a 69 anos",
    eduChecks: 4,
    eduFixedPenalty: 0,
    physicalPenaltyTotal: 20,
    physicalTargets: ["str", "con", "dex"],
    physicalTargetLabels: "FOR, CON e DES",
    appPenalty: 15,
    movPenalty: 3,
    doubleLuckRoll: false,
    summary: "4 Verificações de EDU; reduz 20 pts entre FOR/CON/DES; reduz APA em 15; reduz MOV em 3."
  },
  {
    id: "70-79",
    min: 70,
    max: 79,
    label: "70 a 79 anos",
    eduChecks: 4,
    eduFixedPenalty: 0,
    physicalPenaltyTotal: 40,
    physicalTargets: ["str", "con", "dex"],
    physicalTargetLabels: "FOR, CON e DES",
    appPenalty: 20,
    movPenalty: 4,
    doubleLuckRoll: false,
    summary: "4 Verificações de EDU; reduz 40 pts entre FOR/CON/DES; reduz APA em 20; reduz MOV em 4."
  },
  {
    id: "80-90",
    min: 80,
    max: 90,
    label: "80 a 90 anos",
    eduChecks: 4,
    eduFixedPenalty: 0,
    physicalPenaltyTotal: 80,
    physicalTargets: ["str", "con", "dex"],
    physicalTargetLabels: "FOR, CON e DES",
    appPenalty: 25,
    movPenalty: 5,
    doubleLuckRoll: false,
    summary: "4 Verificações de EDU; reduz 80 pts entre FOR/CON/DES; reduz APA em 25; reduz MOV em 5."
  }
];

export function getAgeBracket(age) {
  const n = Math.max(15, Math.min(90, Number(age) || 25));
  return AGE_BRACKETS.find((b) => n >= b.min && n <= b.max) || AGE_BRACKETS[1];
}

export function performEduImprovementChecks(initialEdu, numChecks) {
  let currentEdu = Math.max(0, Math.min(99, Number(initialEdu) || 0));
  const logs = [];
  for (let i = 1; i <= numChecks; i++) {
    const d100 = rollDie(100);
    if (d100 > currentEdu) {
      const gain = rollDie(10);
      const before = currentEdu;
      currentEdu = Math.min(99, currentEdu + gain);
      logs.push(`Verificação ${i}: D100 = ${d100} (> ${before}) → Sucesso! +${gain} EDU (${before} → ${currentEdu})`);
    } else {
      logs.push(`Verificação ${i}: D100 = ${d100} (≤ ${currentEdu}) → Sem melhoria.`);
    }
  }
  return { finalEdu: currentEdu, logs };
}

// 4. ATRIBUTOS DERIVADOS (PV, SAN, PM, MOV, DANO EXTRA E CORPO)
export function calcDamageBonusAndBuild(str, siz) {
  const sum = (Number(str) || 0) + (Number(siz) || 0);
  if (sum <= 64) return { damage_bonus: "-2", build: -2, sum };
  if (sum <= 84) return { damage_bonus: "-1", build: -1, sum };
  if (sum <= 124) return { damage_bonus: "0", build: 0, sum };
  if (sum <= 164) return { damage_bonus: "+1D4", build: 1, sum };
  if (sum <= 204) return { damage_bonus: "+1D6", build: 2, sum };
  if (sum <= 284) return { damage_bonus: "+2D6", build: 3, sum };
  if (sum <= 364) return { damage_bonus: "+3D6", build: 4, sum };
  if (sum <= 444) return { damage_bonus: "+4D6", build: 5, sum };
  return { damage_bonus: "+5D6", build: 6, sum };
}

export function calcDerivedAttributes(chars, age = 25, cthulhuMythosValue = 0) {
  const str = Number(chars.str) || 0;
  const con = Number(chars.con) || 0;
  const siz = Number(chars.siz) || 0;
  const dex = Number(chars.dex) || 0;
  const pow = Number(chars.pow) || 0;

  const max_hp = Math.max(1, Math.floor((con + siz) / 10));
  const starting_sanity = Math.min(99, pow);
  const max_sanity = Math.max(0, 99 - (Number(cthulhuMythosValue) || 0));
  const max_mp = Math.floor(pow / 5);

  let baseMov = 8;
  if (dex < siz && str < siz) {
    baseMov = 7;
  } else if (str > siz && dex > siz) {
    baseMov = 9;
  } else {
    baseMov = 8;
  }

  const bracket = getAgeBracket(age);
  const mov = Math.max(1, baseMov - bracket.movPenalty);
  const { damage_bonus, build } = calcDamageBonusAndBuild(str, siz);

  return {
    hp: max_hp,
    max_hp,
    mp: max_mp,
    max_mp,
    sanity: Math.min(starting_sanity, max_sanity),
    starting_sanity,
    max_sanity,
    mov,
    build,
    damage_bonus,
    dodge_base: Math.floor(dex / 2),
    language_own_base: Number(chars.edu) || 0
  };
}

// 5. CATÁLOGO OFICIAL DAS 46 PERÍCIAS DA FICHA EDITÁVEL
export const SKILLS_CATALOG = [
  { id: "anthropology", name: "Antropologia", base_value: 1, is_dynamic_base: false, allows_specialization: false, is_interpersonal: false },
  { id: "firearms_handgun", name: "Armas de Fogo (Pistolas)", base_value: 20, is_dynamic_base: false, allows_specialization: false, is_interpersonal: false },
  { id: "firearms_rifle", name: "Armas de Fogo (Rifles)", base_value: 25, is_dynamic_base: false, allows_specialization: false, is_interpersonal: false },
  { id: "archaeology", name: "Arqueologia", base_value: 1, is_dynamic_base: false, allows_specialization: false, is_interpersonal: false },
  { id: "throw", name: "Arremessar", base_value: 20, is_dynamic_base: false, allows_specialization: false, is_interpersonal: false },
  { id: "art_craft", name: "Arte/Ofício", base_value: 5, is_dynamic_base: false, allows_specialization: true, is_interpersonal: false },
  { id: "appraise", name: "Avaliação", base_value: 5, is_dynamic_base: false, allows_specialization: false, is_interpersonal: false },
  { id: "ride", name: "Cavalgar", base_value: 5, is_dynamic_base: false, allows_specialization: false, is_interpersonal: false },
  { id: "charm", name: "Charme", base_value: 15, is_dynamic_base: false, allows_specialization: false, is_interpersonal: true },
  { id: "locksmith", name: "Chaveiro", base_value: 1, is_dynamic_base: false, allows_specialization: false, is_interpersonal: false },
  { id: "science", name: "Ciência", base_value: 1, is_dynamic_base: false, allows_specialization: true, is_interpersonal: false },
  { id: "electrical_repair", name: "Consertos Elétricos", base_value: 10, is_dynamic_base: false, allows_specialization: false, is_interpersonal: false },
  { id: "mechanical_repair", name: "Consertos Mecânicos", base_value: 10, is_dynamic_base: false, allows_specialization: false, is_interpersonal: false },
  { id: "accounting", name: "Contabilidade", base_value: 5, is_dynamic_base: false, allows_specialization: false, is_interpersonal: false },
  { id: "law", name: "Direito", base_value: 5, is_dynamic_base: false, allows_specialization: false, is_interpersonal: false },
  { id: "drive_auto", name: "Dirigir Auto", base_value: 20, is_dynamic_base: false, allows_specialization: false, is_interpersonal: false },
  { id: "disguise", name: "Disfarce", base_value: 5, is_dynamic_base: false, allows_specialization: false, is_interpersonal: false },
  { id: "spot_hidden", name: "Encontrar", base_value: 25, is_dynamic_base: false, allows_specialization: false, is_interpersonal: false },
  { id: "listen", name: "Escutar", base_value: 20, is_dynamic_base: false, allows_specialization: false, is_interpersonal: false },
  { id: "climb", name: "Escalar", base_value: 20, is_dynamic_base: false, allows_specialization: false, is_interpersonal: false },
  { id: "dodge", name: "Esquivar", base_value: 0, is_dynamic_base: true, dynamic_formula: "HALF_DEX", allows_specialization: false, is_interpersonal: false },
  { id: "fast_talk", name: "Lábia", base_value: 5, is_dynamic_base: false, allows_specialization: false, is_interpersonal: true },
  { id: "intimidate", name: "Intimidação", base_value: 15, is_dynamic_base: false, allows_specialization: false, is_interpersonal: true },
  { id: "history", name: "História", base_value: 5, is_dynamic_base: false, allows_specialization: false, is_interpersonal: false },
  { id: "stealth", name: "Furtividade", base_value: 20, is_dynamic_base: false, allows_specialization: false, is_interpersonal: false },
  { id: "language_own", name: "Língua Natural", base_value: 0, is_dynamic_base: true, dynamic_formula: "EDU", allows_specialization: false, is_interpersonal: false },
  { id: "language_other", name: "Língua [Outra]", base_value: 1, is_dynamic_base: false, allows_specialization: true, is_interpersonal: false },
  { id: "fighting_brawl", name: "Lutar (Brigar)", base_value: 25, is_dynamic_base: false, allows_specialization: true, is_interpersonal: false },
  { id: "medicine", name: "Medicina", base_value: 1, is_dynamic_base: false, allows_specialization: false, is_interpersonal: false },
  { id: "cthulhu_mythos", name: "Mythos de Cthulhu", base_value: 0, is_dynamic_base: false, allows_specialization: false, is_interpersonal: false, locked_on_creation: true },
  { id: "natural_world", name: "Mundo Natural", base_value: 10, is_dynamic_base: false, allows_specialization: false, is_interpersonal: false },
  { id: "swim", name: "Natação", base_value: 20, is_dynamic_base: false, allows_specialization: false, is_interpersonal: false },
  { id: "navigate", name: "Navegação", base_value: 10, is_dynamic_base: false, allows_specialization: false, is_interpersonal: false },
  { id: "credit_rating", name: "Nível de Crédito", base_value: 0, is_dynamic_base: false, allows_specialization: false, is_interpersonal: false },
  { id: "occult", name: "Ocultismo", base_value: 5, is_dynamic_base: false, allows_specialization: false, is_interpersonal: false },
  { id: "operate_heavy_machinery", name: "Operar Maquinário", base_value: 1, is_dynamic_base: false, allows_specialization: false, is_interpersonal: false },
  { id: "persuade", name: "Persuasão", base_value: 10, is_dynamic_base: false, allows_specialization: false, is_interpersonal: true },
  { id: "pilot", name: "Pilotar", base_value: 1, is_dynamic_base: false, allows_specialization: true, is_interpersonal: false },
  { id: "sleight_of_hand", name: "Prestidigitação", base_value: 10, is_dynamic_base: false, allows_specialization: false, is_interpersonal: false },
  { id: "first_aid", name: "Primeiros Socorros", base_value: 30, is_dynamic_base: false, allows_specialization: false, is_interpersonal: false },
  { id: "psychoanalysis", name: "Psicanálise", base_value: 1, is_dynamic_base: false, allows_specialization: false, is_interpersonal: false },
  { id: "psychology", name: "Psicologia", base_value: 10, is_dynamic_base: false, allows_specialization: false, is_interpersonal: false },
  { id: "jump", name: "Saltar", base_value: 20, is_dynamic_base: false, allows_specialization: false, is_interpersonal: false },
  { id: "track", name: "Rastrear", base_value: 10, is_dynamic_base: false, allows_specialization: false, is_interpersonal: false },
  { id: "survival", name: "Sobrevivência", base_value: 10, is_dynamic_base: false, allows_specialization: true, is_interpersonal: false },
  { id: "library_use", name: "Usar Biblioteca", base_value: 20, is_dynamic_base: false, allows_specialization: false, is_interpersonal: false }
];

export function getSkillBaseValue(skillDef, chars) {
  if (skillDef.dynamic_formula === "HALF_DEX") {
    return Math.floor((Number(chars.dex) || 0) / 2);
  }
  if (skillDef.dynamic_formula === "EDU") {
    return Number(chars.edu) || 0;
  }
  return skillDef.base_value;
}

// 6. OCUPAÇÕES OFICIAIS E CÁLCULO DE PONTOS OCUPACIONAIS
export const OCCUPATIONS_CATALOG = [
  {
    id: "antiquarian",
    name: "Antiquário",
    formula_label: "EDU × 4",
    points_formula: "EDU * 4",
    credit_min: 30,
    credit_max: 70,
    description: "Conhecedor de relíquias históricas, obras raras e objetos arcanos esquecidos pelo tempo.",
    skills_description: "Avaliação, Arte/Ofício, História, Usar Biblioteca, Língua [Outra], Encontrar, 1 Interpessoal (Charme/Lábia/Intimidação/Persuasão) + 1 perícia à escolha.",
    fixed_skills: ["appraise", "art_craft", "history", "library_use", "language_other", "spot_hidden"],
    interpersonal_slots: 1,
    free_slots: 1
  },
  {
    id: "private_investigator",
    name: "Detetive Particular",
    formula_label: "EDU × 2 + (DES × 2 ou FOR × 2)",
    points_formula: "EDU * 2 + MAX(DEX, STR) * 2",
    credit_min: 9,
    credit_max: 30,
    description: "Investigador autônomo acostumado a seguir pistas em becos escuros, fotografar suspeitos e lidar com a lei.",
    skills_description: "Arte/Ofício (Fotografia), Direito, Disfarce, Encontrar, Psicologia, Usar Biblioteca, 1 Interpessoal + 1 perícia à escolha.",
    fixed_skills: ["art_craft", "law", "disguise", "spot_hidden", "psychology", "library_use"],
    interpersonal_slots: 1,
    free_slots: 1
  },
  {
    id: "dilettante",
    name: "Diletante",
    formula_label: "EDU × 2 + APA × 2",
    points_formula: "EDU * 2 + APP * 2",
    credit_min: 50,
    credit_max: 99,
    description: "Membro da elite abastada que dedica o tempo a viagens exóticas, coleções e círculos exclusivos.",
    skills_description: "Armas de Fogo (Pistolas ou Rifles), Arte/Ofício, Cavalgar, Língua [Outra], 1 Interpessoal + 3 perícias à escolha.",
    fixed_skills: ["firearms_handgun", "art_craft", "ride", "language_other"],
    interpersonal_slots: 1,
    free_slots: 3
  },
  {
    id: "journalist",
    name: "Jornalista",
    formula_label: "EDU × 4",
    points_formula: "EDU * 4",
    credit_min: 9,
    credit_max: 30,
    description: "Repórter ou editor investigativo sempre no rastro de acontecimentos inexplicáveis e conspirações locais.",
    skills_description: "Arte/Ofício (Fotografia/Redação), História, Língua Natural, Psicologia, Usar Biblioteca, 1 Interpessoal + 2 perícias à escolha.",
    fixed_skills: ["art_craft", "history", "language_own", "psychology", "library_use"],
    interpersonal_slots: 1,
    free_slots: 2
  },
  {
    id: "physician",
    name: "Médico",
    formula_label: "EDU × 4",
    points_formula: "EDU * 4",
    credit_min: 30,
    credit_max: 80,
    description: "Doutor em medicina, cirurgião ou legista acostumado à fronteira tênue entre a vida e a morte.",
    skills_description: "Ciência (Biologia/Farmácia), Medicina, Língua [Outra] (Latim), Primeiros Socorros, Psicologia, Psicanálise + 2 perícias à escolha.",
    fixed_skills: ["science", "medicine", "language_other", "first_aid", "psychology", "psychoanalysis"],
    interpersonal_slots: 0,
    free_slots: 2
  },
  {
    id: "police_detective",
    name: "Policial / Investigador",
    formula_label: "EDU × 2 + (DES × 2 ou FOR × 2)",
    points_formula: "EDU * 2 + MAX(DEX, STR) * 2",
    credit_min: 20,
    credit_max: 50,
    description: "Oficial ou detetive de polícia com treinamento em cena de crime, armas de fogo e interrogatório.",
    skills_description: "Armas de Fogo (Pistolas), Direito, Escutar, Psicologia, Encontrar, Disfarce, 1 Interpessoal + 1 perícia à escolha.",
    fixed_skills: ["firearms_handgun", "law", "listen", "psychology", "spot_hidden", "disguise"],
    interpersonal_slots: 1,
    free_slots: 1
  },
  {
    id: "professor",
    name: "Professor Universitário",
    formula_label: "EDU × 4",
    points_formula: "EDU * 4",
    credit_min: 20,
    credit_max: 70,
    description: "Erudito e pesquisador universitário (como na Universidade Miskatonic), versado em ciências e arquivos antigos.",
    skills_description: "Usar Biblioteca, Língua [Outra], Língua Natural, Psicologia + 4 perícias acadêmicas ou à escolha.",
    fixed_skills: ["library_use", "language_other", "language_own", "psychology"],
    interpersonal_slots: 0,
    free_slots: 4
  },
  {
    id: "occultist",
    name: "Ocultista",
    formula_label: "EDU × 4",
    points_formula: "EDU * 4",
    credit_min: 9,
    credit_max: 65,
    description: "Estudioso de grimórios, astrologia, sociedades herméticas e folclore sobrenatural.",
    skills_description: "Antropologia, História, Usar Biblioteca, Ocultismo, Língua [Outra], Ciência (Astronomia), 1 Interpessoal + 1 à escolha.",
    fixed_skills: ["anthropology", "history", "library_use", "occult", "language_other", "science"],
    interpersonal_slots: 1,
    free_slots: 1
  }
];

export function calcOccupationPoints(formula, chars) {
  const edu = Number(chars.edu) || 0;
  const dex = Number(chars.dex) || 0;
  const str = Number(chars.str) || 0;
  const app = Number(chars.app) || 0;

  if (formula === "EDU * 2 + MAX(DEX, STR) * 2") {
    return edu * 2 + Math.max(dex, str) * 2;
  }
  if (formula === "EDU * 2 + APP * 2") {
    return edu * 2 + app * 2;
  }
  return edu * 4;
}

export function calcPersonalPoints(chars) {
  return (Number(chars.int) || 0) * 2;
}

// 7. TABELA DE FINANÇAS E PODER DE COMPRA (1920 & MODERNO)
export function calcFinances(creditRating, era = "1920") {
  const nc = Math.max(0, Math.min(99, Number(creditRating) || 0));
  const isModern = era === "modern";

  const fmtUSD = (val) => {
    if (val >= 1000) {
      return "$" + val.toLocaleString("en-US", { maximumFractionDigits: 0 });
    }
    if (Number.isInteger(val)) {
      return "$" + val;
    }
    return "$" + val.toFixed(2);
  };

  if (nc <= 0) {
    return {
      credit_rating: nc,
      economic_class: "Pobretão (NC 0)",
      cash: isModern ? "$10" : "$0.50",
      assets: "Nenhum",
      spending_level: isModern ? "$10" : "$0.50"
    };
  }
  if (nc <= 9) {
    return {
      credit_rating: nc,
      economic_class: "Pobre (NC 1 a 9)",
      cash: isModern ? fmtUSD(nc * 20) : fmtUSD(nc * 1),
      assets: isModern ? fmtUSD(nc * 200) : fmtUSD(nc * 10),
      spending_level: isModern ? "$40" : "$2"
    };
  }
  if (nc <= 49) {
    return {
      credit_rating: nc,
      economic_class: "Médio (NC 10 a 49)",
      cash: isModern ? fmtUSD(nc * 40) : fmtUSD(nc * 2),
      assets: isModern ? fmtUSD(nc * 1000) : fmtUSD(nc * 50),
      spending_level: isModern ? "$200" : "$10"
    };
  }
  if (nc <= 89) {
    return {
      credit_rating: nc,
      economic_class: "Abastado (NC 50 a 89)",
      cash: isModern ? fmtUSD(nc * 100) : fmtUSD(nc * 5),
      assets: isModern ? fmtUSD(nc * 10000) : fmtUSD(nc * 500),
      spending_level: isModern ? "$1.000" : "$50"
    };
  }
  if (nc <= 98) {
    return {
      credit_rating: nc,
      economic_class: "Rico (NC 90 a 98)",
      cash: isModern ? fmtUSD(nc * 400) : fmtUSD(nc * 20),
      assets: isModern ? fmtUSD(nc * 40000) : fmtUSD(nc * 2000),
      spending_level: isModern ? "$5.000" : "$250"
    };
  }
  return {
    credit_rating: nc,
    economic_class: "Ricaço (NC 99+)",
    cash: isModern ? "$1.000.000" : "$50.000",
    assets: isModern ? "$100.000.000+" : "$5.000.000+",
    spending_level: isModern ? "$100.000" : "$5.000"
  };
}

// 8. AS 10 CATEGORIAS DE ANTECEDENTES DO VERSO DA FICHA
export const BACKSTORY_CATEGORIES = [
  {
    id: "personal_description",
    number: 1,
    title: "Descrição Pessoal",
    creationGroup: true,
    canBeKeyConnection: false,
    placeholder: "Aspectos visuais, porte físico, olhar, estilo de vestimenta anos 1920..."
  },
  {
    id: "ideology_beliefs",
    number: 2,
    title: "Ideologias / Crenças",
    creationGroup: true,
    canBeKeyConnection: true,
    placeholder: "Valores filosóficos, fé religiosa, ceticismo científico, visão política..."
  },
  {
    id: "significant_people",
    number: 3,
    title: "Pessoas Significativas",
    creationGroup: true,
    canBeKeyConnection: true,
    placeholder: "Quem é a pessoa mais importante (mentor, familiar, antigo amor) e por quê?"
  },
  {
    id: "meaningful_locations",
    number: 4,
    title: "Locais Importantes",
    creationGroup: true,
    canBeKeyConnection: true,
    placeholder: "Biblioteca da universidade, casa de infância, clube antigo, santuário..."
  },
  {
    id: "treasured_possessions",
    number: 5,
    title: "Pertences Queridos",
    creationGroup: true,
    canBeKeyConnection: true,
    placeholder: "Relógio de bolso herdado, diário encadernado, amuleto, câmera antiga..."
  },
  {
    id: "traits",
    number: 6,
    title: "Características Marcantes",
    creationGroup: true,
    canBeKeyConnection: false,
    placeholder: "Hábitos, maneirismos, vícios, virtudes ou traços de personalidade..."
  },
  {
    id: "injuries_scars",
    number: 7,
    title: "Ferimentos e Cicatrizes",
    creationGroup: false,
    canBeKeyConnection: false,
    placeholder: "Preenchido durante o jogo: marcas físicas sofridas em investigações."
  },
  {
    id: "phobias_manias",
    number: 8,
    title: "Fobias e Manias",
    creationGroup: false,
    canBeKeyConnection: false,
    placeholder: "Preenchido durante o jogo: transtornos adquiridos por perda de Sanidade."
  },
  {
    id: "arcane_tomes_spells",
    number: 9,
    title: "Tomos Arcanos, Feitiços e Artefatos",
    creationGroup: false,
    canBeKeyConnection: false,
    placeholder: "Preenchido durante o jogo: conhecimento oculto e objetos místico-arcanos."
  },
  {
    id: "strange_entities",
    number: 10,
    title: "Encontros com Entidades Estranhas",
    creationGroup: false,
    canBeKeyConnection: false,
    placeholder: "Preenchido durante o jogo: registro de horrores do Mythos testemunhados."
  }
];

// 9. AVALIADOR DE TESTE 1D100 (NÍVEIS DE SUCESSO DA FICHA)
export function evaluateD100Roll(targetValue, rollResult = null) {
  const target = Math.max(0, Math.min(99, Number(targetValue) || 0));
  const half = Math.floor(target / 2);
  const fifth = Math.floor(target / 5);
  const roll = rollResult !== null ? rollResult : rollDie(100);

  const fumbleThreshold = target >= 50 ? 100 : 96;

  let level = "Fracasso";
  let code = "fail";

  if (roll === 1) {
    level = "Crítico (01)";
    code = "critical";
  } else if (roll >= fumbleThreshold) {
    level = "Desastre";
    code = "fumble";
  } else if (roll <= fifth) {
    level = "Sucesso Extremo (1/5)";
    code = "extreme";
  } else if (roll <= half) {
    level = "Sucesso Difícil (1/2)";
    code = "hard";
  } else if (roll <= target) {
    level = "Sucesso Regular";
    code = "regular";
  }

  return {
    roll,
    target,
    half,
    fifth,
    level,
    code,
    isSuccess: ["critical", "extreme", "hard", "regular"].includes(code)
  };
}

