// ============================================================================
// CLIENTE SUPABASE + PERSISTÊNCIA RELACIONAL & FALLBACK LOCAL (supabaseClient.js)
// ============================================================================

import { getSupabaseConfig, isSupabaseConfigured } from "./config.js";

let supabaseInstance = null;
const LOCAL_DB_KEY = "coc7e_local_investigators_v1";

export async function initSupabase() {
  if (!isSupabaseConfigured()) {
    supabaseInstance = null;
    return null;
  }

  const { url, anonKey } = getSupabaseConfig();
  try {
    const { createClient } = await import(
      "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm"
    );
    supabaseInstance = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
    return supabaseInstance;
  } catch (err) {
    console.error("Falha ao inicializar @supabase/supabase-js:", err);
    supabaseInstance = null;
    return null;
  }
}

export function getClient() {
  return supabaseInstance;
}

// ============================================================================
// AUTENTICAÇÃO (Supabase Auth)
// ============================================================================

export async function getCurrentUser() {
  if (!supabaseInstance) return null;
  const { data, error } = await supabaseInstance.auth.getUser();
  if (error) return null;
  return data?.user || null;
}

export async function signInWithEmail(email, password) {
  if (!supabaseInstance) throw new Error("Supabase ainda não está configurado.");
  const { data, error } = await supabaseInstance.auth.signInWithPassword({
    email,
    password
  });
  if (error) throw error;
  return data;
}

export async function signUpWithEmail(email, password) {
  if (!supabaseInstance) throw new Error("Supabase ainda não está configurado.");
  const { data, error } = await supabaseInstance.auth.signUp({
    email,
    password
  });
  if (error) throw error;
  return data;
}

export async function signOutUser() {
  if (!supabaseInstance) return;
  const { error } = await supabaseInstance.auth.signOut();
  if (error) throw error;
}

// ============================================================================
// ARMAZENAMENTO LOCAL (Para uso antes de vincular o Supabase no GitHub Pages)
// ============================================================================

export function getLocalInvestigators() {
  try {
    const raw = localStorage.getItem(LOCAL_DB_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalInvestigatorsList(list) {
  localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(list));
}

// ============================================================================
// CRUD COMPLETO DE INVESTIGADORES (Supabase Relacional ou Modo Local)
// ============================================================================

export async function listInvestigators() {
  const user = await getCurrentUser();
  if (!supabaseInstance || !user) {
    return getLocalInvestigators().sort(
      (a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at)
    );
  }

  const { data: invs, error } = await supabaseInstance
    .from("investigators")
    .select(`
      *,
      investigator_characteristics (*),
      investigator_derived (*),
      investigator_finances (*),
      investigator_skills (*),
      investigator_backstory (*),
      investigator_weapons (*)
    `)
    .order("updated_at", { ascending: false });

  if (error) throw error;

  return (invs || []).map(normalizeFromSupabase);
}

export async function getInvestigatorById(id) {
  const user = await getCurrentUser();
  if (!supabaseInstance || !user) {
    return getLocalInvestigators().find((item) => item.id === id) || null;
  }

  const { data, error } = await supabaseInstance
    .from("investigators")
    .select(`
      *,
      investigator_characteristics (*),
      investigator_derived (*),
      investigator_finances (*),
      investigator_skills (*),
      investigator_backstory (*),
      investigator_weapons (*)
    `)
    .eq("id", id)
    .single();

  if (error) throw error;
  return normalizeFromSupabase(data);
}

export async function saveInvestigator(sheet) {
  const user = await getCurrentUser();
  const nowIso = new Date().toISOString();

  // Caso ainda não esteja logado no Supabase, salva no LocalStorage
  if (!supabaseInstance || !user) {
    const list = getLocalInvestigators();
    const id = sheet.id || crypto.randomUUID();
    const record = {
      ...sheet,
      id,
      storage: "local",
      created_at: sheet.created_at || nowIso,
      updated_at: nowIso
    };
    const idx = list.findIndex((i) => i.id === id);
    if (idx >= 0) {
      list[idx] = record;
    } else {
      list.unshift(record);
    }
    saveLocalInvestigatorsList(list);
    return record;
  }

  // Salvamento relacional nas 7 tabelas do schema.sql no Supabase
  const invPayload = {
    user_id: user.id,
    name: sheet.name,
    player_name: sheet.player_name || "",
    age: Number(sheet.age) || 25,
    gender: sheet.gender || "",
    occupation_id: sheet.occupation_id || null,
    custom_occupation_name: sheet.custom_occupation_name || "",
    era: sheet.era || "1920",
    residence: sheet.residence || "",
    birthplace: sheet.birthplace || "",
    creation_step: 5,
    is_completed: true,
    personal_equipment: sheet.personal_equipment || "",
    fellow_investigators: sheet.fellow_investigators || []
  };

  let investigatorId = sheet.id && !String(sheet.id).startsWith("local-") ? sheet.id : undefined;

  if (investigatorId) {
    const { error: updErr } = await supabaseInstance
      .from("investigators")
      .upsert({ id: investigatorId, ...invPayload });
    if (updErr) throw updErr;
  } else {
    const { data: inserted, error: insErr } = await supabaseInstance
      .from("investigators")
      .insert(invPayload)
      .select("id")
      .single();
    if (insErr) throw insErr;
    investigatorId = inserted.id;
  }

  // 2. investigator_characteristics
  const c = sheet.characteristics;
  const { error: charErr } = await supabaseInstance
    .from("investigator_characteristics")
    .upsert({
      investigator_id: investigatorId,
      str: Number(c.str) || 0,
      con: Number(c.con) || 0,
      siz: Number(c.siz) || 0,
      dex: Number(c.dex) || 0,
      app: Number(c.app) || 0,
      int: Number(c.int) || 0,
      pow: Number(c.pow) || 0,
      edu: Number(c.edu) || 0,
      luck: Number(c.luck) || 0,
      starting_luck: Number(c.starting_luck ?? c.luck) || 0
    });
  if (charErr) throw charErr;

  // 3. investigator_derived
  const d = sheet.derived;
  const { error: derErr } = await supabaseInstance
    .from("investigator_derived")
    .upsert({
      investigator_id: investigatorId,
      hp: Number(d.hp) || 1,
      max_hp: Number(d.max_hp) || 1,
      mp: Number(d.mp) || 0,
      max_mp: Number(d.max_mp) || 0,
      sanity: Number(d.sanity) || 0,
      starting_sanity: Number(d.starting_sanity) || 0,
      max_sanity: Number(d.max_sanity) || 99,
      mov: Number(d.mov) || 8,
      build: Number(d.build) || 0,
      damage_bonus: String(d.damage_bonus || "0"),
      major_wound: Boolean(d.major_wound),
      unconscious: Boolean(d.unconscious),
      dying: Boolean(d.dying),
      temp_insanity: Boolean(d.temp_insanity),
      indef_insanity: Boolean(d.indef_insanity),
      out_of_luck: Boolean(d.out_of_luck)
    });
  if (derErr) throw derErr;

  // 4. investigator_finances
  const f = sheet.finances;
  const { error: finErr } = await supabaseInstance
    .from("investigator_finances")
    .upsert({
      investigator_id: investigatorId,
      credit_rating: Number(f.credit_rating) || 0,
      economic_class: f.economic_class || "Pobretão",
      cash: f.cash || "$0.50",
      assets: f.assets || "Nenhum",
      spending_level: f.spending_level || "$0.50"
    });
  if (finErr) throw finErr;

  // 5. investigator_skills (Recria lista limpa do investigador)
  await supabaseInstance
    .from("investigator_skills")
    .delete()
    .eq("investigator_id", investigatorId);

  const skillRows = Object.entries(sheet.skills || {}).map(([skillId, s]) => ({
    investigator_id: investigatorId,
    skill_id: skillId,
    specialization: s.specialization || "",
    base_value: Number(s.base_value) || 0,
    occupation_points: Number(s.occupation_points) || 0,
    personal_points: Number(s.personal_points) || 0,
    experience_points: Number(s.experience_points) || 0,
    is_occupation_skill: Boolean(s.is_occupation_skill),
    checked_for_improvement: Boolean(s.checked_for_improvement)
  }));

  if (skillRows.length > 0) {
    const { error: skErr } = await supabaseInstance
      .from("investigator_skills")
      .insert(skillRows);
    if (skErr) throw skErr;
  }

  // 6. investigator_backstory
  await supabaseInstance
    .from("investigator_backstory")
    .delete()
    .eq("investigator_id", investigatorId);

  const backstoryRows = Object.entries(sheet.backstory || {}).map(([cat, b]) => ({
    investigator_id: investigatorId,
    category: cat,
    entry_text: b.entry_text || "",
    is_key_connection: Boolean(b.is_key_connection)
  }));

  if (backstoryRows.length > 0) {
    const { error: bsErr } = await supabaseInstance
      .from("investigator_backstory")
      .insert(backstoryRows);
    if (bsErr) throw bsErr;
  }

  // 7. investigator_weapons
  await supabaseInstance
    .from("investigator_weapons")
    .delete()
    .eq("investigator_id", investigatorId);

  const weaponRows = (sheet.weapons || []).map((w, idx) => ({
    investigator_id: investigatorId,
    name: w.name || "Desarmado",
    skill_id: w.skill_id || "fighting_brawl",
    regular_value: Number(w.regular_value) || 25,
    damage: w.damage || "1D3 + BD",
    range: w.range || "Toque",
    attacks_per_round: String(w.attacks_per_round || "1"),
    ammo: w.ammo || "—",
    malfunction: w.malfunction || "—",
    sort_order: idx
  }));

  if (weaponRows.length > 0) {
    const { error: wpErr } = await supabaseInstance
      .from("investigator_weapons")
      .insert(weaponRows);
    if (wpErr) throw wpErr;
  }

  return await getInvestigatorById(investigatorId);
}

export async function deleteInvestigator(id) {
  const user = await getCurrentUser();
  if (!supabaseInstance || !user) {
    const filtered = getLocalInvestigators().filter((i) => i.id !== id);
    saveLocalInvestigatorsList(filtered);
    return;
  }

  const { error } = await supabaseInstance
    .from("investigators")
    .delete()
    .eq("id", id);

  if (error) throw error;
}

export async function syncLocalToSupabase() {
  const user = await getCurrentUser();
  if (!supabaseInstance || !user) {
    throw new Error("Faça login no Supabase primeiro para sincronizar suas fichas.");
  }
  const locals = getLocalInvestigators();
  let count = 0;
  for (const item of locals) {
    const copy = { ...item, id: undefined };
    await saveInvestigator(copy);
    count++;
  }
  saveLocalInvestigatorsList([]);
  return count;
}

function normalizeFromSupabase(row) {
  const chars = Array.isArray(row.investigator_characteristics)
    ? row.investigator_characteristics[0]
    : row.investigator_characteristics || {};

  const derived = Array.isArray(row.investigator_derived)
    ? row.investigator_derived[0]
    : row.investigator_derived || {};

  const finances = Array.isArray(row.investigator_finances)
    ? row.investigator_finances[0]
    : row.investigator_finances || {};

  const skillsMap = {};
  for (const sk of row.investigator_skills || []) {
    skillsMap[sk.skill_id] = {
      skill_id: sk.skill_id,
      specialization: sk.specialization || "",
      base_value: sk.base_value,
      occupation_points: sk.occupation_points,
      personal_points: sk.personal_points,
      experience_points: sk.experience_points || 0,
      is_occupation_skill: sk.is_occupation_skill,
      checked_for_improvement: sk.checked_for_improvement
    };
  }

  const backstoryMap = {};
  for (const bs of row.investigator_backstory || []) {
    backstoryMap[bs.category] = {
      entry_text: bs.entry_text || "",
      is_key_connection: Boolean(bs.is_key_connection)
    };
  }

  return {
    id: row.id,
    storage: "supabase",
    name: row.name,
    player_name: row.player_name || "",
    age: row.age,
    gender: row.gender || "",
    occupation_id: row.occupation_id,
    custom_occupation_name: row.custom_occupation_name || "",
    era: row.era || "1920",
    residence: row.residence || "",
    birthplace: row.birthplace || "",
    personal_equipment: row.personal_equipment || "",
    fellow_investigators: row.fellow_investigators || [],
    created_at: row.created_at,
    updated_at: row.updated_at,
    characteristics: chars,
    derived,
    finances,
    skills: skillsMap,
    backstory: backstoryMap,
    weapons: (row.investigator_weapons || []).sort((a, b) => a.sort_order - b.sort_order)
  };
}

