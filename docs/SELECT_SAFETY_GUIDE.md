# Select Dropdown Safety Guide

## Problem
Empty string values in Select components cause silent crashes and rendering issues throughout the application.

## Solution
All Select components must have safe default values that prevent empty strings.

## Implementation Patterns

### Pattern 1: Default to First Option
```tsx
<Select 
  value={myValue || (options.length > 0 ? options[0].value : "")} 
  onValueChange={setMyValue}
>
  <SelectTrigger>
    <SelectValue placeholder="Select option" />
  </SelectTrigger>
  <SelectContent>
    {options.map((opt) => (
      <SelectItem 
        key={opt.value} 
        value={opt.value || 'unassigned'}
      >
        {opt.label || 'Unknown'}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

### Pattern 2: Include 'None' Option
```tsx
<Select 
  value={myValue || "none"} 
  onValueChange={(value) => setMyValue(value === "none" ? "" : value)}
>
  <SelectTrigger>
    <SelectValue placeholder="Select option" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="none">None / Unassigned</SelectItem>
    {options.map((opt) => (
      <SelectItem key={opt.value} value={opt.value}>
        {opt.label}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

### Pattern 3: Use SafeSelect Component
```tsx
import { SafeSelect } from "@/components/ui/safe-select";

<SafeSelect
  value={myValue}
  onValueChange={setMyValue}
  options={options}
  placeholder="Select option"
  includeUnassigned={true}
  required={true}
/>
```

### Pattern 4: Use Helper Functions
```tsx
import { getSafeSelectValue, sanitizeSelectOptions } from "@/lib/selectHelpers";

const safeOptions = sanitizeSelectOptions(rawOptions, true);
const safeValue = getSafeSelectValue(myValue, safeOptions);

<Select value={safeValue} onValueChange={setMyValue}>
  {/* ... */}
</Select>
```

## Critical Areas

These areas MUST use safe Select patterns:

1. **Admin Panel**
   - Role selectors
   - Department dropdowns
   - User management forms

2. **Work Orders**
   - Stage selectors
   - Status dropdowns
   - Machine assignments

3. **External Processing**
   - Partner selection
   - Process type dropdowns
   - Operation tags

4. **QC & Quality**
   - Status dropdowns
   - Approval selectors
   - Test result fields

5. **Finance**
   - Payment method dropdowns
   - Currency selectors
   - Status fields

## Validation Rules

1. **Never allow empty string values**
   - Always provide a default/fallback
   - Validate on form submission

2. **Filter out invalid options**
   - Remove options with empty values
   - Sanitize data before mapping

3. **Provide visual feedback**
   - Show placeholder text
   - Use required field indicators

4. **Handle edge cases**
   - No options available
   - Dynamic option loading
   - Disabled states

## Testing Checklist

- [ ] Select has a valid default value
- [ ] All SelectItem values are non-empty
- [ ] No crashes on initial render
- [ ] Placeholder shows when appropriate
- [ ] Required validation works
- [ ] Empty arrays handled gracefully
- [ ] Dynamic options don't break state

## Migration Checklist

When updating existing Select components:

1. ✅ Admin panel role/department selectors - DONE
2. ✅ External partner dropdowns - DONE
3. ✅ SendToExternalDialog process/partner - DONE
4. ⏳ Work Order stage selectors
5. ⏳ QC status dropdowns
6. ⏳ Finance payment/currency dropdowns
7. ⏳ Material requirements filters
8. ⏳ Customer management forms
9. ⏳ Reports page filters
10. ⏳ Machine status filters

## Common Mistakes to Avoid

❌ **Wrong**: `<Select value={myValue}>`
✅ **Correct**: `<Select value={myValue || "default"}>`

❌ **Wrong**: `<SelectItem value="">`
✅ **Correct**: `<SelectItem value="none">None</SelectItem>`

❌ **Wrong**: No validation before submit
✅ **Correct**: Validate value !== "" && value !== "unassigned"

❌ **Wrong**: Assuming options always exist
✅ **Correct**: Check options.length > 0 before accessing
