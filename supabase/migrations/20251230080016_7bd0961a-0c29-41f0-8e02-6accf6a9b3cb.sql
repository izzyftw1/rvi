-- Add comprehensive material grades including CW614N and other common alloys
INSERT INTO material_grades (name, category, description) VALUES
-- Lead-free brass (CW Series European Standard)
('CW614N', 'brass', 'Free-machining brass - European equivalent of C38500'),
('CW617N', 'brass', 'Dezincification resistant brass'),
('CW602N', 'brass', 'High tensile brass'),
('CW508L', 'brass', 'Lead-free brass'),
('CW724R', 'bronze', 'Aluminium bronze'),
-- Common American UNS designations
('C37700', 'brass', 'Forging brass'),
('C38500', 'brass', 'Architectural bronze'),
('C26000', 'brass', 'Cartridge brass 70/30'),
('C27000', 'brass', 'Yellow brass 65/35'),
('C28000', 'brass', 'Muntz metal 60/40'),
('C46400', 'brass', 'Naval brass'),
('C48200', 'bronze', 'Medium leaded naval brass'),
('C48500', 'bronze', 'Leaded naval brass'),
('C93200', 'bronze', 'Bearing bronze'),
('C95800', 'bronze', 'Nickel aluminium bronze'),
('C93500', 'bronze', 'High leaded tin bronze'),
('C83600', 'bronze', 'Leaded red brass'),
('C86300', 'bronze', 'High strength manganese bronze'),
-- Copper
('C10200', 'copper', 'Oxygen-free copper'),
('C12200', 'copper', 'Phosphorized copper'),
('C14500', 'copper', 'Tellurium copper'),
('C17200', 'copper', 'Beryllium copper'),
-- Stainless Steel
('SS303', 'stainless', 'Free machining stainless'),
('SS410', 'stainless', 'Martensitic stainless'),
('SS416', 'stainless', 'Free machining martensitic'),
('SS17-4PH', 'stainless', 'Precipitation hardening stainless'),
-- Aluminium
('Al6061', 'aluminium', '6061 Aluminium'),
('Al2024', 'aluminium', '2024 Aluminium'),
('Al7075', 'aluminium', '7075 Aluminium')
ON CONFLICT (name) DO NOTHING;

-- Add more comprehensive nominal sizes (common in manufacturing)
INSERT INTO nominal_sizes (size_value, unit, display_label) VALUES
(6, 'mm', '6 mm'),
(9, 'mm', '9 mm'),
(11, 'mm', '11 mm'),
(13, 'mm', '13 mm'),
(15, 'mm', '15 mm'),
(17, 'mm', '17 mm'),
(19, 'mm', '19 mm'),
(21, 'mm', '21 mm'),
(23, 'mm', '23 mm'),
(24, 'mm', '24 mm'),
(26, 'mm', '26 mm'),
(27, 'mm', '27 mm'),
(29, 'mm', '29 mm'),
(33, 'mm', '33 mm'),
(36, 'mm', '36 mm'),
(42, 'mm', '42 mm'),
(48, 'mm', '48 mm'),
(52, 'mm', '52 mm'),
(55, 'mm', '55 mm'),
(60, 'mm', '60 mm'),
(65, 'mm', '65 mm'),
(70, 'mm', '70 mm'),
(75, 'mm', '75 mm'),
(80, 'mm', '80 mm'),
(85, 'mm', '85 mm'),
(90, 'mm', '90 mm'),
(95, 'mm', '95 mm'),
(100, 'mm', '100 mm'),
(110, 'mm', '110 mm'),
(120, 'mm', '120 mm'),
(130, 'mm', '130 mm'),
(140, 'mm', '140 mm'),
(150, 'mm', '150 mm'),
(160, 'mm', '160 mm'),
(180, 'mm', '180 mm'),
(200, 'mm', '200 mm')
ON CONFLICT DO NOTHING;

-- Add process routes with proper sequences
INSERT INTO process_routes (name, description, sequence, is_active) VALUES
('Standard CNC Machining', 'Cutting → CNC → Final QC', '[{"step": 1, "operation": "cutting", "is_external": false}, {"step": 2, "operation": "cnc_1", "is_external": false}, {"step": 3, "operation": "final_qc", "is_external": false}]', true),
('CNC with Heat Treatment', 'Cutting → CNC → Heat Treatment (External) → Final QC', '[{"step": 1, "operation": "cutting", "is_external": false}, {"step": 2, "operation": "cnc_1", "is_external": false}, {"step": 3, "operation": "heat_treatment", "is_external": true}, {"step": 4, "operation": "final_qc", "is_external": false}]', true),
('Forging Route', 'Forging → CNC → Plating → Final QC', '[{"step": 1, "operation": "forging", "is_external": false}, {"step": 2, "operation": "cnc_1", "is_external": false}, {"step": 3, "operation": "plating", "is_external": true}, {"step": 4, "operation": "final_qc", "is_external": false}]', true),
('Multi-Op CNC', 'Cutting → CNC OP10 → CNC OP20 → Plating → Final QC', '[{"step": 1, "operation": "cutting", "is_external": false}, {"step": 2, "operation": "cnc_1", "is_external": false}, {"step": 3, "operation": "cnc_2", "is_external": false}, {"step": 4, "operation": "plating", "is_external": true}, {"step": 5, "operation": "final_qc", "is_external": false}]', true)
ON CONFLICT (name) DO NOTHING;