import { z } from 'zod';

// Material Inwards validation schema
export const materialLotSchema = z.object({
  lot_id: z.string()
    .trim()
    .min(1, "Lot ID is required")
    .max(50, "Lot ID must be less than 50 characters")
    .regex(/^[A-Z0-9-]+$/i, "Lot ID can only contain letters, numbers, and dashes"),
  heat_no: z.string()
    .trim()
    .min(1, "Heat number is required")
    .max(50, "Heat number must be less than 50 characters"),
  alloy: z.string()
    .trim()
    .min(1, "Alloy is required")
    .max(50, "Alloy must be less than 50 characters"),
  supplier: z.string()
    .trim()
    .min(1, "Supplier is required")
    .max(200, "Supplier name must be less than 200 characters"),
  material_size_mm: z.string()
    .optional()
    .refine((val) => !val || (!isNaN(parseFloat(val)) && parseFloat(val) > 0 && parseFloat(val) <= 5000), {
      message: "Material size must be between 0 and 5000 mm"
    }),
  gross_weight: z.string()
    .refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0 && parseFloat(val) <= 100000, {
      message: "Gross weight must be between 0 and 100,000 kg"
    }),
  net_weight: z.string()
    .refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0 && parseFloat(val) <= 100000, {
      message: "Net weight must be between 0 and 100,000 kg"
    }),
  bin_location: z.string()
    .trim()
    .max(50, "Bin location must be less than 50 characters")
    .optional(),
}).refine((data) => {
  const gross = parseFloat(data.gross_weight);
  const net = parseFloat(data.net_weight);
  return net <= gross;
}, {
  message: "Net weight cannot exceed gross weight",
  path: ["net_weight"],
});

// Work Order validation schema
export const workOrderSchema = z.object({
  wo_id: z.string()
    .trim()
    .min(1, "Work Order ID is required")
    .max(50, "Work Order ID must be less than 50 characters")
    .regex(/^[A-Z0-9-]+$/i, "Work Order ID can only contain letters, numbers, and dashes"),
  customer: z.string()
    .trim()
    .min(1, "Customer is required")
    .max(200, "Customer name must be less than 200 characters"),
  item_code: z.string()
    .trim()
    .min(1, "Item code is required")
    .max(100, "Item code must be less than 100 characters"),
  revision: z.string()
    .trim()
    .max(20, "Revision must be less than 20 characters")
    .optional(),
  quantity: z.string()
    .refine((val) => !isNaN(parseInt(val)) && parseInt(val) > 0 && parseInt(val) <= 1000000, {
      message: "Quantity must be between 1 and 1,000,000"
    }),
  due_date: z.string()
    .min(1, "Due date is required"),
  priority: z.string()
    .refine((val) => ['1', '2', '3', '4'].includes(val), {
      message: "Priority must be 1, 2, 3, or 4"
    }),
  sales_order: z.string()
    .trim()
    .max(50, "Sales order must be less than 50 characters")
    .optional(),
});

// QC Record validation schema
export const qcRecordSchema = z.object({
  qc_id: z.string()
    .trim()
    .min(1, "QC ID is required")
    .max(50, "QC ID must be less than 50 characters"),
  qc_type: z.enum(['incoming', 'first_piece', 'in_process', 'final']),
  result: z.enum(['pass', 'fail', 'pending']),
  measurements: z.string()
    .optional()
    .refine((val) => {
      if (!val || val.trim() === '') return true;
      try {
        JSON.parse(val);
        return true;
      } catch {
        return false;
      }
    }, {
      message: "Measurements must be valid JSON"
    }),
  remarks: z.string()
    .max(1000, "Remarks must be less than 1000 characters")
    .optional(),
});

// Carton/Pallet validation schema
export const cartonSchema = z.object({
  carton_id: z.string()
    .trim()
    .min(1, "Carton ID is required")
    .max(50, "Carton ID must be less than 50 characters")
    .regex(/^[A-Z0-9-]+$/i, "Carton ID can only contain letters, numbers, and dashes"),
  quantity: z.string()
    .refine((val) => !isNaN(parseInt(val)) && parseInt(val) > 0 && parseInt(val) <= 100000, {
      message: "Quantity must be between 1 and 100,000"
    }),
  gross_weight: z.string()
    .refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0 && parseFloat(val) <= 10000, {
      message: "Gross weight must be between 0 and 10,000 kg"
    }),
  net_weight: z.string()
    .refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0 && parseFloat(val) <= 10000, {
      message: "Net weight must be between 0 and 10,000 kg"
    }),
}).refine((data) => {
  const gross = parseFloat(data.gross_weight);
  const net = parseFloat(data.net_weight);
  return net <= gross;
}, {
  message: "Net weight cannot exceed gross weight",
  path: ["net_weight"],
});

export const palletSchema = z.object({
  pallet_id: z.string()
    .trim()
    .min(1, "Pallet ID is required")
    .max(50, "Pallet ID must be less than 50 characters")
    .regex(/^[A-Z0-9-]+$/i, "Pallet ID can only contain letters, numbers, and dashes"),
  carton_ids: z.string()
    .min(1, "At least one carton ID is required")
    .max(2000, "Carton IDs list is too long"),
});

// Password validation schema
export const passwordSchema = z.string()
  .min(12, "Password must be at least 12 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number")
  .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character");
