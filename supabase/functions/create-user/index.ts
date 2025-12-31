import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Admin/Finance department types that have full access
const BYPASS_DEPARTMENT_TYPES = ['admin', 'finance'];

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

    // Check if user is in Admin or Finance department (department-based permissions)
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

    const isAdmin = BYPASS_DEPARTMENT_TYPES.includes(department.type);
    if (!isAdmin) {
      throw new Error('Insufficient permissions - Admin or Finance department access required');
    }

    // Parse request body
    const { email, full_name, password, department_id, is_active } = await req.json();

    // Validate required fields (role is no longer required - permissions are based on department)
    if (!email || !full_name) {
      throw new Error('Missing required fields: email and full_name are required');
    }

    // Validate department_id if provided
    if (department_id && department_id !== 'none') {
      const { data: targetDept, error: targetDeptError } = await supabaseAdmin
        .from('departments')
        .select('id, name')
        .eq('id', department_id)
        .single();

      if (targetDeptError || !targetDept) {
        throw new Error('Invalid department_id - department does not exist');
      }
    }

    // Generate password if not provided
    const userPassword = password || Math.random().toString(36).slice(-12) + 'A1!';

    // Create user in auth.users using Admin API
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: userPassword,
      email_confirm: true, // Auto-confirm email for admin-created users
      user_metadata: {
        full_name: full_name
      }
    });

    if (createError) {
      throw new Error(`Failed to create user: ${createError.message}`);
    }

    if (!newUser.user) {
      throw new Error('User creation returned no user object');
    }

    // Create profile record with department (permissions are derived from department)
    const { error: insertProfileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: newUser.user.id,
        full_name: full_name,
        department_id: department_id && department_id !== 'none' ? department_id : null,
        is_active: is_active ?? true
      });

    if (insertProfileError) {
      // Rollback: delete the auth user if profile creation fails
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
      throw new Error(`Failed to create profile: ${insertProfileError.message}`);
    }

    // Log admin action (optional - table may not exist)
    try {
      await supabaseAdmin
        .from('user_audit_log')
        .insert({
          user_id: user.id,
          action_type: 'user_created',
          module: 'admin',
          entity_type: 'user',
          entity_id: newUser.user.id,
          action_details: {
            created_user_email: email,
            created_user_name: full_name,
            assigned_department: department_id
          }
        });
    } catch {
      // Audit log is optional, don't fail if it doesn't exist
    }

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: newUser.user.id,
          email: email,
          full_name: full_name,
          department_id: department_id,
          is_active: is_active ?? true
        },
        temporary_password: !password ? userPassword : null
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error: any) {
    console.error('Error in create-user function:', error);
    
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
