/**
 * Forging Page - Now a redirect to Work Orders filtered by external processes
 * 
 * This page previously managed forging_records directly.
 * As per reclassification, Forging is now a filtered view of Work Orders.
 * The forging_records table and logic remain intact for data continuity.
 * 
 * Users can filter by specific process (Forging, Plating, etc.) on the Work Orders page.
 */
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function Forging() {
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect to Work Orders with external type filter
    // Users can then filter by specific process (Forging, Plating, etc.)
    navigate("/work-orders?type=external&stage=forging", { replace: true });
  }, [navigate]);

  return null;
}
