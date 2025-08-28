import { handleCors, jsonErr, jsonOk } from '../utils/response.js';
import { verifySignedRequest, verifyFirebaseIdToken } from '../utils/auth.js';
import { DB, supabase } from '../utils/db.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  console.log(`🔔 [notifications] ${req.method} ${req.url}`);

  try {
    // ----------- ANDROID (GET) -----------
    // Cette partie est maintenant invalide car elle cherche des notifications
    // qui ne peuvent pas être stockées comme le code le pensait.
    // Nous la gardons pour la compatibilité mais elle retournera probablement un tableau vide.
    if (req.method === 'GET') {
      const vr = await verifySignedRequest(req, { expectedPath: '/api/notifications' });
      if (!vr.ok) return jsonErr(res, vr.error, vr.status);

      const device = vr.device;
      if (!device) return jsonErr(res, 'Device not found', 401);

      // La fonction DB.getNotifications n'est plus valide pour ce schéma.
      // On retourne un succès avec un tableau vide pour ne pas casser le client Android.
      console.log(`[notifications] GET pour ${device.device_id}, retour d'un tableau vide pour compatibilité.`);
      return jsonOk(res, { notifications: [] });
    }

    // ----------- WEB (POST) -----------
    if (req.method === 'POST') {
      // Authentification de l'utilisateur web via Firebase
      const user = await verifyFirebaseIdToken(req);
      if (!user) return jsonErr(res, 'Unauthorized', 401);

      // Récupérer l'UUID Supabase de l'utilisateur
      const { id: userUuid, error: uuidErr } = await DB.getUserUuidByFirebaseUid(user.uid);
      if (uuidErr || !userUuid) {
        console.error('Error looking up user UUID:', uuidErr);
        return jsonErr(res, 'User not found in DB', 404);
      }

      // Insérer une seule ligne de notification pour l'utilisateur.
      // Le `id` sera généré automatiquement par la base de données.
      const { data, error: insertErr } = await supabase
        .from('notifications')
        .insert({ user_id: userUuid })
        .select()
        .single();

      if (insertErr) {
        console.error('❌ Erreur insertion notification:', insertErr);
        return jsonErr(res, 'Failed to insert notification', 500);
      }

      console.log(`📱 Notification créée pour user_id: ${userUuid}`);
      return jsonOk(res, { notification: data });
    }

    return jsonErr(res, 'Method not allowed', 405);

  } catch (err) {
    console.error('🚫 notifications API error:', err);
    return jsonErr(res, 'Internal server error', 500);
  }
}
