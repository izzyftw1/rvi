-- Add requires_supervisor_review column to ncrs table for flagging Hourly QC NCRs
ALTER TABLE ncrs ADD COLUMN IF NOT EXISTS requires_supervisor_review boolean DEFAULT false;