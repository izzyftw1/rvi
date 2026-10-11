# Architecture rules

- Create sales orders through the SECURITY INVOKER transactional RPC so header, line approval and trigger-generated WOs commit together.
- Link manually created WOs to the selected SO line and enforce distinct-requirement reasons under a line-row lock so concurrent creations cannot bypass the rule.
- Keep SO-line commercial values in WO financial_snapshot.line_item so dispatch and invoicing share the same price source.
- Save raw-material gate receipts through the SECURITY INVOKER receipt RPC with an RPO row lock; linked inventory, receipt, reconciliation and QC writes share one transaction to prevent partial goods-in.
- Reuse the gate-generated material lot for inventory and receipt links, and synchronize lot QC to its exact gate entry, to preserve receipt-level traceability.
- Cancel or reject RPOs through an invoker RPC locking the same RPO row as receipts, so approval and received-quantity conditions cannot be bypassed by concurrent goods-in.
- Record Final QC per production batch through the record_final_qc RPC and gate cartons with a BEFORE INSERT trigger on Final-QC-approved minus packed batch quantity, so packing can't bypass batch-level QC.
