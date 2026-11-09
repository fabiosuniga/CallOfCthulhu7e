// ============================================================================
// CLIENTE SUPABASE + PERSISTÊNCIA RELACIONAL, MESAS & REALTIME (supabaseClient.js)
// ============================================================================

import { getSupabaseConfig, isSupabaseConfigured } from "./config.js";

let supabaseInstance = null;
let activeRealtimeChannel = null;
const LOCAL_DB_KEY = "coc7e_local_investigators_v1";

export async function initSupabase() {
  if (!isSupabaseConfigured()) {
    supabaseInstance = null;
    return null;
  }

  if (supabaseInstance) {
    return supabaseInstance;
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
  if (!supabaseInstance) throw new Error("Supabase não está inicializado.");
  const { data, error } = await supabaseInstance.auth.signInWithPassword({
    email,
    password
  });
  if (error) throw error;
  return data;
}

export async function signUpWithEmail(email, password) {
  if (!supabaseInstance) throw new Error("Supabase não está inicializado.");
  const { data, error } = await supabaseInstance.auth.signUp({
    email,
    password
  });
  if (error) throw error;
  return data;
}

export async function signOutUser() {
  if (!supabaseInstance) return;
  await unsubscribeFromCampaignRoom();
  const { error } = await supabaseInstance.auth.signOut();
  if (error) throw error;
}

// ============================================================================
// ARMAZENAMENTO LOCAL (Auxiliar)
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
// CRUD DE INVESTIGADORES DO USUÁRIO LOGADO
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
    .eq("user_id", user.id)
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

  const invPayload = {
    user_id: sheet.user_id || user.id,
    name: sheet.name,
    player_name: sheet.player_name || user.email?.split("@")[0] || "",
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

  // 5. investigator_skills
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

// Atualização rápida somente dos atributos derivados/sorte durante sessão ao vivo
export async function updateLiveInvestigatorStatus(sheet) {
  const user = await getCurrentUser();
  if (!supabaseInstance || !user || !sheet?.id) return;

  const d = sheet.derived;
  const c = sheet.characteristics;

  await Promise.all([
    supabaseInstance.from("investigator_derived").upsert({
      investigator_id: sheet.id,
      hp: Number(d.hp) || 0,
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
    }),
    supabaseInstance
      .from("investigator_characteristics")
      .update({ luck: Number(c.luck) || 0 })
      .eq("investigator_id", sheet.id)
  ]);
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
    throw new Error("Faça login primeiro para sincronizar suas fichas.");
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

// ============================================================================
// MESAS / CAMPANHAS AO VIVO & SUPABASE REALTIME
// ============================================================================

function generateInviteCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function listMyCampaigns() {
  const user = await getCurrentUser();
  if (!supabaseInstance || !user) return [];

  // Busca mesas onde o usuário é o Guardião ou onde é participante
  const { data: memberRows } = await supabaseInstance
    .from("campaign_members")
    .select("campaign_id")
    .eq("user_id", user.id);

  const memberCampIds = (memberRows || []).map((r) => r.campaign_id);

  const { data: allCamps, error } = await supabaseInstance
    .from("campaigns")
    .select(`
      *,
      campaign_members (id, user_id, investigator_id, role)
    `)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (allCamps || []).filter(
    (c) => c.keeper_id === user.id || memberCampIds.includes(c.id)
  );
}

export async function createCampaign({ name, description, era }) {
  const user = await getCurrentUser();
  if (!supabaseInstance || !user) throw new Error("Usuário não autenticado.");

  const invite_code = generateInviteCode();
  const { data, error } = await supabaseInstance
    .from("campaigns")
    .insert({
      keeper_id: user.id,
      keeper_email: user.email,
      name: name.trim(),
      description: (description || "").trim(),
      era: era || "1920",
      invite_code
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function joinCampaignByCode(inviteCode, investigatorId) {
  const user = await getCurrentUser();
  if (!supabaseInstance || !user) throw new Error("Usuário não autenticado.");

  const cleanCode = (inviteCode || "").trim().toUpperCase();
  const { data: camp, error: findErr } = await supabaseInstance
    .from("campaigns")
    .select("*")
    .eq("invite_code", cleanCode)
    .single();

  if (findErr || !camp) {
    throw new Error("Nenhuma mesa encontrada com este código de convite.");
  }

  // Verifica se o usuário já possui vínculo nessa mesa e atualiza ou insere
  const { data: existing } = await supabaseInstance
    .from("campaign_members")
    .select("id")
    .eq("campaign_id", camp.id)
    .eq("user_id", user.id);

  if (existing && existing.length > 0) {
    const { error: updErr } = await supabaseInstance
      .from("campaign_members")
      .update({ investigator_id: investigatorId })
      .eq("id", existing[0].id);
    if (updErr) throw updErr;
  } else {
    const { error: insErr } = await supabaseInstance
      .from("campaign_members")
      .insert({
        campaign_id: camp.id,
        user_id: user.id,
        investigator_id: investigatorId,
        role: camp.keeper_id === user.id ? "keeper" : "player"
      });
    if (insErr) throw insErr;
  }

  return camp;
}

export async function deleteCampaign(campaignId) {
  if (!supabaseInstance) return;
  const { error } = await supabaseInstance
    .from("campaigns")
    .delete()
    .eq("id", campaignId);
  if (error) throw error;
}

export async function leaveCampaign(campaignId) {
  const user = await getCurrentUser();
  if (!supabaseInstance || !user) return;
  const { error } = await supabaseInstance
    .from("campaign_members")
    .delete()
    .eq("campaign_id", campaignId)
    .eq("user_id", user.id);
  if (error) throw error;
}

export async function getCampaignRoomData(campaignId) {
  if (!supabaseInstance) throw new Error("Supabase não inicializado.");

  const { data: campaign, error: campErr } = await supabaseInstance
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .single();
  if (campErr) throw campErr;

  const { data: members, error: memErr } = await supabaseInstance
    .from("campaign_members")
    .select(`
      id,
      user_id,
      role,
      investigator_id,
      investigators (
        *,
        investigator_characteristics (*),
        investigator_derived (*),
        investigator_finances (*),
        investigator_skills (*)
      )
    `)
    .eq("campaign_id", campaignId);
  if (memErr) throw memErr;

  const { data: messages, error: msgErr } = await supabaseInstance
    .from("campaign_messages")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: true })
    .limit(100);
  if (msgErr) throw msgErr;

  const normalizedMembers = (members || []).map((m) => ({
    member_id: m.id,
    user_id: m.user_id,
    role: m.role,
    investigator_id: m.investigator_id,
    investigator: m.investigators ? normalizeFromSupabase(m.investigators) : null
  }));

  return {
    campaign,
    members: normalizedMembers,
    messages: messages || []
  };
}

export async function sendCampaignMessage({
  campaign_id,
  sender_name,
  sender_role = "player",
  message_type = "chat",
  content = "",
  roll_result = null,
  roll_target = null,
  roll_level = null,
  roll_code = null,
  is_keeper_secret = false
}) {
  const user = await getCurrentUser();
  if (!supabaseInstance || !user) throw new Error("Usuário não autenticado.");

  const { data, error } = await supabaseInstance
    .from("campaign_messages")
    .insert({
      campaign_id,
      user_id: user.id,
      sender_name,
      sender_role,
      message_type,
      content,
      roll_result,
      roll_target,
      roll_level,
      roll_code,
      is_keeper_secret
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function subscribeToCampaignRoom(campaignId, onRoomChange) {
  if (!supabaseInstance) return;
  await unsubscribeFromCampaignRoom();

  activeRealtimeChannel = supabaseInstance
    .channel(`coc7e_room_${campaignId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "campaign_messages",
        filter: `campaign_id=eq.${campaignId}`
      },
      () => onRoomChange("messages")
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "campaign_members",
        filter: `campaign_id=eq.${campaignId}`
      },
      () => onRoomChange("members")
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "investigator_derived"
      },
      () => onRoomChange("status")
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "investigator_characteristics"
      },
      () => onRoomChange("status")
    )
    .subscribe();
}

export async function unsubscribeFromCampaignRoom() {
  if (supabaseInstance && activeRealtimeChannel) {
    await supabaseInstance.removeChannel(activeRealtimeChannel);
    activeRealtimeChannel = null;
  }
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
    user_id: row.user_id,
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
