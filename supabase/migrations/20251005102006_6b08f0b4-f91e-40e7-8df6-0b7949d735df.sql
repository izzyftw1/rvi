-- Grant admin role to dhaval@brasspartsindia.net
-- User ID from auth logs: 55f6c501-a512-4636-996e-5b68196fe27d
INSERT INTO public.user_roles (user_id, role)
VALUES ('55f6c501-a512-4636-996e-5b68196fe27d', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;