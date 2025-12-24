-- Add post_external to qc_type enum
ALTER TYPE public.qc_type ADD VALUE IF NOT EXISTS 'post_external';

-- Add waived to qc_result enum  
ALTER TYPE public.qc_result ADD VALUE IF NOT EXISTS 'waived';