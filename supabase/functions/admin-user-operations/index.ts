import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Only super_admin can perform these operations
const SUPER_ADMIN_DEPARTMENT_TYPE = 'super_admin';

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    // Create Supabase client with service role for admin operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Verify the user making the request is authenticated
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader }
        }
      }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    // Check if user is in Super Admin department
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('department_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.department_id) {
      throw new Error('Failed to verify permissions - no department assigned');
    }

    const { data: department, error: deptError } = await supabaseAdmin
      .from('departments')
      .select('type')
      .eq('id', profile.department_id)
      .single();

    if (deptError || !department) {
      throw new Error('Failed to verify permissions - department not found');
    }

    const isSuperAdmin = department.type === SUPER_ADMIN_DEPARTMENT_TYPE;
    if (!isSuperAdmin) {
      throw new Error('Insufficient permissions - Super Admin access required');
    }

    // Parse request body
    const { operation, target_user_id, new_email, new_password } = await req.json();

    if (!operation) {
      throw new Error('Missing required field: operation');
    }

    if (!target_user_id) {
      throw new Error('Missing required field: target_user_id');
    }

    // Prevent self-deletion
    if (operation === 'delete' && target_user_id === user.id) {
      throw new Error('Cannot delete your own account');
    }

    let result: any = { success: true };

    switch (operation) {
      case 'delete': {
        // First, clean up related data that might have foreign key constraints
        // Delete user_roles entries
        await supabaseAdmin
          .from('user_roles')
          .delete()
          .eq('user_id', target_user_id);

        // Delete user_permission_overrides
        await supabaseAdmin
          .from('user_permission_overrides')
          .delete()
          .eq('user_id', target_user_id);

        // Delete supplier_accounts linked to this user
        await supabaseAdmin
          .from('supplier_accounts')
          .delete()
          .eq('user_id', target_user_id);

        // Delete the profile (should cascade from auth.users but do it explicitly)
        await supabaseAdmin
          .from('profiles')
          .delete()
          .eq('id', target_user_id);

        // Finally delete the user from auth.users
        const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(target_user_id);
        if (deleteError) {
          throw new Error(`Failed to delete user: ${deleteError.message}`);
        }
        result.message = 'User deleted successfully';
        break;
      }

      case 'update_email': {
        if (!new_email) {
          throw new Error('Missing required field: new_email for email update');
        }
        
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(new_email)) {
          throw new Error('Invalid email format');
        }

        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
          target_user_id,
          { email: new_email, email_confirm: true }
        );
        if (updateError) {
          throw new Error(`Failed to update email: ${updateError.message}`);
        }
        result.message = 'Email updated successfully';
        break;
      }

      case 'update_password': {
        if (!new_password) {
          throw new Error('Missing required field: new_password for password update');
        }
        
        // Validate password strength (minimum 6 characters)
        if (new_password.length < 6) {
          throw new Error('Password must be at least 6 characters long');
        }

        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
          target_user_id,
          { password: new_password }
        );
        if (updateError) {
          throw new Error(`Failed to update password: ${updateError.message}`);
        }
        result.message = 'Password updated successfully';
        break;
      }

      default:
        throw new Error(`Unknown operation: ${operation}`);
    }

    // Log admin action
    try {
      await supabaseAdmin
        .from('audit_logs')
        .insert({
          action: `super_admin_${operation}`,
          table_name: 'auth.users',
          record_id: target_user_id,
          changed_by: user.id,
          new_data: { operation, target_user_id, performed_at: new Date().toISOString() }
        });
    } catch {
      // Audit log is optional, don't fail if it doesn't work
    }

    return new Response(
      JSON.stringify(result),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error: any) {
    console.error('Error in admin-user-operations function:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
