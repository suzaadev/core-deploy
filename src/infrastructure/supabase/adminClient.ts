import { createClient } from '@supabase/supabase-js';
import { config } from '../../config';
import { logger } from '../../common/logger';

const adminSupabaseUrl = process.env.ADMIN_SUPABASE_URL!;
const adminSupabaseServiceKey = process.env.ADMIN_SUPABASE_SERVICE_ROLE_KEY!;

if (!adminSupabaseUrl || !adminSupabaseServiceKey) {
  throw new Error('Admin Supabase credentials not configured');
}

export const adminSupabase = createClient(adminSupabaseUrl, adminSupabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

/**
 * Validate admin Supabase JWT token
 */
export async function validateAdminSupabaseToken(token: string) {
  try {
    const { data: { user }, error } = await adminSupabase.auth.getUser(token);
    
    if (error) {
      logger.warn('Admin Supabase token validation failed', { error: error.message });
      return null;
    }

    if (!user) {
      logger.warn('No admin user found in token');
      return null;
    }

    return user;
  } catch (error) {
    logger.error('Admin Supabase token validation error', { error });
    return null;
  }
}
