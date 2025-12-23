/**
 * Forging Page - Now a redirect to Work Orders filtered by forging (external) stage
 * 
 * This page previously managed forging_records directly.
 * As per reclassification, Forging is now a filtered view of Work Orders.
 * The forging_records table and logic remain intact for data continuity.
 * 
 * Forging is an external process, so we filter by type=external and stage=forging.
 */
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function Forging() {
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect to Work Orders with external type and forging stage filter
    navigate("/work-orders?type=external&stage=forging", { replace: true });
  }, [navigate]);

  return null;
}
