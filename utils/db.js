import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

export default supabase;

// Helpers for common queries (tables must exist in Supabase)
export const DB = {
  async getDevice(device_id) {
    return await supabase
      .from('devices')
      .select('*')
      .eq('device_id', device_id)
      .eq('revoked', false)
      .single();
  },

  async insertNonce(nonce, device_id, ts) {
    // Table nonces has a unique constraint on (nonce, device_id)
    return await supabase.from('nonces').insert({ nonce, device_id, ts });
  },

  async insertLocation(row) {
    return await supabase.from('locations').insert(row);
  },

  async getNotifications(user_id) {
    return await supabase
      .from('notifications')
      .select('id, message, created_at')
      .eq('user_id', user_id)
      .eq('is_read', false)
      .order('created_at', { ascending: false });
  },

  async addTrusted(row) {
    return await supabase
      .from('trusted_places')
      .insert(row)
      .select('*')
      .single();
  },

  async deleteTrusted(user_id, id) {
    return await supabase
      .from('trusted_places')
      .delete()
      .eq('user_id', user_id)
      .eq('id', id);
  },

  async listLocations(user_id, from_ms, to_ms) {
    let q = supabase
      .from('locations')
      .select('lat, lon, ts_ms')
      .eq('user_id', user_id);

    if (from_ms) q = q.gte('ts_ms', from_ms);
    if (to_ms) q = q.lte('ts_ms', to_ms);

    return await q.order('ts_ms', { ascending: true });
  },

  async insertNotification({ user_id, device_id, type, payload }) {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .insert({ user_id, device_id, type, payload })
        .select();
      return { data, error };
    } catch (err) {
      return { data: null, error: err };
    }
  },
};
