import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getTdsRate, getPanEntityType, getFinancialYear, getTdsQuarter, calculateTds } from '@/lib/tdsUtils';

interface TdsCalculationResult {
  tdsRate: number;
  entityType: string;
  grossAmount: number;
  tdsAmount: number;
  netAmount: number;
  isExport: boolean;
  pan: string | null;
}

interface CustomerTdsInfo {
  pan_number: string | null;
  is_export_customer: boolean;
}

/**
 * Hook to calculate TDS for customer receipts
 */
export function useTdsCalculation(customerId: string | null, grossAmount: number) {
  const [customerInfo, setCustomerInfo] = useState<CustomerTdsInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [calculation, setCalculation] = useState<TdsCalculationResult | null>(null);

  useEffect(() => {
    if (!customerId) {
      setCustomerInfo(null);
      setCalculation(null);
      return;
    }

    const fetchCustomerInfo = async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from('customer_master')
          .select('pan_number, is_export_customer')
          .eq('id', customerId)
          .single();
        
        setCustomerInfo(data);
      } catch (error) {
        console.error('Error fetching customer TDS info:', error);
        setCustomerInfo(null);
      } finally {
        setLoading(false);
      }
    };

    fetchCustomerInfo();
  }, [customerId]);

  useEffect(() => {
    if (!customerInfo || grossAmount <= 0) {
      setCalculation(null);
      return;
    }

    const isExport = customerInfo.is_export_customer || false;
    const pan = customerInfo.pan_number;
    const tdsRate = getTdsRate(pan, isExport);
    const entityType = getPanEntityType(pan);
    const { tdsAmount, netAmount } = calculateTds(grossAmount, tdsRate);

    setCalculation({
      tdsRate,
      entityType,
      grossAmount,
      tdsAmount,
      netAmount,
      isExport,
      pan,
    });
  }, [customerInfo, grossAmount]);

  return { calculation, loading };
}

/**
 * Create a TDS record for a customer receipt
 */
export async function createReceiptTdsRecord(params: {
  customerId: string;
  receiptId: string;
  invoiceId?: string;
  grossAmount: number;
  transactionDate: string;
  createdBy?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    // Fetch customer info
    const { data: customer } = await supabase
      .from('customer_master')
      .select('pan_number, is_export_customer')
      .eq('id', params.customerId)
      .single();

    if (!customer) {
      return { success: false, error: 'Customer not found' };
    }

    // Skip TDS for export customers
    if (customer.is_export_customer) {
      return { success: true };
    }

    // Skip if no PAN
    if (!customer.pan_number) {
      return { success: true };
    }

    const tdsRate = getTdsRate(customer.pan_number, false);
    const entityType = getPanEntityType(customer.pan_number);
    const { tdsAmount, netAmount } = calculateTds(params.grossAmount, tdsRate);
    const transactionDate = new Date(params.transactionDate);
    const financialYear = getFinancialYear(transactionDate);
    const quarter = getTdsQuarter(transactionDate);

    const { error } = await supabase
      .from('tds_records')
      .insert({
        record_type: 'receivable',
        customer_id: params.customerId,
        receipt_id: params.receiptId,
        invoice_id: params.invoiceId || null,
        pan_number: customer.pan_number,
        entity_type: entityType,
        tds_rate: tdsRate,
        gross_amount: params.grossAmount,
        tds_amount: tdsAmount,
        net_amount: netAmount,
        financial_year: financialYear,
        quarter: quarter,
        transaction_date: params.transactionDate,
        status: 'pending',
        created_by: params.createdBy || null,
      });

    if (error) {
      console.error('Error creating TDS record:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error in createReceiptTdsRecord:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Create a TDS record for a supplier payment
 */
export async function createPaymentTdsRecord(params: {
  supplierId: string;
  poId?: string;
  grossAmount: number;
  transactionDate: string;
  createdBy?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    // Fetch supplier info
    const { data: supplier } = await supabase
      .from('suppliers')
      .select('pan_number, name')
      .eq('id', params.supplierId)
      .single();

    if (!supplier) {
      return { success: false, error: 'Supplier not found' };
    }

    // Skip if no PAN
    if (!supplier.pan_number) {
      return { success: true };
    }

    const tdsRate = getTdsRate(supplier.pan_number, false);
    const entityType = getPanEntityType(supplier.pan_number);
    const { tdsAmount, netAmount } = calculateTds(params.grossAmount, tdsRate);
    const transactionDate = new Date(params.transactionDate);
    const financialYear = getFinancialYear(transactionDate);
    const quarter = getTdsQuarter(transactionDate);

    const { error } = await supabase
      .from('tds_records')
      .insert({
        record_type: 'payable',
        supplier_id: params.supplierId,
        po_id: params.poId || null,
        pan_number: supplier.pan_number,
        entity_type: entityType,
        tds_rate: tdsRate,
        gross_amount: params.grossAmount,
        tds_amount: tdsAmount,
        net_amount: netAmount,
        financial_year: financialYear,
        quarter: quarter,
        transaction_date: params.transactionDate,
        status: 'pending',
        created_by: params.createdBy || null,
      });

    if (error) {
      console.error('Error creating TDS record:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error in createPaymentTdsRecord:', error);
    return { success: false, error: error.message };
  }
}
