/**
 * Cutting Page - Now a redirect to Work Orders filtered by cutting stage
 * 
 * This page previously managed cutting_records directly.
 * As per reclassification, Cutting is now a filtered view of Work Orders.
 * The cutting_records table and logic remain intact for data continuity.
 */
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function Cutting() {
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect to Work Orders with cutting stage filter
    navigate("/work-orders?stage=cutting_queue", { replace: true });
  }, [navigate]);

  return null;
}
