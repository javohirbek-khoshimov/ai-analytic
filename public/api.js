// api.js — GET-only, paging, exact count, Realtime (ALL public tables)
// Hardened: safe paging, optional tables, explicit realtime on key tables.
window.Api = (() => {
  let client = null;
  const init = () =>
    (client ||= supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY));

  // ---- tiny helpers ----
  const noop = () => {};

  // Some projects have extra tables (e.g., rating_log). Read them if present,
  // but never crash if they don't exist.
  async function selectAllMaybe(table, columns, buildQuery, step = 1000, max = 200000) {
    const c = init();
    let out = [];
    try {
      for (let from = 0; from < max; from += step) {
        let q = c.from(table).select(columns);
        if (buildQuery) q = buildQuery(q);
        q = q.range(from, from + step - 1);
        const { data, error } = await q;
        if (error) throw error;
        if (data?.length) out.push(...data);
        if (!data || data.length < step) break;
      }
    } catch (e) {
      console.warn(`[Api] optional table "${table}" skip:`, e?.message || e);
      // fall through with []
    }
    return out;
  }

  async function selectAll(table, columns, buildQuery, step = 1000, max = 200000) {
    // required table version (throws if missing)
    const c = init();
    let out = [];
    for (let from = 0; from < max; from += step) {
      let q = c.from(table).select(columns);
      if (buildQuery) q = buildQuery(q);
      q = q.range(from, from + step - 1);
      const { data, error } = await q;
      if (error) throw error;
      if (data?.length) out.push(...data);
      if (!data || data.length < step) break;
    }
    return out;
  }

  async function countExact(table, columns = 'id', filterFn) {
    const c = init();
    let q = c.from(table).select(columns, { count: 'exact', head: true });
    if (filterFn) q = filterFn(q);
    const { count, error } = await q;
    if (error) throw error;
    return count ?? 0;
  }

  // ---------------- USERS ----------------
  const fetchUsersAll   = () => selectAll('users', 'id, lan, place, age, gender');
  const countUsersExact = () => countExact('users', 'id');

  // ---------------- AISUM (normalize) ----------------
  const fetchAisumAll = async () => {
    const app = await selectAll(
      'aisum_app',
      'created_at, ai_message, topic, gender, chat_id',
      q => q.order('created_at', { ascending: true })
    );
    const tg  = await selectAll(
      'aisum_tgbot',
      'created_at, ai_message, topic, doctor, chat_id',
      q => q.order('created_at', { ascending: true })
    );
    // teng maydonlarga keltirish
    const appN = app.map(r => ({ ...r, doctor: null }));
    const tgN  = tg .map(r => ({ ...r, gender: null }));
    return [...appN, ...tgN];
  };

  const countAIMsgExact = async () => {
    const c1 = await countExact('aisum_app',  'ai_message', q => q.not('ai_message','is',null));
    const c2 = await countExact('aisum_tgbot','ai_message', q => q.not('ai_message','is',null));
    return c1 + c2;
  };

  // ---------------- RATING ----------------
  // Summary (aggregated per user)
  const fetchRatingsAll = () =>
    selectAll('rating', 'id, name, chat_count, rating_all, average');

  // Optional: raw vote stream (if you later add a rating_log table)
  const fetchRatingLog = () =>
    selectAllMaybe('rating_log', 'id, user_id, score, created_at', q => q.order('created_at', { ascending: true }));

  // ---------------- Chat history (optional, for Avg Chat Length) ----------------
  const fetchChatApp = () =>
    selectAllMaybe('chat_history_app', 'created_at, chat_id, ai_message, human_message');
  const fetchChatTg  = () =>
    selectAllMaybe('chat_history_tg',  'created_at, chat_id, ai_message, human_message');

  // ---------------- Realtime: subscribe to key public tables ----------------
  function subscribeRealtimeAll(onChange = noop) {
    const c = init();
    const tables = [
      'users',
      'rating',
      'aisum_app',
      'aisum_tgbot',
      'chat_history_app',
      'chat_history_tg',
      // add if exists (safe, missing tables will just be ignored by PostgREST)
      'rating_log',
    ];

    // Create one channel for all — cheaper than many channels.
    const ch = c
      .channel('realtime:public_multi')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: '*' }, // wildcard (keeps it future-proof)
        () => onChange()
      )
      .subscribe((status) => console.log('[RT]', status));
    return () => { try { c.removeChannel(ch); } catch (_) {} };
  }

  return {
    // pulls
    fetchUsersAll, countUsersExact,
    fetchAisumAll, countAIMsgExact,
    fetchRatingsAll, fetchRatingLog,
    fetchChatApp, fetchChatTg,
    // realtime
    subscribeRealtimeAll,
  };
})();
