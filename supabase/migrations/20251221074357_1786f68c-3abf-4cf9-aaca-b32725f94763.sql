-- Create enum for production release status
CREATE TYPE public.production_release_status AS ENUM ('NOT_RELEASED', 'RELEASED');

-- Add production release fields to work_orders table
ALTER TABLE public.work_orders
ADD COLUMN production_release_status public.production_release_status NOT NULL DEFAULT 'NOT_RELEASED',
ADD COLUMN production_release_date timestamp with time zone,
ADD COLUMN production_released_by uuid REFERENCES auth.users(id),
ADD COLUMN production_release_notes text;