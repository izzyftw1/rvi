# Architecture rules

- Create sales orders through the SECURITY INVOKER transactional RPC so header, line approval and trigger-generated WOs commit together.
- Link manually created WOs to the selected SO line and enforce distinct-requirement reasons under a line-row lock so concurrent creations cannot bypass the rule.
- Keep SO-line commercial values in WO financial_snapshot.line_item so dispatch and invoicing share the same price source.