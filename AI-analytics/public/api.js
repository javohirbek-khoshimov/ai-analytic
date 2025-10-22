// api.js — GET-only, paging, exact count, Realtime (ALL public tables)
window.Api = (() => {
  let client = null;
  const init = () =>
    (client ||= supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY));

  // ---- exact count (HEAD) ----
  async function countExact(table, columns = 'id', filterFn) {
    const c = init();
    let q = c.from(table).select(columns, { count: 'exact', head: true });
    if (filterFn) q = filterFn(q);
    const { count, error } = await q;
    if (error) throw error;
    return count ?? 0;
  }

  // ---- paging select ----
  async function selectAll(table, columns, buildQuery, step = 1000, max = 200000) {
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

  // ---- USERS ----
  const fetchUsersAll   = () => selectAll('users', 'id, lan, place, age, gender');
  const countUsersExact = () => countExact('users', 'id');

  // ---- AISUM (normalize) ----
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
    const appN = app.map(r => ({ ...r, doctor: null }));     // app’da doctor yo‘q
    const tgN  = tg .map(r => ({ ...r, gender: null }));     // tgbot’da gender yo‘q
    return [...appN, ...tgN];
  };

  const countAIMsgExact = async () => {
    const c1 = await countExact('aisum_app',  'ai_message', q => q.not('ai_message','is',null));
    const c2 = await countExact('aisum_tgbot','ai_message', q => q.not('ai_message','is',null));
    return c1 + c2;
  };

  // ---- RATING ----
  const fetchRatingsAll = () => selectAll('rating', 'name, chat_count, average, rating_all');

  // ---- Chat history (optional) ----
  const fetchChatApp = () => selectAll('chat_history_app', 'created_at, chat_id, ai_message, human_message');
  const fetchChatTg  = () => selectAll('chat_history_tg',  'created_at, chat_id, ai_message, human_message');

  // ---- Realtime: butun public sxema ----
  function subscribeRealtimeAll(onChange) {
    const c = init();
    const ch = c
      .channel('realtime:public_all')
      .on('postgres_changes', { event: '*', schema: 'public' }, () => {
        if (typeof onChange === 'function') onChange();
      })
      .subscribe((status) => console.log('[RT]', status));
    return () => { try { c.removeChannel(ch); } catch(_) {} };
  }

  return {
    // pulls
    fetchUsersAll, countUsersExact,
    fetchAisumAll, countAIMsgExact,
    fetchRatingsAll,
    fetchChatApp, fetchChatTg,
    // realtime
    subscribeRealtimeAll,
  };
})();