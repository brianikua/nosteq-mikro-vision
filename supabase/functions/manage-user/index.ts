import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Verify caller is admin/superadmin
    const authHeader = req.headers.get("Authorization")!;
    const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: callerRoles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id);

    const roles = (callerRoles || []).map((r: any) => r.role);
    if (!roles.includes("superadmin") && !roles.includes("admin")) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, ...params } = await req.json();

    if (action === "create_user") {
      const { email, password, role } = params;
      if (!email || !password || !role) {
        return new Response(JSON.stringify({ error: "email, password, and role are required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Create user via admin API
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (createError) {
        return new Response(JSON.stringify({ error: createError.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Assign role
      const { error: roleError } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: newUser.user.id, role });

      if (roleError) {
        return new Response(JSON.stringify({ error: roleError.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ user: { id: newUser.user.id, email: newUser.user.email } }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "reset_password") {
      const { user_id, new_password } = params;
      if (!user_id || !new_password) {
        return new Response(JSON.stringify({ error: "user_id and new_password are required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
        password: new_password,
      });

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete_user") {
      const { user_id } = params;
      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id is required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Only superadmins can delete
      if (!roles.includes("superadmin")) {
        return new Response(JSON.stringify({ error: "Only superadmins can delete users" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error } = await supabaseAdmin.auth.admin.deleteUser(user_id);
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "list_users") {
      const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers();
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: allRoles } = await supabaseAdmin
        .from("user_roles")
        .select("user_id, role");

      const rolesMap: Record<string, string[]> = {};
      (allRoles || []).forEach((r: any) => {
        rolesMap[r.user_id] = rolesMap[r.user_id] || [];
        rolesMap[r.user_id].push(r.role);
      });

      const result = users.map((u: any) => ({
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        roles: rolesMap[u.id] || [],
      }));

      return new Response(JSON.stringify({ users: result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
