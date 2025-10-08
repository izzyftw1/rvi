-- Enable realtime for production_logs table so dashboards update live
ALTER PUBLICATION supabase_realtime ADD TABLE production_logs;