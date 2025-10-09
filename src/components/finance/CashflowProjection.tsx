import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Line, ComposedChart } from "recharts";
import { startOfWeek, addWeeks, format, isWithinInterval, parseISO } from "date-fns";

interface CashflowData {
  week: string;
  expected: number;
  actual: number;
  variance: number;
}

export function CashflowProjection() {
  const [cashflowData, setCashflowData] = useState<CashflowData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCashflowData();
  }, []);

  const loadCashflowData = async () => {
    try {
      const today = new Date();
      const weekStart = startOfWeek(today);
      
      // Generate 8 weeks of data
      const weeks: CashflowData[] = [];
      for (let i = 0; i < 8; i++) {
        const weekDate = addWeeks(weekStart, i);
        const weekEnd = addWeeks(weekDate, 1);
        
        weeks.push({
          week: format(weekDate, "MMM dd"),
          expected: 0,
          actual: 0,
          variance: 0
        });
      }

      // Fetch invoices with expected payment dates
      const { data: invoices } = await supabase
        .from("invoices")
        .select("expected_payment_date, balance_amount, status")
        .in("status", ["issued", "part_paid", "overdue"])
        .not("expected_payment_date", "is", null);

      // Fetch actual payments
      const { data: payments } = await supabase
        .from("payments")
        .select("payment_date, amount")
        .gte("payment_date", format(weekStart, "yyyy-MM-dd"))
        .lte("payment_date", format(addWeeks(weekStart, 8), "yyyy-MM-dd"));

      // Aggregate expected payments by week
      invoices?.forEach((invoice: any) => {
        const paymentDate = parseISO(invoice.expected_payment_date);
        weeks.forEach((week, idx) => {
          const wStart = addWeeks(weekStart, idx);
          const wEnd = addWeeks(wStart, 1);
          
          if (isWithinInterval(paymentDate, { start: wStart, end: wEnd })) {
            week.expected += Number(invoice.balance_amount);
          }
        });
      });

      // Aggregate actual payments by week
      payments?.forEach((payment: any) => {
        const paymentDate = parseISO(payment.payment_date);
        weeks.forEach((week, idx) => {
          const wStart = addWeeks(weekStart, idx);
          const wEnd = addWeeks(wStart, 1);
          
          if (isWithinInterval(paymentDate, { start: wStart, end: wEnd })) {
            week.actual += Number(payment.amount);
          }
        });
      });

      // Calculate variance
      weeks.forEach(week => {
        week.variance = week.actual - week.expected;
      });

      setCashflowData(weeks);
    } catch (error: any) {
      console.error("Error loading cashflow data:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Expected Cashflow (8 Weeks)</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  const totalExpected = cashflowData.reduce((sum, week) => sum + week.expected, 0);
  const totalActual = cashflowData.reduce((sum, week) => sum + week.actual, 0);
  const totalVariance = totalActual - totalExpected;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Expected Cashflow (8 Weeks)</CardTitle>
        <div className="flex gap-6 text-sm mt-2">
          <div>
            <span className="text-muted-foreground">Expected: </span>
            <span className="font-semibold">${totalExpected.toFixed(0)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Actual: </span>
            <span className="font-semibold">${totalActual.toFixed(0)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Variance: </span>
            <span className={`font-semibold ${totalVariance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ${totalVariance.toFixed(0)}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={cashflowData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="week" />
            <YAxis />
            <Tooltip 
              formatter={(value: number) => `$${value.toFixed(0)}`}
            />
            <Legend />
            <Bar dataKey="expected" fill="#8884d8" name="Expected" />
            <Bar dataKey="actual" fill="#82ca9d" name="Actual" />
            <Line type="monotone" dataKey="variance" stroke="#ff7300" name="Variance" />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
