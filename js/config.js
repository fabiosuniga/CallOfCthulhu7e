// ============================================================================
// CONFIGURAÇÃO DO SUPABASE (Seguro para GitHub Pages - Apenas Chaves Públicas)
// NUNCA coloque a chave "service_role" ou chaves secretas neste arquivo!
// ============================================================================

export const DEFAULT_SUPABASE_CONFIG = {
  // Configurado para o projeto Supabase vinculado ao GitHub Pages
  url: "https://vwvqiwfgeblseehxsmqr.supabase.co",
  anonKey: "sb_publishable_OJPNRLkO4r21yF4s2Iy61g_jgEXA0Hm"
};

const STORAGE_KEY = "coc7e_supabase_config";

export function getSupabaseConfig() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.url && parsed.anonKey) {
        return {
          url: parsed.url.trim(),
          anonKey: parsed.anonKey.trim(),
          source: "localStorage"
        };
      }
    }
  } catch (err) {
    console.warn("Erro ao ler configuração do Supabase no localStorage:", err);
  }

  return {
    url: (DEFAULT_SUPABASE_CONFIG.url || "").trim(),
    anonKey: (DEFAULT_SUPABASE_CONFIG.anonKey || "").trim(),
    source: "config.js"
  };
}

export function saveSupabaseConfig(url, anonKey) {
  const cleanUrl = (url || "").trim();
  const cleanKey = (anonKey || "").trim();
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ url: cleanUrl, anonKey: cleanKey })
  );
}

export function clearSupabaseConfig() {
  localStorage.removeItem(STORAGE_KEY);
}

export function isSupabaseConfigured() {
  const cfg = getSupabaseConfig();
  return Boolean(cfg.url && cfg.anonKey && cfg.url.startsWith("https://"));
}

