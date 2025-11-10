-- Create materialized view for efficient inventory calculations
CREATE OR REPLACE VIEW public.inventory_procurement_status AS
WITH material_requirements AS (
  SELECT 
    material_grade,
    alloy,
    SUM(total_gross_kg) FILTER (WHERE status IN ('pending', 'ordered', 'partial')) as total_required_kg
  FROM public.material_requirements_v2
  GROUP BY material_grade, alloy
),
purchase_orders AS (
  SELECT
    material_grade,
    alloy,
    SUM(qty_kg) FILTER (WHERE status IN ('pending', 'partially_received')) as total_on_order_kg,
    SUM(total_value) FILTER (WHERE status IN ('pending', 'partially_received')) as open_po_value,
    COUNT(*) FILTER (WHERE status IN ('pending', 'partially_received')) as open_po_count,
    COUNT(*) FILTER (WHERE expected_date < CURRENT_DATE AND status != 'completed') as overdue_po_count
  FROM public.raw_material_po
  GROUP BY material_grade, alloy
),
grn_summary AS (
  SELECT
    material_grade,
    alloy,
    SUM(received_qty_kg) as total_received_kg,
    MAX(received_date) as last_grn_date,
    COUNT(*) FILTER (WHERE received_date >= CURRENT_DATE - INTERVAL '30 days') as recent_grn_count
  FROM public.grn_receipts
  GROUP BY material_grade, alloy
),
inventory_lots AS (
  SELECT
    material_size_mm as material_grade,
    alloy,
    SUM(net_weight) FILTER (WHERE status = 'received') as total_inventory_kg,
    COUNT(*) FILTER (WHERE qc_status = 'pending') as pending_qc_count
  FROM public.material_lots
  GROUP BY material_size_mm, alloy
)
SELECT
  mm.id,
  mm.material_name,
  mm.alloy,
  mm.shape_type,
  mm.size_mm,
  mm.density,
  COALESCE(mr.total_required_kg, 0) as total_required_kg,
  COALESCE(po.total_on_order_kg, 0) as total_on_order_kg,
  COALESCE(grn.total_received_kg, 0) as total_received_kg,
  COALESCE(il.total_inventory_kg, 0) as total_inventory_kg,
  COALESCE(mr.total_required_kg, 0) as committed_kg,
  COALESCE(il.total_inventory_kg, 0) + COALESCE(po.total_on_order_kg, 0) - COALESCE(mr.total_required_kg, 0) as available_kg,
  GREATEST(0, COALESCE(mr.total_required_kg, 0) - (COALESCE(il.total_inventory_kg, 0) + COALESCE(po.total_on_order_kg, 0))) as deficit_kg,
  COALESCE(po.open_po_value, 0) as open_po_value,
  COALESCE(po.open_po_count, 0) as open_po_count,
  COALESCE(po.overdue_po_count, 0) as overdue_po_count,
  COALESCE(il.pending_qc_count, 0) as pending_qc_count,
  grn.last_grn_date,
  COALESCE(grn.recent_grn_count, 0) as recent_grn_count,
  CASE
    WHEN GREATEST(0, COALESCE(mr.total_required_kg, 0) - (COALESCE(il.total_inventory_kg, 0) + COALESCE(po.total_on_order_kg, 0))) > 0 THEN 'deficit'
    WHEN (COALESCE(il.total_inventory_kg, 0) + COALESCE(po.total_on_order_kg, 0)) < (COALESCE(mr.total_required_kg, 0) * 1.15) THEN 'low_stock'
    ELSE 'available'
  END as status
FROM public.material_master mm
LEFT JOIN material_requirements mr ON mm.material_name = mr.material_grade AND mm.alloy = mr.alloy
LEFT JOIN purchase_orders po ON mm.material_name = po.material_grade AND mm.alloy = po.alloy
LEFT JOIN grn_summary grn ON mm.material_name = grn.material_grade AND mm.alloy = grn.alloy
LEFT JOIN inventory_lots il ON mm.material_name = il.material_grade AND mm.alloy = il.alloy;

-- Create function to get linked WOs and POs for a material
CREATE OR REPLACE FUNCTION public.get_material_links(
  _material_grade TEXT,
  _alloy TEXT
)
RETURNS TABLE(
  linked_wo_ids TEXT[],
  linked_po_ids TEXT[],
  linked_grn_ids TEXT[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ARRAY_AGG(DISTINCT wo.wo_number) FILTER (WHERE wo.wo_number IS NOT NULL) as linked_wo_ids,
    ARRAY_AGG(DISTINCT po.po_id) FILTER (WHERE po.po_id IS NOT NULL) as linked_po_ids,
    ARRAY_AGG(DISTINCT grn.grn_no) FILTER (WHERE grn.grn_no IS NOT NULL) as linked_grn_ids
  FROM public.material_requirements_v2 req
  LEFT JOIN public.work_orders wo ON req.wo_id = wo.id
  LEFT JOIN public.raw_material_po po ON po.material_grade = req.material_grade AND po.alloy = req.alloy
  LEFT JOIN public.grn_receipts grn ON grn.material_grade = req.material_grade AND grn.alloy = req.alloy
  WHERE req.material_grade = _material_grade
    AND req.alloy = _alloy;
END;
$$;