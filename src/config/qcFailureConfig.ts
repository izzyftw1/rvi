/**
 * QC Failure Configuration
 * Centralized source for QC failure reasons and categories
 */

export type QCFailureCategory = 
  | 'operator'
  | 'machine'
  | 'setup'
  | 'material'
  | 'tooling'
  | 'measurement'
  | 'environment'
  | 'other';

export interface QCFailureReason {
  id: string;
  label: string;
  category: QCFailureCategory;
  description?: string;
}

export const QC_FAILURE_CATEGORIES: Record<QCFailureCategory, { label: string; color: string }> = {
  operator: { label: 'Operator Error', color: 'hsl(var(--chart-1))' },
  machine: { label: 'Machine Issue', color: 'hsl(var(--chart-2))' },
  setup: { label: 'Setup Fault', color: 'hsl(var(--chart-3))' },
  material: { label: 'Material Defect', color: 'hsl(var(--chart-4))' },
  tooling: { label: 'Tooling Issue', color: 'hsl(var(--chart-5))' },
  measurement: { label: 'Measurement Error', color: 'hsl(220, 70%, 50%)' },
  environment: { label: 'Environmental', color: 'hsl(280, 70%, 50%)' },
  other: { label: 'Other', color: 'hsl(0, 0%, 50%)' }
};

export const QC_FAILURE_REASONS: QCFailureReason[] = [
  // Operator-related
  { id: 'operator_handling', label: 'Improper Handling', category: 'operator', description: 'Part damaged during handling' },
  { id: 'operator_procedure', label: 'Procedure Not Followed', category: 'operator', description: 'SOP deviation' },
  { id: 'operator_skill', label: 'Skill Gap', category: 'operator', description: 'Insufficient training or experience' },
  { id: 'operator_fatigue', label: 'Operator Fatigue', category: 'operator', description: 'Error due to fatigue' },
  
  // Machine-related
  { id: 'machine_calibration', label: 'Machine Out of Calibration', category: 'machine', description: 'Machine needs calibration' },
  { id: 'machine_wear', label: 'Machine Wear', category: 'machine', description: 'Worn machine components' },
  { id: 'machine_malfunction', label: 'Machine Malfunction', category: 'machine', description: 'Equipment not functioning correctly' },
  { id: 'machine_vibration', label: 'Excessive Vibration', category: 'machine', description: 'Vibration causing defects' },
  
  // Setup-related
  { id: 'setup_incorrect', label: 'Incorrect Setup', category: 'setup', description: 'Wrong parameters or fixtures' },
  { id: 'setup_first_piece', label: 'First Piece Not Verified', category: 'setup', description: 'Production started without first piece approval' },
  { id: 'setup_fixture', label: 'Fixture Issue', category: 'setup', description: 'Incorrect or damaged fixture' },
  { id: 'setup_program', label: 'Program Error', category: 'setup', description: 'CNC program issue' },
  
  // Material-related
  { id: 'material_defect', label: 'Raw Material Defect', category: 'material', description: 'Incoming material issue' },
  { id: 'material_grade', label: 'Wrong Material Grade', category: 'material', description: 'Incorrect material used' },
  { id: 'material_dimension', label: 'Material Dimension Issue', category: 'material', description: 'Raw material out of spec' },
  
  // Tooling-related
  { id: 'tool_worn', label: 'Tool Wear', category: 'tooling', description: 'Cutting tool worn out' },
  { id: 'tool_broken', label: 'Tool Breakage', category: 'tooling', description: 'Tool broken during operation' },
  { id: 'tool_wrong', label: 'Wrong Tool', category: 'tooling', description: 'Incorrect tool selected' },
  
  // Measurement-related
  { id: 'measurement_instrument', label: 'Instrument Error', category: 'measurement', description: 'Measuring instrument issue' },
  { id: 'measurement_technique', label: 'Measurement Technique', category: 'measurement', description: 'Incorrect measurement method' },
  
  // Environmental
  { id: 'environment_temp', label: 'Temperature Variation', category: 'environment', description: 'Temperature affecting dimensions' },
  { id: 'environment_contamination', label: 'Contamination', category: 'environment', description: 'Dust or debris contamination' },
  
  // Other
  { id: 'other', label: 'Other', category: 'other', description: 'Other reason not listed' }
];

export const getReasonById = (id: string): QCFailureReason | undefined => {
  return QC_FAILURE_REASONS.find(r => r.id === id);
};

export const getReasonsByCategory = (category: QCFailureCategory): QCFailureReason[] => {
  return QC_FAILURE_REASONS.filter(r => r.category === category);
};

export const getCategoryColor = (category: QCFailureCategory): string => {
  return QC_FAILURE_CATEGORIES[category]?.color || 'hsl(0, 0%, 50%)';
};

export const getCategoryLabel = (category: QCFailureCategory): string => {
  return QC_FAILURE_CATEGORIES[category]?.label || category;
};
