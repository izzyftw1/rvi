import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const today = new Date();
    const twoDaysFromNow = new Date(today);
    twoDaysFromNow.setDate(today.getDate() + 2);

    // Find moves that are due soon (within 2 days) or overdue
    const { data: moves, error: movesError } = await supabaseClient
      .from('wo_external_moves')
      .select('id, work_order_id, process, partner_id, expected_return_date, challan_no, status')
      .neq('status', 'received_full')
      .neq('status', 'cancelled')
      .not('expected_return_date', 'is', null)
      .lte('expected_return_date', twoDaysFromNow.toISOString().split('T')[0]);

    if (movesError) throw movesError;

    if (!moves || moves.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No moves requiring notification' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // Get work order details
    const woIds = [...new Set(moves.map(m => m.work_order_id))];
    const { data: workOrders } = await supabaseClient
      .from('work_orders')
      .select('id, display_id, customer, item_code')
      .in('id', woIds);

    const woMap: Record<string, any> = {};
    (workOrders || []).forEach(wo => {
      woMap[wo.id] = wo;
    });

    // Get logistics users
    const { data: logisticsUsers, error: usersError } = await supabaseClient
      .from('user_roles')
      .select('user_id')
      .eq('role', 'logistics');

    if (usersError) throw usersError;

    const userIds = (logisticsUsers || []).map(u => u.user_id);

    // Create notifications for each move
    const notifications = [];
    for (const move of moves) {
      const wo = woMap[move.work_order_id];
      if (!wo) continue;

      const dueDate = new Date(move.expected_return_date!);
      const isOverdue = dueDate < today;
      const daysDiff = Math.abs(Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));

      const title = isOverdue 
        ? `Overdue External Return - ${wo.display_id}`
        : `External Return Due in ${daysDiff} Day${daysDiff === 1 ? '' : 's'}`;

      const message = `${move.process.replace('_', ' ').toUpperCase()} process for ${wo.customer} - ${wo.item_code} (Challan: ${move.challan_no}) ${isOverdue ? 'is overdue' : `due on ${new Date(move.expected_return_date!).toLocaleDateString()}`}`;

      for (const userId of userIds) {
        notifications.push({
          user_id: userId,
          type: isOverdue ? 'alert' : 'reminder',
          title,
          message,
          entity_type: 'wo_external_move',
          entity_id: move.id,
        });
      }
    }

    // Insert notifications
    if (notifications.length > 0) {
      const { error: notifError } = await supabaseClient
        .from('notifications')
        .insert(notifications);

      if (notifError) throw notifError;
    }

    return new Response(
      JSON.stringify({ 
        message: `Created ${notifications.length} notifications for ${moves.length} moves`,
        moves: moves.length,
        notifications: notifications.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error: any) {
    console.error('Error in check-overdue-external-moves:', error)
    return new Response(
      JSON.stringify({ error: error?.message || 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
