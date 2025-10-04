-- Strengthen RLS for dimension_tolerances: allow insert/update/delete to managers (production/quality)

-- INSERT policy using WITH CHECK (required for inserts)
CREATE POLICY "Managers can insert tolerances"
ON public.dimension_tolerances
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'production'::app_role) OR 
  has_role(auth.uid(), 'quality'::app_role)
);

-- UPDATE policy using USING (row access) and WITH CHECK (new values)
CREATE POLICY "Managers can update tolerances"
ON public.dimension_tolerances
FOR UPDATE
USING (
  has_role(auth.uid(), 'production'::app_role) OR 
  has_role(auth.uid(), 'quality'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'production'::app_role) OR 
  has_role(auth.uid(), 'quality'::app_role)
);

-- DELETE policy
CREATE POLICY "Managers can delete tolerances"
ON public.dimension_tolerances
FOR DELETE
USING (
  has_role(auth.uid(), 'production'::app_role) OR 
  has_role(auth.uid(), 'quality'::app_role)
);
