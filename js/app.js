// ============================================================================
// APLICAÇÃO PRINCIPAL — CHAMADO DE CTHULHU 7ª EDIÇÃO (js/app.js)
// Fluxo Completo: Dashboard -> Wizard de 5 Etapas -> Ficha Editável (Frente/Verso)
// ============================================================================

import {
  getSupabaseConfig,
  saveSupabaseConfig,
  clearSupabaseConfig,
  isSupabaseConfigured
} from "./config.js";
import {
  initSupabase,
  getCurrentUser,
  signInWithEmail,
  signUpWithEmail,
  signOutUser,
  listInvestigators,
  getInvestigatorById,
  saveInvestigator,
  deleteInvestigator,
  syncLocalToSupabase,
  getLocalInvestigators
} from "./supabaseClient.js";
import {
  PRIMARY_CHARACTERISTICS,
  SKILLS_CATALOG,
  OCCUPATIONS_CATALOG,
  BACKSTORY_CATEGORIES,
  rollCharacteristic,
  calcFractions,
  getAgeBracket,
  performEduImprovementChecks,
  calcDerivedAttributes,
  getSkillBaseValue,
  calcOccupationPoints,
  calcPersonalPoints,
  calcFinances,
  evaluateD100Roll,
  rollDie
} from "./coc7eRules.js";

// ============================================================================
// ESTADO DA APLICAÇÃO
// ============================================================================
const state = {
  view: "dashboard", // 'dashboard' | 'wizard' | 'sheet'
  wizardStep: 1,
  sheetTab: "front", // 'front' | 'back'
  investigators: [],
  currentUser: null,
  draft: null,
  activeSheet: null
};

// Cria um rascunho em branco para o Wizard de 5 Etapas
function createBlankDraft() {
  const chars = {
    str: 50,
    con: 50,
    siz: 60,
    dex: 50,
    app: 50,
    int: 60,
    pow: 50,
    edu: 60,
    luck: 50,
    starting_luck: 50
  };
  const age = 28;
  const derived = calcDerivedAttributes(chars, age, 0);

  const skills = {};
  for (const sk of SKILLS_CATALOG) {
    skills[sk.id] = {
      skill_id: sk.id,
      specialization: "",
      base_value: getSkillBaseValue(sk, chars),
      occupation_points: 0,
      personal_points: 0,
      experience_points: 0,
      is_occupation_skill: false,
      checked_for_improvement: false
    };
  }

  const backstory = {};
  for (const cat of BACKSTORY_CATEGORIES) {
    backstory[cat.id] = {
      entry_text: "",
      is_key_connection: false
    };
  }

  return {
    id: null,
    name: "",
    player_name: "",
    age,
    gender: "",
    era: "1920",
    residence: "Arkham, MA",
    birthplace: "Boston, MA",
    occupation_id: "private_investigator",
    custom_occupation_name: "",
    selected_interpersonal: ["persuade"],
    selected_free_skills: ["firearms_handgun"],
    age_edu_checks_done: false,
    age_edu_logs: [],
    age_deductions: { str: 0, con: 0, dex: 0, siz: 0 },
    characteristics: chars,
    derived,
    skills,
    backstory,
    finances: calcFinances(0, "1920"),
    personal_equipment: "Lanterna de bolso, bloco de notas, lápis, relógio de bolso.",
    weapons: [
      {
        name: "Desarmado",
        skill_id: "fighting_brawl",
        regular_value: 25,
        damage: "1D3 + BD",
        range: "Toque",
        attacks_per_round: "1",
        ammo: "—",
        malfunction: "—"
      }
    ],
    fellow_investigators: [
      { character: "", player: "" },
      { character: "", player: "" },
      { character: "", player: "" },
      { character: "", player: "" }
    ]
  };
}

// Sincroniza bases dinâmicas (Esquivar, Língua Natural), Derivados e Finanças do Draft
function recalculateDraft(draft) {
  const c = draft.characteristics;
  const mythosTotal =
    (draft.skills?.cthulhu_mythos?.base_value || 0) +
    (draft.skills?.cthulhu_mythos?.experience_points || 0);

  draft.derived = {
    ...draft.derived,
    ...calcDerivedAttributes(c, draft.age, mythosTotal)
  };

  const occ =
    OCCUPATIONS_CATALOG.find((o) => o.id === draft.occupation_id) ||
    OCCUPATIONS_CATALOG[0];

  const occSkillSet = new Set([
    ...(occ.fixed_skills || []),
    ...(draft.selected_interpersonal || []),
    ...(draft.selected_free_skills || []),
    "credit_rating"
  ]);

  for (const sk of SKILLS_CATALOG) {
    const entry = draft.skills[sk.id];
    if (!entry) continue;
    entry.base_value = getSkillBaseValue(sk, c);
    entry.is_occupation_skill = occSkillSet.has(sk.id);
    if (!entry.is_occupation_skill && sk.id !== "credit_rating") {
      entry.occupation_points = 0;
    }
    if (sk.id === "cthulhu_mythos") {
      entry.occupation_points = 0;
      entry.personal_points = 0;
    }
  }

  const crSkill = draft.skills.credit_rating;
  const creditVal =
    (crSkill?.base_value || 0) +
    (crSkill?.occupation_points || 0) +
    (crSkill?.personal_points || 0);

  draft.finances = calcFinances(creditVal, draft.era);

  // Atualiza valor regular do ataque Desarmado conforme Lutar (Brigar)
  const brawl = draft.skills.fighting_brawl;
  const brawlTotal =
    (brawl?.base_value || 25) +
    (brawl?.occupation_points || 0) +
    (brawl?.personal_points || 0) +
    (brawl?.experience_points || 0);
  if (draft.weapons && draft.weapons[0] && draft.weapons[0].name === "Desarmado") {
    draft.weapons[0].regular_value = Math.min(99, brawlTotal);
  }
}

// ============================================================================
// INICIALIZAÇÃO E EVENTOS GLOBAIS
// ============================================================================
document.addEventListener("DOMContentLoaded", async () => {
  setupGlobalListeners();
  await refreshConnectionAndData();
});

async function refreshConnectionAndData() {
  await initSupabase();
  state.currentUser = await getCurrentUser();
  updateConnectionBadge();
  state.investigators = await listInvestigators();
  render();
}

function updateConnectionBadge() {
  const badge = document.getElementById("connectionBadge");
  const txt = document.getElementById("connectionText");
  const configured = isSupabaseConfigured();

  if (configured && state.currentUser) {
    badge.classList.add("connected");
    txt.textContent = `Supabase: ${state.currentUser.email}`;
  } else if (configured) {
    badge.classList.remove("connected");
    txt.textContent = "Supabase Configurado (Faça Login)";
  } else {
    badge.classList.remove("connected");
    txt.textContent = "Modo Local (Pronto p/ GitHub Pages)";
  }
}

function setupGlobalListeners() {
  document.getElementById("btnHomeBrand").addEventListener("click", async () => {
    state.view = "dashboard";
    state.investigators = await listInvestigators();
    render();
  });

  document.getElementById("btnNewInvestigatorTop").addEventListener("click", () => {
    startNewInvestigatorWizard();
  });

  document.getElementById("btnCloseDiceToast").addEventListener("click", () => {
    document.getElementById("diceToast").classList.add("hidden");
  });

  // Modal Supabase
  const dialog = document.getElementById("supabaseDialog");
  document.getElementById("btnOpenSupabaseModal").addEventListener("click", () => {
    const cfg = getSupabaseConfig();
    document.getElementById("inputSupabaseUrl").value = cfg.url || "";
    document.getElementById("inputSupabaseAnonKey").value = cfg.anonKey || "";
    refreshAuthModalState();
    dialog.showModal();
  });

  document.getElementById("btnCloseSupabaseModal").addEventListener("click", () => {
    dialog.close();
  });

  document.getElementById("btnSaveSupabaseCfg").addEventListener("click", async () => {
    const url = document.getElementById("inputSupabaseUrl").value;
    const key = document.getElementById("inputSupabaseAnonKey").value;
    saveSupabaseConfig(url, key);
    await refreshConnectionAndData();
    refreshAuthModalState();
    setAuthFeedback("Configuração do Supabase salva! Agora você pode entrar ou criar sua conta.", true);
  });

  document.getElementById("btnClearSupabaseCfg").addEventListener("click", async () => {
    clearSupabaseConfig();
    await refreshConnectionAndData();
    refreshAuthModalState();
    setAuthFeedback("Modo Local ativado.", true);
  });

  document.getElementById("btnSignIn").addEventListener("click", async () => {
    const email = document.getElementById("inputAuthEmail").value.trim();
    const pass = document.getElementById("inputAuthPassword").value;
    try {
      setAuthFeedback("Autenticando...", true);
      await signInWithEmail(email, pass);
      await refreshConnectionAndData();
      refreshAuthModalState();
      setAuthFeedback("Login realizado com sucesso!", true);
    } catch (err) {
      setAuthFeedback(err.message || "Erro ao fazer login.", false);
    }
  });

  document.getElementById("btnSignUp").addEventListener("click", async () => {
    const email = document.getElementById("inputAuthEmail").value.trim();
    const pass = document.getElementById("inputAuthPassword").value;
    try {
      setAuthFeedback("Criando conta no Supabase Auth...", true);
      await signUpWithEmail(email, pass);
      await refreshConnectionAndData();
      refreshAuthModalState();
      setAuthFeedback("Conta criada! Verifique seu e-mail (se confirmação estiver ativa) ou entre.", true);
    } catch (err) {
      setAuthFeedback(err.message || "Erro ao criar conta.", false);
    }
  });

  document.getElementById("btnSignOut").addEventListener("click", async () => {
    await signOutUser();
    await refreshConnectionAndData();
    refreshAuthModalState();
  });

  document.getElementById("btnSyncLocalSheets").addEventListener("click", async () => {
    try {
      const count = await syncLocalToSupabase();
      await refreshConnectionAndData();
      alert(`${count} ficha(s) sincronizada(s) com sucesso para o Supabase!`);
    } catch (err) {
      alert(err.message);
    }
  });
}

function setAuthFeedback(msg, isOk = false) {
  const el = document.getElementById("authFeedbackMsg");
  el.textContent = msg;
  el.style.color = isOk ? "var(--status-success)" : "var(--crimson-bright)";
}

function refreshAuthModalState() {
  const loggedIn = Boolean(state.currentUser);
  document.getElementById("authLoggedOutView").style.display = loggedIn ? "none" : "block";
  document.getElementById("authLoggedInView").style.display = loggedIn ? "block" : "none";
  if (loggedIn) {
    document.getElementById("authUserEmailDisplay").textContent = state.currentUser.email;
  }
}

export function triggerD100Toast(label, targetVal) {
  const res = evaluateD100Roll(targetVal);
  const toast = document.getElementById("diceToast");
  document.getElementById("diceToastTitle").textContent = `🎲 ${label}`;
  document.getElementById("diceToastTargets").textContent = `Regular: ${res.target}% | Difícil: ${res.half}% | Extremo: ${res.fifth}%`;
  document.getElementById("diceToastRoll").textContent = String(res.roll).padStart(2, "0");

  const badge = document.getElementById("diceToastBadge");
  badge.className = `roll-badge ${res.code}`;
  badge.textContent = res.level;

  toast.classList.remove("hidden");
}

function startNewInvestigatorWizard() {
  state.draft = createBlankDraft();
  recalculateDraft(state.draft);
  state.wizardStep = 1;
  state.view = "wizard";
  render();
}

// ============================================================================
// RENDERIZADOR PRINCIPAL
// ============================================================================
function render() {
  const root = document.getElementById("appRoot");
  if (state.view === "wizard") {
    renderWizard(root);
  } else if (state.view === "sheet" && state.activeSheet) {
    renderEditableSheet(root, state.activeSheet);
  } else {
    renderDashboard(root);
  }
}

// ============================================================================
// 1. VISÃO: DASHBOARD ("MEUS INVESTIGADORES")
// ============================================================================
function renderDashboard(root) {
  const localCount = getLocalInvestigators().length;
  const canSync = state.currentUser && localCount > 0;

  root.innerHTML = `
    <section class="ornate-panel">
      <div class="hero-header">
        <div>
          <h1 style="font-family:var(--font-display); font-size:1.55rem; letter-spacing:0.06em;">
            Arquivos da Sociedade de Investigadores
          </h1>
          <p style="color:var(--text-secondary); font-size:0.9rem; margin-top:0.25rem;">
            Crie investigadores seguindo rigorosamente as 5 etapas oficiais da 7ª Edição de Chamado de Cthulhu e gerencie suas fichas completas (Frente e Verso).
          </p>
        </div>
        <div style="display:flex; gap:0.65rem; flex-wrap:wrap;">
          ${
            canSync
              ? `<button type="button" class="btn btn-outline-crimson" id="btnDashSync">☁️ Sincronizar ${localCount} Ficha(s) Local p/ Supabase</button>`
              : ""
          }
          <button type="button" class="btn" id="btnCreateSample">⚡ Gerar Investigador Exemplo (Anos 1920)</button>
          <button type="button" class="btn btn-primary" id="btnDashNew">+ Criar Novo Investigador (5 Etapas)</button>
        </div>
      </div>

      <div class="section-banner">Fichas Registradas (${state.investigators.length})</div>

      ${
        state.investigators.length === 0
          ? `
        <div style="text-align:center; padding:2.5rem 1rem; color:var(--text-secondary);">
          <p style="font-size:1rem; margin-bottom:0.85rem;">Nenhum investigador registrado ainda.</p>
          <p style="font-size:0.84rem; color:var(--text-muted); max-width:540px; margin:0 auto 1.25rem;">
            Comece criando seu investigador passo a passo com validação de Atributos, Faixa Etária, Ocupação, 46 Perícias Oficiais, Conexão-Chave e Finanças.
          </p>
          <button type="button" class="btn btn-primary" id="btnEmptyCreate">Iniciar Criação (Etapa 1 de 5)</button>
        </div>
      `
          : `
        <div class="investigators-grid">
          ${state.investigators
            .map((inv) => {
              const occ = OCCUPATIONS_CATALOG.find((o) => o.id === inv.occupation_id);
              const occName = inv.custom_occupation_name || occ?.name || "Investigador";
              const d = inv.derived || {};
              const c = inv.characteristics || {};
              return `
              <article class="inv-card">
                <div>
                  <div class="inv-card-header">
                    <div>
                      <h3 class="inv-card-name">${escapeHtml(inv.name || "Sem Nome")}</h3>
                      <div class="inv-card-occ">${escapeHtml(occName)} • ${inv.age || 25} anos (${inv.era === "modern" ? "Era Moderna" : "Década de 1920"})</div>
                    </div>
                    <span style="font-size:0.7rem; padding:0.15rem 0.45rem; border-radius:4px; border:1px solid var(--border-ornate); color:var(--text-secondary);">
                      ${inv.storage === "supabase" ? "☁️ Supabase" : "💾 Local"}
                    </span>
                  </div>

                  <div class="inv-stat-pills" style="margin-top:0.85rem;">
                    <div class="stat-pill">
                      <div class="lbl">PV</div>
                      <div class="val" style="color:var(--status-hp);">${d.hp ?? d.max_hp ?? 10}/${d.max_hp ?? 10}</div>
                    </div>
                    <div class="stat-pill">
                      <div class="lbl">SAN</div>
                      <div class="val" style="color:var(--status-san);">${d.sanity ?? 50}/${d.max_sanity ?? 99}</div>
                    </div>
                    <div class="stat-pill">
                      <div class="lbl">Sorte</div>
                      <div class="val" style="color:var(--status-luck);">${c.luck ?? 50}%</div>
                    </div>
                    <div class="stat-pill">
                      <div class="lbl">PM</div>
                      <div class="val" style="color:var(--status-mp);">${d.mp ?? d.max_mp ?? 10}/${d.max_mp ?? 10}</div>
                    </div>
                  </div>
                </div>

                <div style="display:flex; justify-content:space-between; gap:0.5rem; padding-top:0.75rem; border-top:1px solid var(--border-subtle);">
                  <button type="button" class="btn btn-primary btn-sm" data-open-id="${inv.id}" style="flex:1;">
                    📜 Abrir Ficha Editável
                  </button>
                  <button type="button" class="btn btn-sm" data-edit-id="${inv.id}" title="Editar no Wizard">
                    ✏️ Wizard
                  </button>
                  <button type="button" class="btn btn-sm" data-del-id="${inv.id}" title="Excluir Investigador">
                    🗑️
                  </button>
                </div>
              </article>
            `;
            })
            .join("")}
        </div>
      `
      }
    </section>
  `;

  root.querySelector("#btnDashNew")?.addEventListener("click", startNewInvestigatorWizard);
  root.querySelector("#btnEmptyCreate")?.addEventListener("click", startNewInvestigatorWizard);
  root.querySelector("#btnCreateSample")?.addEventListener("click", createSampleInvestigator);
  root.querySelector("#btnDashSync")?.addEventListener("click", async () => {
    const count = await syncLocalToSupabase();
    await refreshConnectionAndData();
    alert(`${count} ficha(s) sincronizada(s) com o Supabase!`);
  });

  root.querySelectorAll("[data-open-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-open-id");
      const sheet = await getInvestigatorById(id);
      if (sheet) {
        state.activeSheet = sheet;
        state.sheetTab = "front";
        state.view = "sheet";
        render();
      }
    });
  });

  root.querySelectorAll("[data-edit-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-edit-id");
      const sheet = await getInvestigatorById(id);
      if (sheet) {
        const base = createBlankDraft();
        state.draft = {
          ...base,
          ...sheet,
          skills: { ...base.skills, ...(sheet.skills || {}) },
          backstory: { ...base.backstory, ...(sheet.backstory || {}) }
        };
        recalculateDraft(state.draft);
        state.wizardStep = 1;
        state.view = "wizard";
        render();
      }
    });
  });

  root.querySelectorAll("[data-del-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-del-id");
      if (confirm("Deseja realmente excluir esta ficha de investigador?")) {
        await deleteInvestigator(id);
        state.investigators = await listInvestigators();
        render();
      }
    });
  });
}

async function createSampleInvestigator() {
  const sample = createBlankDraft();
  sample.name = "Arthur Blackwood";
  sample.player_name = "Investigador Miskatonic";
  sample.age = 34;
  sample.gender = "Masculino";
  sample.era = "1920";
  sample.residence = "Arkham, Massachusetts";
  sample.birthplace = "Providence, Rhode Island";
  sample.occupation_id = "private_investigator";
  sample.characteristics = {
    str: 60,
    con: 65,
    siz: 60,
    dex: 70,
    app: 55,
    int: 75,
    pow: 65,
    edu: 70,
    luck: 55,
    starting_luck: 55
  };
  sample.selected_interpersonal = ["persuade"];
  sample.selected_free_skills = ["firearms_handgun"];
  recalculateDraft(sample);

  // Aloca Pontos Ocupacionais (EDU*2 + DES*2 = 140 + 140 = 280)
  sample.skills.credit_rating.occupation_points = 20;
  sample.skills.spot_hidden.occupation_points = 45;
  sample.skills.library_use.occupation_points = 40;
  sample.skills.psychology.occupation_points = 45;
  sample.skills.law.occupation_points = 30;
  sample.skills.persuade.occupation_points = 40;
  sample.skills.firearms_handgun.occupation_points = 40;
  sample.skills.disguise.occupation_points = 20;

  // Aloca Interesses Pessoais (INT*2 = 150)
  sample.skills.listen.personal_points = 35;
  sample.skills.dodge.personal_points = 30;
  sample.skills.occult.personal_points = 45;
  sample.skills.stealth.personal_points = 20;
  sample.skills.first_aid.personal_points = 20;

  sample.backstory.personal_description.entry_text =
    "Sobretudo escuro desgastado pela chuva de Arkham, olhar atento e cicatriz discreta no queixo.";
  sample.backstory.ideology_beliefs.entry_text =
    "Há forças antigas operando nas sombras da razão humana; apenas registros documentados impedem a loucura.";
  sample.backstory.significant_people.entry_text =
    "Dra. Eleanor Vance (antiga professora na Universidade Miskatonic que desapareceu após traduzir um diário).";
  sample.backstory.significant_people.is_key_connection = true;
  sample.backstory.meaningful_locations.entry_text =
    "Sala de leitura reservada da Biblioteca Orne, em Arkham.";
  sample.backstory.treasured_possessions.entry_text =
    "Bússola de latão parada às 03:17 da manhã e câmera fotográfica Kodak de fole.";

  sample.weapons = [
    {
      name: "Desarmado",
      skill_id: "fighting_brawl",
      regular_value: 25,
      damage: "1D3 + BD",
      range: "Toque",
      attacks_per_round: "1",
      ammo: "—",
      malfunction: "—"
    },
    {
      name: "Revólver .38",
      skill_id: "firearms_handgun",
      regular_value: 60,
      damage: "1D10",
      range: "15m",
      attacks_per_round: "1 (3)",
      ammo: "6",
      malfunction: "100"
    }
  ];

  recalculateDraft(sample);
  const saved = await saveInvestigator(sample);
  state.investigators = await listInvestigators();
  state.activeSheet = saved;
  state.view = "sheet";
  render();
}

// ============================================================================
// 2. VISÃO: WIZARD DE CRIAÇÃO (AS 5 ETAPAS OFICIAIS DO PDF)
// ============================================================================
function validateWizardStep(step, d) {
  recalculateDraft(d);
  const bracket = getAgeBracket(d.age);
  const occ = OCCUPATIONS_CATALOG.find((o) => o.id === d.occupation_id) || OCCUPATIONS_CATALOG[0];

  if (step === 1) {
    if (!d.name || d.name.trim().length < 2) {
      return { valid: false, message: "Informe o Nome do Investigador para concluir a Etapa 1." };
    }
    const deductedSum = bracket.physicalTargets.reduce(
      (acc, k) => acc + (Number(d.age_deductions[k]) || 0),
      0
    );
    if (bracket.physicalPenaltyTotal > 0 && deductedSum !== bracket.physicalPenaltyTotal) {
      return {
        valid: false,
        message: `Faixa etária (${bracket.label}): distribua exatamente ${bracket.physicalPenaltyTotal} pontos de redução entre ${bracket.physicalTargetLabels} (distribuído: ${deductedSum}).`
      };
    }
    return { valid: true, message: "Atributos Globais e Faixa Etária validados!" };
  }

  if (step === 2) {
    if ((d.selected_interpersonal || []).length !== occ.interpersonal_slots) {
      return {
        valid: false,
        message: `Selecione ${occ.interpersonal_slots} perícia(s) interpessoal(is) da ocupação.`
      };
    }
    if ((d.selected_free_skills || []).length !== occ.free_slots) {
      return {
        valid: false,
        message: `Selecione ${occ.free_slots} perícia(s) livre(s) da ocupação.`
      };
    }
    return { valid: true, message: `Ocupação ${occ.name} configurada com sucesso!` };
  }

  if (step === 3) {
    const maxOccPoints = calcOccupationPoints(occ.points_formula, d.characteristics);
    const maxPersPoints = calcPersonalPoints(d.characteristics);

    let spentOcc = 0;
    let spentPers = 0;
    for (const sk of Object.values(d.skills)) {
      spentOcc += Number(sk.occupation_points) || 0;
      spentPers += Number(sk.personal_points) || 0;
    }

    const crTotal =
      (d.skills.credit_rating?.base_value || 0) +
      (d.skills.credit_rating?.occupation_points || 0) +
      (d.skills.credit_rating?.personal_points || 0);

    if (crTotal < occ.credit_min || crTotal > occ.credit_max) {
      return {
        valid: false,
        message: `Regra Obrigatória: O Nível de Crédito atual (${crTotal}%) deve ficar dentro da faixa da ocupação ${occ.name} (${occ.credit_min}% a ${occ.credit_max}%).`
      };
    }
    if (spentOcc !== maxOccPoints) {
      return {
        valid: false,
        message: `Distribua todos os Pontos Ocupacionais: ${spentOcc} / ${maxOccPoints} alocados.`
      };
    }
    if (spentPers !== maxPersPoints) {
      return {
        valid: false,
        message: `Distribua todos os Pontos de Interesses Pessoais (INT × 2): ${spentPers} / ${maxPersPoints} alocados.`
      };
    }
    return { valid: true, message: "Todos os pontos de perícia e Nível de Crédito validados!" };
  }

  if (step === 4) {
    const creationCats = BACKSTORY_CATEGORIES.filter((c) => c.creationGroup);
    const filledCount = creationCats.filter(
      (c) => (d.backstory[c.id]?.entry_text || "").trim().length >= 3
    ).length;
    const keyConnCount = Object.values(d.backstory).filter((b) => b.is_key_connection).length;

    if (filledCount < 3) {
      return {
        valid: false,
        message: `Preencha pelo menos 3 categorias descritivas de Antecedentes (preenchidas: ${filledCount}/3).`
      };
    }
    if (keyConnCount !== 1) {
      return {
        valid: false,
        message: "Marque exatamente 1 categoria de antecedente como Conexão-Chave (Key Connection)."
      };
    }
    return { valid: true, message: "Antecedentes e Conexão-Chave validados!" };
  }

  return { valid: true, message: "Pronto para finalizar e salvar a ficha!" };
}

function renderWizard(root) {
  const d = state.draft;
  recalculateDraft(d);
  const stepValidation = validateWizardStep(state.wizardStep, d);

  const stepsMeta = [
    { num: 1, title: "Atributos & Idade" },
    { num: 2, title: "Ocupação" },
    { num: 3, title: "Perícias (46)" },
    { num: 4, title: "Antecedentes" },
    { num: 5, title: "Finanças & Armas" }
  ];

  root.innerHTML = `
    <div class="wizard-steps">
      ${stepsMeta
        .map(
          (s) => `
        <button type="button" class="wizard-step-tab ${state.wizardStep === s.num ? "active" : ""} ${
            s.num < state.wizardStep ? "completed" : ""
          }" data-goto-step="${s.num}">
          <span class="step-num">${s.num}</span>
          <span class="step-label">${s.title}</span>
        </button>
      `
        )
        .join("")}
    </div>

    <div id="wizardStepContent"></div>

    <div class="ornate-panel" style="display:flex; align-items:center; justify-content:space-between; gap:1rem; flex-wrap:wrap;">
      <div style="font-size:0.86rem; color:${
        stepValidation.valid ? "var(--status-success)" : "var(--status-luck)"
      }; font-weight:600;">
        ${stepValidation.valid ? "✔ " : "⚠ "}${escapeHtml(stepValidation.message)}
      </div>

      <div style="display:flex; gap:0.65rem;">
        <button type="button" class="btn" id="btnWizardCancel">Cancelar</button>
        ${
          state.wizardStep > 1
            ? `<button type="button" class="btn" id="btnWizardPrev">← Etapa Anterior</button>`
            : ""
        }
        ${
          state.wizardStep < 5
            ? `<button type="button" class="btn btn-primary" id="btnWizardNext" ${
                !stepValidation.valid ? "disabled" : ""
              }>Próxima Etapa →</button>`
            : `<button type="button" class="btn btn-primary" id="btnWizardFinish">💾 Salvar Investigador & Abrir Ficha</button>`
        }
      </div>
    </div>
  `;

  const stepContainer = root.querySelector("#wizardStepContent");
  if (state.wizardStep === 1) renderWizardStep1(stepContainer, d);
  else if (state.wizardStep === 2) renderWizardStep2(stepContainer, d);
  else if (state.wizardStep === 3) renderWizardStep3(stepContainer, d);
  else if (state.wizardStep === 4) renderWizardStep4(stepContainer, d);
  else if (state.wizardStep === 5) renderWizardStep5(stepContainer, d);

  root.querySelectorAll("[data-goto-step]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = Number(btn.getAttribute("data-goto-step"));
      if (target < state.wizardStep || validateWizardStep(state.wizardStep, d).valid) {
        state.wizardStep = target;
        render();
      }
    });
  });

  root.querySelector("#btnWizardCancel")?.addEventListener("click", () => {
    state.view = "dashboard";
    render();
  });

  root.querySelector("#btnWizardPrev")?.addEventListener("click", () => {
    state.wizardStep = Math.max(1, state.wizardStep - 1);
    render();
  });

  root.querySelector("#btnWizardNext")?.addEventListener("click", () => {
    if (validateWizardStep(state.wizardStep, d).valid) {
      state.wizardStep = Math.min(5, state.wizardStep + 1);
      render();
    }
  });

  root.querySelector("#btnWizardFinish")?.addEventListener("click", async () => {
    recalculateDraft(d);
    const saved = await saveInvestigator(d);
    state.investigators = await listInvestigators();
    state.activeSheet = saved;
    state.view = "sheet";
    render();
  });
}

// ----------------------------------------------------------------------------
// ETAPA 1: GERAR ATRIBUTOS GLOBAIS, IDADE E DERIVADOS
// ----------------------------------------------------------------------------
function renderWizardStep1(container, d) {
  const bracket = getAgeBracket(d.age);
  const c = d.characteristics;
  const der = d.derived;

  container.innerHTML = `
    <section class="ornate-panel">
      <div class="section-banner">Etapa 1: Identificação, Atributos Globais (100% / ½ / ⅕) & Faixa Etária</div>

      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:0.85rem; margin-bottom:1.25rem;">
        <div>
          <label>Nome do Investigador *</label>
          <input type="text" id="wizName" value="${escapeHtml(d.name)}" placeholder="Ex.: Prof. Harvey Walters" />
        </div>
        <div>
          <label>Jogador(a)</label>
          <input type="text" id="wizPlayer" value="${escapeHtml(d.player_name)}" placeholder="Seu nome" />
        </div>
        <div>
          <label>Idade (15 a 90 anos)</label>
          <input type="number" id="wizAge" min="15" max="90" value="${d.age}" />
        </div>
        <div>
          <label>Sexo</label>
          <input type="text" id="wizGender" value="${escapeHtml(d.gender)}" placeholder="Ex.: Masculino / Feminino" />
        </div>
        <div>
          <label>Época da Campanha</label>
          <select id="wizEra">
            <option value="1920" ${d.era === "1920" ? "selected" : ""}>Década de 1920 (Clássico)</option>
            <option value="modern" ${d.era === "modern" ? "selected" : ""}>Era Moderna</option>
          </select>
        </div>
        <div>
          <label>Residência</label>
          <input type="text" id="wizResidence" value="${escapeHtml(d.residence)}" />
        </div>
        <div>
          <label>Local de Nascimento</label>
          <input type="text" id="wizBirthplace" value="${escapeHtml(d.birthplace)}" />
        </div>
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; margin-bottom:0.85rem;">
        <h3 style="font-family:var(--font-display); font-size:0.98rem;">
          Características Primárias (Fórmulas Oficiais)
        </h3>
        <button type="button" class="btn btn-primary btn-sm" id="btnRollAllChars">
          🎲 Rolar Todos os Atributos + Sorte
        </button>
      </div>

      <div class="chars-grid">
        ${PRIMARY_CHARACTERISTICS.map((attr) => {
          const f = calcFractions(c[attr.key]);
          return `
            <div class="char-box-card">
              <div class="char-box-header">
                <div>
                  <span class="char-sigla">${attr.sigla}</span>
                  <span style="font-size:0.75rem; color:var(--text-secondary); margin-left:0.3rem;">${attr.name}</span>
                </div>
                <button type="button" class="btn btn-sm" data-roll-char="${attr.key}" style="padding:0.15rem 0.45rem;" title="Rolar ${attr.formula}">
                  🎲 ${attr.formula}
                </button>
              </div>
              <div class="coc-triple-box">
                <div class="coc-triple-main">
                  <input type="number" min="0" max="99" data-char-input="${attr.key}" value="${f.total}" />
                </div>
                <div class="coc-triple-fractions">
                  <div class="coc-fraction-cell">
                    <span class="frac-lbl">Metade (½)</span>
                    <span class="frac-val">${f.half}</span>
                  </div>
                  <div class="coc-fraction-cell">
                    <span class="frac-lbl">Quinto (⅕)</span>
                    <span class="frac-val">${f.fifth}</span>
                  </div>
                </div>
              </div>
            </div>
          `;
        }).join("")}

        <!-- SORTE -->
        <div class="char-box-card" style="border-color:var(--status-luck);">
          <div class="char-box-header">
            <div>
              <span class="char-sigla" style="color:var(--status-luck);">SORTE</span>
              <span style="font-size:0.74rem; color:var(--text-secondary); margin-left:0.3rem;">Recurso Dinâmico</span>
            </div>
            <button type="button" class="btn btn-sm" id="btnRollLuck" style="padding:0.15rem 0.45rem;">
              🎲 ${bracket.doubleLuckRoll ? "2x 3D6×5 (Maior)" : "3D6×5"}
            </button>
          </div>
          <div class="coc-triple-box">
            <div class="coc-triple-main" style="grid-column: span 2; border-right:none;">
              <input type="number" min="0" max="99" id="wizLuckInput" value="${c.luck}" />
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- MODIFICADORES POR FAIXA ETÁRIA -->
    <section class="ornate-panel">
      <div class="section-banner">Modificadores por Faixa Etária: ${bracket.label}</div>
      <p style="font-size:0.86rem; color:var(--text-secondary); margin-bottom:0.85rem;">
        <strong>Regra Oficial:</strong> ${bracket.summary}
      </p>

      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:1rem;">
        <div style="background:var(--bg-elevated); padding:0.85rem; border-radius:4px; border:1px solid var(--border-subtle);">
          <h4 style="font-family:var(--font-display); font-size:0.86rem; margin-bottom:0.5rem;">
            Verificações de Melhoria de EDU (${bracket.eduChecks})
          </h4>
          ${
            bracket.eduChecks > 0
              ? `
              <button type="button" class="btn btn-outline-crimson btn-sm" id="btnRunEduChecks">
                🎲 Executar ${bracket.eduChecks} Verificação(ões) de EDU (1D100)
              </button>
              <div style="margin-top:0.55rem; font-family:var(--font-mono); font-size:0.75rem; color:var(--text-secondary);">
                ${
                  d.age_edu_logs.length > 0
                    ? d.age_edu_logs.map((l) => `<div>• ${escapeHtml(l)}</div>`).join("")
                    : "Nenhuma verificação rolada ainda."
                }
              </div>
            `
              : `<p style="font-size:0.8rem; color:var(--text-muted);">Jovem (15–19 anos): EDU reduzida em 5 pontos automaticamente ao rolar.</p>`
          }
        </div>

        ${
          bracket.physicalPenaltyTotal > 0
            ? `
          <div style="background:var(--bg-elevated); padding:0.85rem; border-radius:4px; border:1px solid var(--border-subtle);">
            <h4 style="font-family:var(--font-display); font-size:0.86rem; margin-bottom:0.4rem;">
              Distribuir Penalidade Física (${bracket.physicalPenaltyTotal} pts entre ${bracket.physicalTargetLabels})
            </h4>
            <div style="display:flex; gap:0.65rem; margin-top:0.5rem;">
              ${bracket.physicalTargets
                .map(
                  (k) => `
                <div style="flex:1;">
                  <label>Reduzir ${k.toUpperCase()}</label>
                  <input type="number" min="0" max="${bracket.physicalPenaltyTotal}" data-age-deduct="${k}" value="${
                    d.age_deductions[k] || 0
                  }" />
                </div>
              `
                )
                .join("")}
              <button type="button" class="btn btn-sm" id="btnApplyAgeDeduct" style="align-self:flex-end;">
                Aplicar nos Atributos
              </button>
            </div>
          </div>
        `
            : ""
        }
      </div>
    </section>

    <!-- ATRIBUTOS DERIVADOS AUTOMÁTICOS -->
    <section class="ornate-panel">
      <div class="section-banner">Atributos Derivados & Fórmulas Matemáticas (Calculados Automaticamente)</div>
      <div class="inv-stat-pills" style="grid-template-columns:repeat(auto-fit, minmax(150px, 1fr));">
        <div class="stat-pill">
          <div class="lbl">Pontos de Vida (PV)</div>
          <div class="val" style="color:var(--status-hp);">${der.max_hp}</div>
          <div style="font-size:0.68rem; color:var(--text-muted);">⌊(CON + TAM) / 10⌋</div>
        </div>
        <div class="stat-pill">
          <div class="lbl">Sanidade Inicial (SAN)</div>
          <div class="val" style="color:var(--status-san);">${der.starting_sanity} / ${der.max_sanity}</div>
          <div style="font-size:0.68rem; color:var(--text-muted);">Igual a POD</div>
        </div>
        <div class="stat-pill">
          <div class="lbl">Pontos de Magia (PM)</div>
          <div class="val" style="color:var(--status-mp);">${der.max_mp}</div>
          <div style="font-size:0.68rem; color:var(--text-muted);">⌊POD / 5⌋</div>
        </div>
        <div class="stat-pill">
          <div class="lbl">Taxa de Movimento (MOV)</div>
          <div class="val">${der.mov}</div>
          <div style="font-size:0.68rem; color:var(--text-muted);">Penalidade Idade: -${bracket.movPenalty}</div>
        </div>
        <div class="stat-pill">
          <div class="lbl">Dano Extra (DX)</div>
          <div class="val" style="color:var(--crimson-bright);">${der.damage_bonus}</div>
          <div style="font-size:0.68rem; color:var(--text-muted);">FOR + TAM = ${c.str + c.siz}</div>
        </div>
        <div class="stat-pill">
          <div class="lbl">Corpo (Build)</div>
          <div class="val">${der.build}</div>
          <div style="font-size:0.68rem; color:var(--text-muted);">Tabela de Combate</div>
        </div>
      </div>
    </section>
  `;

  // Eventos Etapa 1
  container.querySelector("#wizName").addEventListener("input", (e) => {
    d.name = e.target.value;
    render();
  });
  container.querySelector("#wizPlayer").addEventListener("input", (e) => {
    d.player_name = e.target.value;
  });
  container.querySelector("#wizGender").addEventListener("input", (e) => {
    d.gender = e.target.value;
  });
  container.querySelector("#wizResidence").addEventListener("input", (e) => {
    d.residence = e.target.value;
  });
  container.querySelector("#wizBirthplace").addEventListener("input", (e) => {
    d.birthplace = e.target.value;
  });
  container.querySelector("#wizEra").addEventListener("change", (e) => {
    d.era = e.target.value;
    recalculateDraft(d);
    render();
  });
  container.querySelector("#wizAge").addEventListener("change", (e) => {
    d.age = Math.max(15, Math.min(90, Number(e.target.value) || 25));
    d.age_deductions = { str: 0, con: 0, dex: 0, siz: 0 };
    d.age_edu_logs = [];
    const b = getAgeBracket(d.age);
    if (b.physicalPenaltyTotal > 0 && b.physicalTargets.length > 0) {
      d.age_deductions[b.physicalTargets[0]] = b.physicalPenaltyTotal;
    }
    recalculateDraft(d);
    render();
  });

  container.querySelectorAll("[data-char-input]").forEach((inp) => {
    inp.addEventListener("change", () => {
      const k = inp.getAttribute("data-char-input");
      d.characteristics[k] = Math.max(0, Math.min(99, Number(inp.value) || 0));
      recalculateDraft(d);
      render();
    });
  });

  container.querySelector("#wizLuckInput").addEventListener("change", (e) => {
    const val = Math.max(0, Math.min(99, Number(e.target.value) || 0));
    d.characteristics.luck = val;
    d.characteristics.starting_luck = val;
    render();
  });

  container.querySelectorAll("[data-roll-char]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const k = btn.getAttribute("data-roll-char");
      const def = PRIMARY_CHARACTERISTICS.find((a) => a.key === k);
      const rolled = rollCharacteristic(def.formula);
      d.characteristics[k] = rolled.value;
      recalculateDraft(d);
      render();
    });
  });

  container.querySelector("#btnRollLuck").addEventListener("click", () => {
    const r1 = rollCharacteristic("3D6x5").value;
    const r2 = bracket.doubleLuckRoll ? rollCharacteristic("3D6x5").value : r1;
    const best = Math.max(r1, r2);
    d.characteristics.luck = best;
    d.characteristics.starting_luck = best;
    render();
  });

  container.querySelector("#btnRollAllChars").addEventListener("click", () => {
    for (const attr of PRIMARY_CHARACTERISTICS) {
      d.characteristics[attr.key] = rollCharacteristic(attr.formula).value;
    }
    if (bracket.eduFixedPenalty > 0) {
      d.characteristics.edu = Math.max(0, d.characteristics.edu - bracket.eduFixedPenalty);
    }
    if (bracket.appPenalty > 0) {
      d.characteristics.app = Math.max(0, d.characteristics.app - bracket.appPenalty);
    }
    const r1 = rollCharacteristic("3D6x5").value;
    const r2 = bracket.doubleLuckRoll ? rollCharacteristic("3D6x5").value : r1;
    d.characteristics.luck = Math.max(r1, r2);
    d.characteristics.starting_luck = d.characteristics.luck;
    recalculateDraft(d);
    render();
  });

  container.querySelector("#btnRunEduChecks")?.addEventListener("click", () => {
    const res = performEduImprovementChecks(d.characteristics.edu, bracket.eduChecks);
    d.characteristics.edu = res.finalEdu;
    d.age_edu_logs = res.logs;
    recalculateDraft(d);
    render();
  });

  container.querySelectorAll("[data-age-deduct]").forEach((inp) => {
    inp.addEventListener("change", () => {
      const k = inp.getAttribute("data-age-deduct");
      d.age_deductions[k] = Math.max(0, Number(inp.value) || 0);
      render();
    });
  });

  container.querySelector("#btnApplyAgeDeduct")?.addEventListener("click", () => {
    for (const k of bracket.physicalTargets) {
      const pen = Number(d.age_deductions[k]) || 0;
      d.characteristics[k] = Math.max(0, (d.characteristics[k] || 0) - pen);
    }
    recalculateDraft(d);
    render();
  });
}

// ----------------------------------------------------------------------------
// ETAPA 2: DETERMINAR A OCUPAÇÃO
// ----------------------------------------------------------------------------
function renderWizardStep2(container, d) {
  const occ = OCCUPATIONS_CATALOG.find((o) => o.id === d.occupation_id) || OCCUPATIONS_CATALOG[0];
  const occPoints = calcOccupationPoints(occ.points_formula, d.characteristics);
  const persPoints = calcPersonalPoints(d.characteristics);

  const interpersonalSkills = SKILLS_CATALOG.filter((s) => s.is_interpersonal);
  const freeSkillChoices = SKILLS_CATALOG.filter(
    (s) =>
      s.id !== "cthulhu_mythos" &&
      s.id !== "credit_rating" &&
      !occ.fixed_skills.includes(s.id)
  );

  container.innerHTML = `
    <section class="ornate-panel">
      <div class="section-banner">Etapa 2: Determinar a Ocupação & Fórmula de Pontos Ocupacionais</div>

      <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:0.85rem; margin-bottom:1.25rem;">
        ${OCCUPATIONS_CATALOG.map(
          (o) => `
          <div class="inv-card" style="cursor:pointer; border-color:${
            d.occupation_id === o.id ? "var(--crimson-bright)" : "var(--border-ornate)"
          }; background:${d.occupation_id === o.id ? "rgba(220,20,30,0.1)" : "var(--bg-elevated)"};" data-select-occ="${o.id}">
            <div>
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <h4 style="font-family:var(--font-display); font-size:1rem;">${o.name}</h4>
                <span class="char-formula-badge">NC ${o.credit_min}–${o.credit_max}%</span>
              </div>
              <p style="font-size:0.78rem; color:var(--text-secondary); margin:0.4rem 0;">${o.description}</p>
              <div style="font-family:var(--font-mono); font-size:0.74rem; color:var(--crimson-bright);">
                Fórmula: ${o.formula_label}
              </div>
            </div>
          </div>
        `
        ).join("")}
      </div>

      <div style="background:var(--bg-elevated); border:1px solid var(--border-ornate); padding:1rem; border-radius:6px;">
        <h3 style="font-family:var(--font-display); font-size:1rem; margin-bottom:0.4rem;">
          Ocupação Selecionada: ${occ.name}
        </h3>
        <p style="font-size:0.84rem; color:var(--text-secondary); margin-bottom:0.8rem;">
          <strong>Perícias Típicas:</strong> ${occ.skills_description}
        </p>

        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:1rem; margin-bottom:1rem;">
          <div class="stat-pill">
            <div class="lbl">Pontos Ocupacionais (${occ.formula_label})</div>
            <div class="val" style="color:var(--crimson-bright); font-size:1.3rem;">${occPoints} pts</div>
          </div>
          <div class="stat-pill">
            <div class="lbl">Interesses Pessoais (INT × 2)</div>
            <div class="val" style="color:var(--status-mp); font-size:1.3rem;">${persPoints} pts</div>
          </div>
          <div class="stat-pill">
            <div class="lbl">Faixa de Nível de Crédito Obrigatória</div>
            <div class="val" style="color:var(--status-luck); font-size:1.3rem;">${occ.credit_min}% a ${occ.credit_max}%</div>
          </div>
        </div>

        ${
          occ.interpersonal_slots > 0
            ? `
          <div style="margin-bottom:0.9rem;">
            <label>Escolha ${occ.interpersonal_slots} Perícia(s) Interpessoal(is) da Profissão:</label>
            <div style="display:flex; gap:0.65rem; flex-wrap:wrap; margin-top:0.35rem;">
              ${interpersonalSkills
                .map((sk) => {
                  const checked = (d.selected_interpersonal || []).includes(sk.id);
                  return `
                  <label class="flag-check" style="background:var(--bg-input); padding:0.4rem 0.7rem; border:1px solid var(--border-subtle); border-radius:4px;">
                    <input type="checkbox" data-occ-interp="${sk.id}" ${checked ? "checked" : ""} />
                    ${sk.name} (${sk.base_value}%)
                  </label>
                `;
                })
                .join("")}
            </div>
          </div>
        `
            : ""
        }

        ${
          occ.free_slots > 0
            ? `
          <div>
            <label>Escolha ${occ.free_slots} Perícia(s) Especial(is) / Livre(s) da Profissão (Selecionadas: ${(d.selected_free_skills || []).length}/${occ.free_slots}):</label>
            <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(195px, 1fr)); gap:0.4rem; margin-top:0.35rem; max-height:220px; overflow-y:auto; padding:0.4rem; background:var(--bg-input); border:1px solid var(--border-subtle);">
              ${freeSkillChoices
                .map((sk) => {
                  const checked = (d.selected_free_skills || []).includes(sk.id);
                  return `
                  <label class="flag-check">
                    <input type="checkbox" data-occ-free="${sk.id}" ${checked ? "checked" : ""} />
                    ${sk.name} (${sk.base_value}%)
                  </label>
                `;
                })
                .join("")}
            </div>
          </div>
        `
            : ""
        }
      </div>
    </section>
  `;

  container.querySelectorAll("[data-select-occ]").forEach((card) => {
    card.addEventListener("click", () => {
      const id = card.getAttribute("data-select-occ");
      d.occupation_id = id;
      const newOcc = OCCUPATIONS_CATALOG.find((o) => o.id === id);
      d.selected_interpersonal = newOcc.interpersonal_slots > 0 ? ["persuade"] : [];
      d.selected_free_skills = freeSkillChoices
        .slice(0, newOcc.free_slots)
        .map((s) => s.id);
      recalculateDraft(d);
      render();
    });
  });

  container.querySelectorAll("[data-occ-interp]").forEach((chk) => {
    chk.addEventListener("change", () => {
      const id = chk.getAttribute("data-occ-interp");
      let list = [...(d.selected_interpersonal || [])];
      if (chk.checked) {
        if (list.length >= occ.interpersonal_slots) list.shift();
        list.push(id);
      } else {
        list = list.filter((x) => x !== id);
      }
      d.selected_interpersonal = list;
      recalculateDraft(d);
      render();
    });
  });

  container.querySelectorAll("[data-occ-free]").forEach((chk) => {
    chk.addEventListener("change", () => {
      const id = chk.getAttribute("data-occ-free");
      let list = [...(d.selected_free_skills || [])];
      if (chk.checked) {
        if (list.length >= occ.free_slots) list.shift();
        list.push(id);
      } else {
        list = list.filter((x) => x !== id);
      }
      d.selected_free_skills = list;
      recalculateDraft(d);
      render();
    });
  });
}

// ----------------------------------------------------------------------------
// ETAPA 3: DISTRIBUIR PONTOS DE PERÍCIA (46 PERÍCIAS OFICIAIS DA FICHA)
// ----------------------------------------------------------------------------
function renderWizardStep3(container, d) {
  const occ = OCCUPATIONS_CATALOG.find((o) => o.id === d.occupation_id) || OCCUPATIONS_CATALOG[0];
  const maxOcc = calcOccupationPoints(occ.points_formula, d.characteristics);
  const maxPers = calcPersonalPoints(d.characteristics);

  let spentOcc = 0;
  let spentPers = 0;
  for (const sk of Object.values(d.skills)) {
    spentOcc += Number(sk.occupation_points) || 0;
    spentPers += Number(sk.personal_points) || 0;
  }

  const remOcc = maxOcc - spentOcc;
  const remPers = maxPers - spentPers;
  const crEntry = d.skills.credit_rating;
  const crTotal = (crEntry.base_value || 0) + (crEntry.occupation_points || 0) + (crEntry.personal_points || 0);

  container.innerHTML = `
    <section class="ornate-panel">
      <div class="section-banner">Etapa 3: Distribuir Pontos nas 46 Perícias Oficiais da Ficha</div>

      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:0.85rem; margin-bottom:1rem;">
        <div class="stat-pill" style="border-color:var(--crimson-primary);">
          <div class="lbl">Pontos Ocupacionais Restantes</div>
          <div class="val" style="color:${remOcc === 0 ? "var(--status-success)" : "var(--crimson-bright)"}; font-size:1.3rem;">
            ${remOcc} / ${maxOcc}
          </div>
          <div style="font-size:0.7rem; color:var(--text-muted);">Apenas nas 8 perícias marcadas em vermelho + Nível de Crédito</div>
        </div>

        <div class="stat-pill" style="border-color:var(--status-mp);">
          <div class="lbl">Interesses Pessoais Restantes (INT × 2)</div>
          <div class="val" style="color:${remPers === 0 ? "var(--status-success)" : "var(--status-mp)"}; font-size:1.3rem;">
            ${remPers} / ${maxPers}
          </div>
          <div style="font-size:0.7rem; color:var(--text-muted);">Qualquer perícia, EXCETO Mythos de Cthulhu (0%)</div>
        </div>

        <div class="stat-pill" style="border-color:var(--status-luck);">
          <div class="lbl">Nível de Crédito (${occ.name}: ${occ.credit_min}–${occ.credit_max}%)</div>
          <div class="val" style="color:${
            crTotal >= occ.credit_min && crTotal <= occ.credit_max
              ? "var(--status-success)"
              : "var(--status-luck)"
          }; font-size:1.3rem;">
            ${crTotal}% (${d.finances.economic_class})
          </div>
          <div style="font-size:0.7rem; color:var(--text-muted);">Aloque pontos ocupacionais em Nível de Crédito</div>
        </div>
      </div>

      <div style="display:flex; justify-content:flex-end; margin-bottom:0.85rem; gap:0.5rem;">
        <button type="button" class="btn btn-sm" id="btnAutoAllocateSkills">
          ⚡ Auto-Distribuir Pontos Sugeridos da Ocupação
        </button>
        <button type="button" class="btn btn-sm" id="btnResetSkills">
          ↺ Zerar Pontos Alocados
        </button>
      </div>

      <div style="overflow-x:auto;">
        <table style="width:100%; border-collapse:collapse; font-size:0.82rem;">
          <thead>
            <tr style="background:var(--bg-elevated); border-bottom:1px solid var(--border-ornate); text-align:left;">
              <th style="padding:0.5rem;">Perícia Oficial</th>
              <th style="padding:0.5rem;">Base</th>
              <th style="padding:0.5rem;">Pts Ocupacionais</th>
              <th style="padding:0.5rem;">Pts Pessoais</th>
              <th style="padding:0.5rem;">Regular | Difícil (½) | Extremo (⅕)</th>
            </tr>
          </thead>
          <tbody>
            ${SKILLS_CATALOG.map((sk) => {
              const entry = d.skills[sk.id];
              const isOcc = entry.is_occupation_skill;
              const isMythos = sk.id === "cthulhu_mythos";
              const total = Math.min(
                99,
                entry.base_value + entry.occupation_points + entry.personal_points
              );
              const f = calcFractions(total);

              return `
                <tr style="border-bottom:1px solid var(--border-subtle); background:${
                  isOcc ? "rgba(220,20,30,0.07)" : "transparent"
                };">
                  <td style="padding:0.4rem 0.5rem; font-weight:${isOcc ? "700" : "400"};">
                    ${isOcc ? `<span style="color:var(--crimson-bright);">★</span> ` : ""}
                    ${sk.name}
                    ${
                      sk.id === "credit_rating"
                        ? `<span class="char-formula-badge">Obrigatório: ${occ.credit_min}–${occ.credit_max}%</span>`
                        : ""
                    }
                    ${
                      isMythos
                        ? `<span class="char-formula-badge">Travado 0% na criação</span>`
                        : ""
                    }
                  </td>
                  <td style="padding:0.4rem 0.5rem; font-family:var(--font-mono); color:var(--text-secondary);">
                    ${String(entry.base_value).padStart(2, "0")}%
                  </td>
                  <td style="padding:0.4rem 0.5rem; width:130px;">
                    <input
                      type="number"
                      min="0"
                      max="99"
                      data-occ-pt="${sk.id}"
                      value="${entry.occupation_points}"
                      ${!isOcc || isMythos ? "disabled" : ""}
                      style="padding:0.25rem 0.4rem; font-family:var(--font-mono);"
                    />
                  </td>
                  <td style="padding:0.4rem 0.5rem; width:130px;">
                    <input
                      type="number"
                      min="0"
                      max="99"
                      data-pers-pt="${sk.id}"
                      value="${entry.personal_points}"
                      ${isMythos ? "disabled" : ""}
                      style="padding:0.25rem 0.4rem; font-family:var(--font-mono);"
                    />
                  </td>
                  <td style="padding:0.4rem 0.5rem;">
                    <div class="skill-mini-triple">
                      <span>${f.total}%</span>
                      <span>${f.half}</span>
                      <span>${f.fifth}</span>
                    </div>
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;

  container.querySelectorAll("[data-occ-pt]").forEach((inp) => {
    inp.addEventListener("change", () => {
      const id = inp.getAttribute("data-occ-pt");
      d.skills[id].occupation_points = Math.max(0, Number(inp.value) || 0);
      recalculateDraft(d);
      render();
    });
  });

  container.querySelectorAll("[data-pers-pt]").forEach((inp) => {
    inp.addEventListener("change", () => {
      const id = inp.getAttribute("data-pers-pt");
      d.skills[id].personal_points = Math.max(0, Number(inp.value) || 0);
      recalculateDraft(d);
      render();
    });
  });

  container.querySelector("#btnResetSkills").addEventListener("click", () => {
    for (const sk of Object.values(d.skills)) {
      sk.occupation_points = 0;
      sk.personal_points = 0;
    }
    recalculateDraft(d);
    render();
  });

  container.querySelector("#btnAutoAllocateSkills").addEventListener("click", () => {
    for (const sk of Object.values(d.skills)) {
      sk.occupation_points = 0;
      sk.personal_points = 0;
    }

    // 1. Garante Nível de Crédito mínimo da ocupação
    let poolOcc = maxOcc;
    const minCr = occ.credit_min;
    d.skills.credit_rating.occupation_points = minCr;
    poolOcc -= minCr;

    // 2. Distribui o restante entre as 8 perícias ocupacionais
    const occSkillIds = Object.values(d.skills)
      .filter((s) => s.is_occupation_skill && s.skill_id !== "credit_rating")
      .map((s) => s.skill_id);

    let idx = 0;
    while (poolOcc > 0 && occSkillIds.length > 0) {
      const sid = occSkillIds[idx % occSkillIds.length];
      const cur = d.skills[sid].base_value + d.skills[sid].occupation_points;
      if (cur < 85) {
        const step = Math.min(5, poolOcc, 85 - cur);
        d.skills[sid].occupation_points += step;
        poolOcc -= step;
      }
      idx++;
      if (idx > 200) break;
    }
    if (poolOcc > 0 && occSkillIds[0]) {
      d.skills[occSkillIds[0]].occupation_points += poolOcc;
    }

    // 3. Distribui Interesses Pessoais (INT * 2) em Encontrar, Escutar, Esquivar, Psicologia e Ocultismo
    let poolPers = maxPers;
    const favPersonal = ["spot_hidden", "listen", "dodge", "first_aid", "occult", "stealth"];
    let pIdx = 0;
    while (poolPers > 0) {
      const sid = favPersonal[pIdx % favPersonal.length];
      const step = Math.min(10, poolPers);
      d.skills[sid].personal_points += step;
      poolPers -= step;
      pIdx++;
    }

    recalculateDraft(d);
    render();
  });
}

// ----------------------------------------------------------------------------
// ETAPA 4: ANTECEDENTES (10 CATEGORIAS DO VERSO DA FICHA) & CONEXÃO-CHAVE
// ----------------------------------------------------------------------------
function renderWizardStep4(container, d) {
  container.innerHTML = `
    <section class="ornate-panel">
      <div class="section-banner">Etapa 4: Antecedentes (Backstory), Personalidade & Conexão-Chave</div>
      <p style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:1rem;">
        Preencha pelo menos <strong>3 das 6 categorias iniciais</strong> e marque exatamente <strong>1 Conexão-Chave (★ Key Connection)</strong> usada para recuperar Sanidade.
      </p>

      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(340px, 1fr)); gap:1rem;">
        ${BACKSTORY_CATEGORIES.map((cat) => {
          const entry = d.backstory[cat.id] || { entry_text: "", is_key_connection: false };
          return `
            <div style="background:var(--bg-elevated); border:1px solid ${
              entry.is_key_connection ? "var(--status-luck)" : "var(--border-ornate)"
            }; padding:0.85rem; border-radius:4px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem;">
                <label style="margin:0; color:var(--text-primary);">
                  ${cat.number}. ${cat.title} ${cat.creationGroup ? "*" : "(Em Jogo)"}
                </label>
                ${
                  cat.canBeKeyConnection
                    ? `
                  <label class="flag-check" style="color:var(--status-luck); font-weight:700;">
                    <input type="radio" name="keyConnectionRadio" data-key-conn="${cat.id}" ${
                        entry.is_key_connection ? "checked" : ""
                      } />
                    ★ Conexão-Chave
                  </label>
                `
                    : ""
                }
              </div>
              <textarea rows="2" data-backstory-txt="${cat.id}" placeholder="${escapeHtml(
            cat.placeholder
          )}">${escapeHtml(entry.entry_text)}</textarea>
            </div>
          `;
        }).join("")}
      </div>
    </section>
  `;

  container.querySelectorAll("[data-backstory-txt]").forEach((area) => {
    area.addEventListener("input", () => {
      const id = area.getAttribute("data-backstory-txt");
      d.backstory[id].entry_text = area.value;
    });
    area.addEventListener("change", () => render());
  });

  container.querySelectorAll("[data-key-conn]").forEach((rad) => {
    rad.addEventListener("change", () => {
      const selectedId = rad.getAttribute("data-key-conn");
      for (const k of Object.keys(d.backstory)) {
        d.backstory[k].is_key_connection = k === selectedId;
      }
      render();
    });
  });
}

// ----------------------------------------------------------------------------
// ETAPA 5: FINANÇAS, EQUIPAMENTO, ARMAS & COMPANHEIROS
// ----------------------------------------------------------------------------
function renderWizardStep5(container, d) {
  const f = d.finances;

  container.innerHTML = `
    <section class="ornate-panel">
      <div class="section-banner">Etapa 5: Finanças (${d.era === "modern" ? "Era Moderna" : "Década de 1920"}), Pertences & Armas</div>

      <div class="inv-stat-pills" style="grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); margin-bottom:1.25rem;">
        <div class="stat-pill">
          <div class="lbl">Categoria Socioeconômica</div>
          <div class="val" style="color:var(--status-luck);">${escapeHtml(f.economic_class)}</div>
        </div>
        <div class="stat-pill">
          <div class="lbl">Nível de Gastos Diário</div>
          <div class="val" style="color:var(--status-success);">${escapeHtml(f.spending_level)}</div>
        </div>
        <div class="stat-pill">
          <div class="lbl">Dinheiro em Mãos</div>
          <div class="val">${escapeHtml(f.cash)}</div>
        </div>
        <div class="stat-pill">
          <div class="lbl">Patrimônio (Assets)</div>
          <div class="val">${escapeHtml(f.assets)}</div>
        </div>
      </div>

      <div style="margin-bottom:1.2rem;">
        <label>Equipamento e Pertences (Verso da Ficha)</label>
        <textarea id="wizEquipment" rows="3" placeholder="Itens carregados pelo investigador...">${escapeHtml(
          d.personal_equipment
        )}</textarea>
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.6rem;">
        <label style="margin:0;">Armas de Combate (Frente da Ficha)</label>
        <button type="button" class="btn btn-sm" id="btnAddWeapon">+ Adicionar Arma</button>
      </div>

      <div style="overflow-x:auto;">
        <table style="width:100%; border-collapse:collapse; font-size:0.82rem;">
          <thead>
            <tr style="background:var(--bg-elevated); border-bottom:1px solid var(--border-ornate); text-align:left;">
              <th style="padding:0.45rem;">Arma</th>
              <th style="padding:0.45rem;">Regular (%)</th>
              <th style="padding:0.45rem;">Dano</th>
              <th style="padding:0.45rem;">Alcance</th>
              <th style="padding:0.45rem;">Ataques</th>
              <th style="padding:0.45rem;">Munição</th>
              <th style="padding:0.45rem;">Defeito</th>
              <th style="padding:0.45rem;"></th>
            </tr>
          </thead>
          <tbody>
            ${(d.weapons || [])
              .map(
                (w, idx) => `
              <tr style="border-bottom:1px solid var(--border-subtle);">
                <td style="padding:0.35rem;"><input type="text" data-wp-field="name" data-wp-idx="${idx}" value="${escapeHtml(w.name)}" /></td>
                <td style="padding:0.35rem; width:90px;"><input type="number" data-wp-field="regular_value" data-wp-idx="${idx}" value="${w.regular_value}" /></td>
                <td style="padding:0.35rem;"><input type="text" data-wp-field="damage" data-wp-idx="${idx}" value="${escapeHtml(w.damage)}" /></td>
                <td style="padding:0.35rem;"><input type="text" data-wp-field="range" data-wp-idx="${idx}" value="${escapeHtml(w.range)}" /></td>
                <td style="padding:0.35rem; width:80px;"><input type="text" data-wp-field="attacks_per_round" data-wp-idx="${idx}" value="${escapeHtml(w.attacks_per_round)}" /></td>
                <td style="padding:0.35rem; width:80px;"><input type="text" data-wp-field="ammo" data-wp-idx="${idx}" value="${escapeHtml(w.ammo)}" /></td>
                <td style="padding:0.35rem; width:80px;"><input type="text" data-wp-field="malfunction" data-wp-idx="${idx}" value="${escapeHtml(w.malfunction)}" /></td>
                <td style="padding:0.35rem;">
                  ${
                    idx > 0
                      ? `<button type="button" class="btn btn-sm" data-del-wp="${idx}">✕</button>`
                      : ""
                  }
                </td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;

  container.querySelector("#wizEquipment").addEventListener("input", (e) => {
    d.personal_equipment = e.target.value;
  });

  container.querySelector("#btnAddWeapon").addEventListener("click", () => {
    const pistolTotal =
      (d.skills.firearms_handgun?.base_value || 20) +
      (d.skills.firearms_handgun?.occupation_points || 0) +
      (d.skills.firearms_handgun?.personal_points || 0);
    d.weapons.push({
      name: "Revólver .38",
      skill_id: "firearms_handgun",
      regular_value: pistolTotal,
      damage: "1D10",
      range: "15m",
      attacks_per_round: "1 (3)",
      ammo: "6",
      malfunction: "100"
    });
    render();
  });

  container.querySelectorAll("[data-wp-field]").forEach((inp) => {
    inp.addEventListener("change", () => {
      const idx = Number(inp.getAttribute("data-wp-idx"));
      const field = inp.getAttribute("data-wp-field");
      d.weapons[idx][field] = field === "regular_value" ? Number(inp.value) || 0 : inp.value;
      render();
    });
  });

  container.querySelectorAll("[data-del-wp]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.getAttribute("data-del-wp"));
      d.weapons.splice(idx, 1);
      render();
    });
  });
}

// ============================================================================
// 3. VISÃO: FICHA EDITÁVEL COMPLETA (FRENTE E VERSO — FIEL AO PDF)
// ============================================================================
function renderEditableSheet(root, sheet) {
  const c = sheet.characteristics || {};
  const d = sheet.derived || {};
  const f = sheet.finances || {};
  const occ = OCCUPATIONS_CATALOG.find((o) => o.id === sheet.occupation_id);
  const occName = sheet.custom_occupation_name || occ?.name || "Investigador";
  const dodgeSkill = sheet.skills?.dodge || { base_value: Math.floor((c.dex || 50) / 2), occupation_points: 0, personal_points: 0, experience_points: 0 };
  const dodgeTotal = Math.min(99, (dodgeSkill.base_value || 0) + (dodgeSkill.occupation_points || 0) + (dodgeSkill.personal_points || 0) + (dodgeSkill.experience_points || 0));
  const dodgeFrac = calcFractions(dodgeTotal);

  root.innerHTML = `
    <!-- BARRA DE CONTROLE DA FICHA -->
    <div class="ornate-panel no-print" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.75rem; padding:0.85rem 1.2rem;">
      <div style="display:flex; gap:0.5rem;">
        <button type="button" class="btn btn-sm" id="btnBackToDash">← Meus Investigadores</button>
        <button type="button" class="btn btn-sm ${state.sheetTab === "front" ? "btn-primary" : ""}" id="btnTabFront">
          📄 Frente da Ficha (Características, Perícias & Combate)
        </button>
        <button type="button" class="btn btn-sm ${state.sheetTab === "back" ? "btn-primary" : ""}" id="btnTabBack">
          📜 Verso da Ficha (Antecedentes, Pertences & Finanças)
        </button>
      </div>
      <div style="display:flex; gap:0.5rem;">
        <span style="font-size:0.78rem; color:var(--text-secondary); align-self:center;">
          💡 Clique em qualquer atributo ou perícia (🎲) para rolar 1D100
        </span>
        <button type="button" class="btn btn-sm" id="btnPrintSheet">🖨️ Imprimir / PDF</button>
      </div>
    </div>

    ${
      state.sheetTab === "front"
        ? `
      <!-- ================= FRENTE DA FICHA EDITÁVEL ================= -->
      <div class="ornate-panel">
        <div style="display:grid; grid-template-columns:1.1fr 1.6fr; gap:1.25rem; align-items:start;">
          <!-- BLOCO ESQUERDO: DADOS PESSOAIS (DÉCADA DE 1920) -->
          <div style="border:1px solid var(--border-ornate); padding:0.9rem; border-radius:4px; background:var(--bg-elevated);">
            <div class="section-banner" style="margin-bottom:0.75rem;">
              ${sheet.era === "modern" ? "ERA MODERNA" : "DÉCADA DE 1920"}
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.55rem; font-size:0.85rem;">
              <div style="grid-column:span 2;"><strong>Nome:</strong> ${escapeHtml(sheet.name)}</div>
              <div style="grid-column:span 2;"><strong>Jogador(a):</strong> ${escapeHtml(sheet.player_name || "—")}</div>
              <div style="grid-column:span 2;"><strong>Ocupação:</strong> <span style="color:var(--crimson-bright); font-weight:600;">${escapeHtml(occName)}</span></div>
              <div><strong>Idade:</strong> ${sheet.age}</div>
              <div><strong>Sexo:</strong> ${escapeHtml(sheet.gender || "—")}</div>
              <div><strong>Residência:</strong> ${escapeHtml(sheet.residence || "—")}</div>
              <div><strong>Nascimento:</strong> ${escapeHtml(sheet.birthplace || "—")}</div>
            </div>
          </div>

          <!-- BLOCO DIREITO: CARACTERÍSTICAS -->
          <div style="border:1px solid var(--border-ornate); padding:0.9rem; border-radius:4px; background:var(--bg-elevated);">
            <div class="section-banner" style="margin-bottom:0.75rem;">CARACTERÍSTICAS</div>
            <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:0.65rem;">
              ${PRIMARY_CHARACTERISTICS.map((attr) => {
                const f = calcFractions(c[attr.key]);
                return `
                  <div style="border:1px solid var(--border-subtle); padding:0.4rem; border-radius:3px; background:var(--bg-surface);">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.25rem;">
                      <span style="font-family:var(--font-display); font-weight:700; font-size:0.85rem;">${attr.sigla}</span>
                      <button type="button" class="btn btn-sm" data-roll-d100-label="${attr.sigla} (${attr.name})" data-roll-d100-val="${f.total}" style="padding:0.1rem 0.35rem; font-size:0.7rem;">
                        🎲
                      </button>
                    </div>
                    <div class="coc-triple-box">
                      <div class="coc-triple-main" style="font-family:var(--font-mono); font-size:1.15rem; font-weight:700;">
                        ${f.total}
                      </div>
                      <div class="coc-triple-fractions">
                        <div class="coc-fraction-cell"><span class="frac-lbl">½</span><span class="frac-val">${f.half}</span></div>
                        <div class="coc-fraction-cell"><span class="frac-lbl">⅕</span><span class="frac-val">${f.fifth}</span></div>
                      </div>
                    </div>
                  </div>
                `;
              }).join("")}

              <!-- TAXA DE MOVIMENTO -->
              <div style="border:1px solid var(--border-subtle); padding:0.4rem; border-radius:3px; background:var(--bg-surface); display:flex; flex-direction:column; justify-content:space-between;">
                <span style="font-family:var(--font-display); font-weight:700; font-size:0.78rem;">TAXA DE MOV.</span>
                <div style="font-family:var(--font-mono); font-size:1.45rem; font-weight:800; text-align:center; padding:0.3rem 0;">
                  ${d.mov ?? 8}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- TRILHAS DE STATUS: PONTOS DE VIDA, SANIDADE, SORTE E PONTOS DE MAGIA -->
        <div class="status-tracks-grid" style="margin-top:1rem;">
          <!-- PONTOS DE VIDA -->
          <div class="track-card">
            <div class="track-header">
              <span class="track-title" style="color:var(--status-hp);">Pontos de Vida</span>
              <span style="font-family:var(--font-mono); font-size:0.76rem; color:var(--text-secondary);">Máx: ${d.max_hp}</span>
            </div>
            <div class="track-counter">
              <button type="button" class="btn btn-sm" data-stat-delta="hp:-1">−</button>
              <div class="track-val-display" style="color:var(--status-hp);">${d.hp} / ${d.max_hp}</div>
              <button type="button" class="btn btn-sm" data-stat-delta="hp:1">+</button>
            </div>
            <div class="track-flags">
              <label class="flag-check"><input type="checkbox" data-flag-toggle="major_wound" ${d.major_wound ? "checked" : ""} /> Lesão Grave</label>
              <label class="flag-check"><input type="checkbox" data-flag-toggle="unconscious" ${d.unconscious ? "checked" : ""} /> Inconsciente</label>
              <label class="flag-check"><input type="checkbox" data-flag-toggle="dying" ${d.dying ? "checked" : ""} /> Morrendo</label>
            </div>
          </div>

          <!-- SANIDADE -->
          <div class="track-card">
            <div class="track-header">
              <span class="track-title" style="color:var(--status-san);">Sanidade</span>
              <button type="button" class="btn btn-sm" data-roll-d100-label="Teste de Sanidade" data-roll-d100-val="${d.sanity}" style="padding:0.1rem 0.45rem;">
                🎲 Rolar SAN
              </button>
            </div>
            <div class="track-counter">
              <button type="button" class="btn btn-sm" data-stat-delta="sanity:-1">−</button>
              <div class="track-val-display" style="color:var(--status-san);">${d.sanity} / ${d.max_sanity}</div>
              <button type="button" class="btn btn-sm" data-stat-delta="sanity:1">+</button>
            </div>
            <div class="track-flags">
              <span style="font-size:0.7rem; color:var(--text-muted);">Inicial: ${d.starting_sanity}</span>
              <label class="flag-check"><input type="checkbox" data-flag-toggle="temp_insanity" ${d.temp_insanity ? "checked" : ""} /> Insan. Temp.</label>
              <label class="flag-check"><input type="checkbox" data-flag-toggle="indef_insanity" ${d.indef_insanity ? "checked" : ""} /> Insan. Indef.</label>
            </div>
          </div>

          <!-- SORTE -->
          <div class="track-card">
            <div class="track-header">
              <span class="track-title" style="color:var(--status-luck);">Sorte</span>
              <button type="button" class="btn btn-sm" data-roll-d100-label="Teste de Sorte" data-roll-d100-val="${c.luck}" style="padding:0.1rem 0.45rem;">
                🎲 Rolar Sorte
              </button>
            </div>
            <div class="track-counter">
              <button type="button" class="btn btn-sm" data-stat-delta="luck:-1">−</button>
              <div class="track-val-display" style="color:var(--status-luck);">${c.luck}%</div>
              <button type="button" class="btn btn-sm" data-stat-delta="luck:1">+</button>
            </div>
            <div class="track-flags">
              <label class="flag-check"><input type="checkbox" data-flag-toggle="out_of_luck" ${d.out_of_luck ? "checked" : ""} /> Sem Sorte</label>
            </div>
          </div>

          <!-- PONTOS DE MAGIA -->
          <div class="track-card">
            <div class="track-header">
              <span class="track-title" style="color:var(--status-mp);">Pts de Magia</span>
              <span style="font-family:var(--font-mono); font-size:0.76rem; color:var(--text-secondary);">Máx: ${d.max_mp}</span>
            </div>
            <div class="track-counter">
              <button type="button" class="btn btn-sm" data-stat-delta="mp:-1">−</button>
              <div class="track-val-display" style="color:var(--status-mp);">${d.mp} / ${d.max_mp}</div>
              <button type="button" class="btn btn-sm" data-stat-delta="mp:1">+</button>
            </div>
            <div class="track-flags">
              <span style="font-size:0.72rem; color:var(--text-muted);">Regenera 1 pt por hora</span>
            </div>
          </div>
        </div>

        <!-- PERÍCIAS DO INVESTIGADOR -->
        <div class="section-banner">PERÍCIAS DO INVESTIGADOR</div>
        <div class="skills-sheet-grid">
          ${SKILLS_CATALOG.map((sk) => {
            const entry = sheet.skills?.[sk.id] || {
              base_value: getSkillBaseValue(sk, c),
              occupation_points: 0,
              personal_points: 0,
              experience_points: 0,
              is_occupation_skill: false,
              checked_for_improvement: false
            };
            const total = Math.min(
              99,
              (entry.base_value || 0) +
                (entry.occupation_points || 0) +
                (entry.personal_points || 0) +
                (entry.experience_points || 0)
            );
            const frac = calcFractions(total);
            return `
              <div class="skill-row ${entry.is_occupation_skill ? "is-occ" : ""}">
                <input
                  type="checkbox"
                  class="skill-check"
                  title="Marcar para evolução de perícia"
                  data-skill-improve="${sk.id}"
                  ${entry.checked_for_improvement ? "checked" : ""}
                />
                <div class="skill-title" style="cursor:pointer;" data-roll-d100-label="${sk.name}" data-roll-d100-val="${frac.total}">
                  <span>🎲 ${sk.name}</span>
                  <span class="skill-base-tag">(${String(entry.base_value).padStart(2, "0")}%)</span>
                </div>
                <div class="skill-mini-triple">
                  <span>${frac.total}</span>
                  <span>${frac.half}</span>
                  <span>${frac.fifth}</span>
                </div>
              </div>
            `;
          }).join("")}
        </div>

        <!-- ARMAS & COMBATE + REFERÊNCIAS RÁPIDAS -->
        <div style="display:grid; grid-template-columns:2fr 1fr; gap:1rem; margin-top:1.25rem;">
          <div style="border:1px solid var(--border-ornate); padding:0.85rem; border-radius:4px; background:var(--bg-elevated);">
            <div class="section-banner" style="margin-bottom:0.65rem;">ARMAS</div>
            <table style="width:100%; border-collapse:collapse; font-size:0.8rem;">
              <thead>
                <tr style="border-bottom:1px solid var(--border-ornate); text-align:left;">
                  <th style="padding:0.35rem;">Arma</th>
                  <th style="padding:0.35rem;">Regular</th>
                  <th style="padding:0.35rem;">Difícil</th>
                  <th style="padding:0.35rem;">Extremo</th>
                  <th style="padding:0.35rem;">Dano</th>
                  <th style="padding:0.35rem;">Alcance</th>
                  <th style="padding:0.35rem;">Ataques</th>
                  <th style="padding:0.35rem;">Munição</th>
                  <th style="padding:0.35rem;">Defeito</th>
                </tr>
              </thead>
              <tbody>
                ${(sheet.weapons || [])
                  .map((w) => {
                    const wf = calcFractions(w.regular_value || 25);
                    return `
                    <tr style="border-bottom:1px solid var(--border-subtle);">
                      <td style="padding:0.4rem;">
                        <button type="button" class="btn btn-sm" data-roll-d100-label="Ataque: ${escapeHtml(w.name)}" data-roll-d100-val="${wf.total}" style="padding:0.15rem 0.45rem;">
                          🎲 ${escapeHtml(w.name)}
                        </button>
                      </td>
                      <td style="padding:0.4rem; font-family:var(--font-mono); font-weight:700;">${wf.total}%</td>
                      <td style="padding:0.4rem; font-family:var(--font-mono);">${wf.half}%</td>
                      <td style="padding:0.4rem; font-family:var(--font-mono);">${wf.fifth}%</td>
                      <td style="padding:0.4rem; font-family:var(--font-mono); color:var(--crimson-bright);">${escapeHtml(w.damage)}</td>
                      <td style="padding:0.4rem;">${escapeHtml(w.range)}</td>
                      <td style="padding:0.4rem;">${escapeHtml(w.attacks_per_round)}</td>
                      <td style="padding:0.4rem;">${escapeHtml(w.ammo)}</td>
                      <td style="padding:0.4rem;">${escapeHtml(w.malfunction)}</td>
                    </tr>
                  `;
                  })
                  .join("")}
              </tbody>
            </table>
          </div>

          <div style="border:1px solid var(--border-ornate); padding:0.85rem; border-radius:4px; background:var(--bg-elevated);">
            <div class="section-banner" style="margin-bottom:0.65rem;">COMBATE</div>
            <div style="display:flex; flex-direction:column; gap:0.55rem;">
              <div class="stat-pill" style="display:flex; justify-content:space-between; align-items:center; padding:0.5rem 0.75rem;">
                <span class="lbl">Bônus de Dano (BD)</span>
                <span class="val" style="color:var(--crimson-bright);">${d.damage_bonus || "0"}</span>
              </div>
              <div class="stat-pill" style="display:flex; justify-content:space-between; align-items:center; padding:0.5rem 0.75rem;">
                <span class="lbl">Corpo (Build)</span>
                <span class="val">${d.build ?? 0}</span>
              </div>
              <div class="stat-pill" style="display:flex; justify-content:space-between; align-items:center; padding:0.5rem 0.75rem;">
                <span class="lbl">Esquiva</span>
                <span class="val">${dodgeFrac.total}% | ${dodgeFrac.half}% | ${dodgeFrac.fifth}%</span>
              </div>
            </div>
          </div>
        </div>

        <!-- NÍVEIS DE SUCESSO E REFERÊNCIAS RÁPIDAS DA FICHA -->
        <div style="margin-top:1rem; padding:0.8rem; border:1px solid var(--border-subtle); background:var(--bg-elevated); border-radius:4px; font-size:0.77rem; color:var(--text-secondary);">
          <strong>NÍVEIS DE SUCESSO:</strong>
          Desastre (100 ou 96+) • Fracasso (&gt; Perícia) • Regular (≤ Perícia) • Difícil (≤ ½ da Perícia) • Extremo (≤ ⅕ da Perícia) • Crítico (01)
          <br />
          <strong>REFERÊNCIAS RÁPIDAS:</strong> Primeiros Socorros cura 1 PV | Medicina cura +1D3 PVs | Lesão Grave = perda ≥ ½ do PV máx em um único ataque.
        </div>
      </div>
    `
        : `
      <!-- ================= VERSO DA FICHA EDITÁVEL ================= -->
      <div class="ornate-panel">
        <div class="section-banner">ANTECEDENTES & PERSONALIDADE DO INVESTIGADOR</div>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(340px, 1fr)); gap:1rem; margin-bottom:1.25rem;">
          ${BACKSTORY_CATEGORIES.map((cat) => {
            const entry = sheet.backstory?.[cat.id] || { entry_text: "", is_key_connection: false };
            return `
              <div style="background:var(--bg-elevated); border:1px solid ${
                entry.is_key_connection ? "var(--status-luck)" : "var(--border-ornate)"
              }; padding:0.8rem; border-radius:4px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.35rem;">
                  <strong style="font-family:var(--font-display); font-size:0.85rem;">${cat.title}</strong>
                  ${
                    entry.is_key_connection
                      ? `<span class="char-formula-badge" style="color:var(--status-luck);">★ Conexão-Chave</span>`
                      : ""
                  }
                </div>
                <textarea rows="2" data-sheet-backstory="${cat.id}" placeholder="${escapeHtml(cat.placeholder)}">${escapeHtml(
              entry.entry_text
            )}</textarea>
              </div>
            `;
          }).join("")}
        </div>

        <div style="display:grid; grid-template-columns:1.5fr 1fr; gap:1rem;">
          <div style="background:var(--bg-elevated); border:1px solid var(--border-ornate); padding:0.9rem; border-radius:4px;">
            <div class="section-banner" style="margin-bottom:0.65rem;">EQUIPAMENTO E PERTENCES</div>
            <textarea rows="5" id="sheetEquipmentTxt">${escapeHtml(sheet.personal_equipment || "")}</textarea>
          </div>

          <div style="background:var(--bg-elevated); border:1px solid var(--border-ornate); padding:0.9rem; border-radius:4px;">
            <div class="section-banner" style="margin-bottom:0.65rem;">DINHEIRO E RECURSOS</div>
            <div style="display:flex; flex-direction:column; gap:0.55rem; font-size:0.88rem;">
              <div><strong>Nível de Crédito:</strong> ${f.credit_rating ?? 0}% (${escapeHtml(f.economic_class || "Pobretão")})</div>
              <div><strong>Nível de Gastos:</strong> <span style="color:var(--status-success); font-family:var(--font-mono);">${escapeHtml(f.spending_level || "$0.50")}</span></div>
              <div><strong>Dinheiro em Mãos:</strong> <span style="font-family:var(--font-mono);">${escapeHtml(f.cash || "$0.50")}</span></div>
              <div><strong>Patrimônio:</strong> <span style="font-family:var(--font-mono);">${escapeHtml(f.assets || "Nenhum")}</span></div>
            </div>
          </div>
        </div>
      </div>
    `
    }
  `;

  // Eventos da Ficha Editável
  root.querySelector("#btnBackToDash").addEventListener("click", async () => {
    state.view = "dashboard";
    state.investigators = await listInvestigators();
    render();
  });

  root.querySelector("#btnTabFront").addEventListener("click", () => {
    state.sheetTab = "front";
    render();
  });

  root.querySelector("#btnTabBack").addEventListener("click", () => {
    state.sheetTab = "back";
    render();
  });

  root.querySelector("#btnPrintSheet").addEventListener("click", () => {
    window.print();
  });

  // Roladores 1D100 na ficha
  root.querySelectorAll("[data-roll-d100-label]").forEach((el) => {
    el.addEventListener("click", () => {
      const label = el.getAttribute("data-roll-d100-label");
      const val = Number(el.getAttribute("data-roll-d100-val")) || 0;
      triggerD100Toast(label, val);
    });
  });

  // Contadores +/- de PV, Sanidade, Sorte e PM
  root.querySelectorAll("[data-stat-delta]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const [stat, deltaStr] = btn.getAttribute("data-stat-delta").split(":");
      const delta = Number(deltaStr);
      if (stat === "hp") {
        sheet.derived.hp = Math.max(0, Math.min(sheet.derived.max_hp, (sheet.derived.hp || 0) + delta));
      } else if (stat === "sanity") {
        sheet.derived.sanity = Math.max(0, Math.min(sheet.derived.max_sanity, (sheet.derived.sanity || 0) + delta));
      } else if (stat === "mp") {
        sheet.derived.mp = Math.max(0, Math.min(sheet.derived.max_mp, (sheet.derived.mp || 0) + delta));
      } else if (stat === "luck") {
        sheet.characteristics.luck = Math.max(0, Math.min(99, (sheet.characteristics.luck || 0) + delta));
      }
      await saveInvestigator(sheet);
      render();
    });
  });

  // Flags de Lesão Grave, Insanidade, etc.
  root.querySelectorAll("[data-flag-toggle]").forEach((chk) => {
    chk.addEventListener("change", async () => {
      const flag = chk.getAttribute("data-flag-toggle");
      sheet.derived[flag] = chk.checked;
      await saveInvestigator(sheet);
    });
  });

  // Checkboxes de evolução de perícia
  root.querySelectorAll("[data-skill-improve]").forEach((chk) => {
    chk.addEventListener("change", async () => {
      const skId = chk.getAttribute("data-skill-improve");
      if (!sheet.skills[skId]) {
        const def = SKILLS_CATALOG.find((s) => s.id === skId);
        sheet.skills[skId] = {
          skill_id: skId,
          base_value: getSkillBaseValue(def, sheet.characteristics),
          occupation_points: 0,
          personal_points: 0,
          experience_points: 0,
          is_occupation_skill: false,
          checked_for_improvement: false
        };
      }
      sheet.skills[skId].checked_for_improvement = chk.checked;
      await saveInvestigator(sheet);
    });
  });

  // Edição em tempo real do Verso da Ficha
  root.querySelectorAll("[data-sheet-backstory]").forEach((area) => {
    area.addEventListener("change", async () => {
      const catId = area.getAttribute("data-sheet-backstory");
      if (!sheet.backstory[catId]) {
        sheet.backstory[catId] = { entry_text: "", is_key_connection: false };
      }
      sheet.backstory[catId].entry_text = area.value;
      await saveInvestigator(sheet);
    });
  });

  root.querySelector("#sheetEquipmentTxt")?.addEventListener("change", async (e) => {
    sheet.personal_equipment = e.target.value;
    await saveInvestigator(sheet);
  });
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

