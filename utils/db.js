import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

export default supabase;

// Helpers for common queries
export const DB = {
  async getDevice(device_id) {
    return await supabase
      .from('devices')
      .select('*')
      .eq('device_id', device_id)
      .eq('revoked', false)
      .single();
  },

  async getDevicesForUser(user_id) {
    return await supabase
      .from('devices')
      .select('device_id')
      .eq('user_id', user_id)
      .eq('revoked', false);
  },

  async insertNonce(nonce, device_id, ts) {
    return await supabase.from('nonces').insert({ nonce, device_id, ts });
  },

  async insertLocation(row) {
    return await supabase.from('locations').insert(row);
  },

  // Récupère les notifications non lues pour un appareil spécifique
  async getNotificationsForDevice(device_id) {
    return await supabase
      .from('notifications')
      .select('id, type, payload')
      .eq('device_id', device_id)
      .eq('is_read', false)
      .order('created_at', { ascending: true });
  },

  // Marque un lot de notifications comme lues
  async markNotificationsAsRead(notificationIds) {
    return await supabase
      .from('notifications')
      .update({ is_read: true })
      .in('id', notificationIds);
  },

  // Insère un lot de notifications
  async insertNotifications(notificationRows) {
    return await supabase.from('notifications').insert(notificationRows);
  },

  async addTrusted(row) {
    return await supabase
      .from('trusted_locations')
      .insert(row)
      .select('*')
      .single();
  },

  async deleteTrusted(user_id, id) {
    return await supabase
      .from('trusted_locations')
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

  async getUserUuidByFirebaseUid(firebase_uid) {
    const { data, error } = await supabase
      .from('users')
      .select('id')
      .eq('firebase_uid', firebase_uid)
      .single();
    return { id: data?.id || null, error };
  },
};
