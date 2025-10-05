-- Add material_size_mm column to material_lots table for linking with requirements
ALTER TABLE public.material_lots 
ADD COLUMN material_size_mm numeric;

-- Add index for better query performance
CREATE INDEX idx_material_lots_size ON public.material_lots(material_size_mm) WHERE material_size_mm IS NOT NULL;

COMMENT ON COLUMN public.material_lots.material_size_mm IS 'Material rod/forging size in mm - links to sales order requirements';