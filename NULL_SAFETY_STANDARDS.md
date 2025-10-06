# Null Safety & Data Display Standards

## **CRITICAL**: These standards MUST be followed for all code in this application

### 1. Database Field Access
**ALWAYS** use optional chaining and provide safe defaults:

```typescript
// ❌ WRONG - Can crash if null
<p>{row.customer}</p>
<p>{row.quantity}</p>

// ✅ CORRECT - Safe with defaults
<p>{row?.customer ?? "N/A"}</p>
<p>{row?.quantity ?? 0}</p>
```

### 2. Nested Object Access
**ALWAYS** use optional chaining for nested properties:

```typescript
// ❌ WRONG - Can crash on deep nesting
<p>{user.profile.department.name}</p>

// ✅ CORRECT - Safe nested access
<p>{user?.profile?.department?.name ?? "N/A"}</p>
```

### 3. Array Handling
**ALWAYS** check array existence and length before mapping:

```typescript
// ❌ WRONG - Can crash if array is null/undefined
{items.map(item => <div>{item.name}</div>)}

// ✅ CORRECT - Safe with empty state
{items && items.length > 0 ? (
  items.map(item => <div key={item.id}>{item?.name ?? "N/A"}</div>)
) : (
  <div className="text-center py-8 text-muted-foreground">
    No items available
  </div>
)}
```

### 4. Default Values by Type

- **Text fields**: Use `?? "N/A"` or `?? "—"`
- **Numeric fields**: Use `?? 0`
- **Dates**: Always check before formatting:
  ```typescript
  {date ? new Date(date).toLocaleDateString() : "—"}
  ```
- **Arrays**: Use `?? []` or provide empty state UI

### 5. Empty State Messages

Every list/table MUST show a friendly message when empty:

```typescript
{data.length === 0 ? (
  <Card>
    <CardContent className="py-12 text-center space-y-2">
      <p className="text-lg font-medium">No Records Found</p>
      <p className="text-sm text-muted-foreground">
        Data will appear here when available
      </p>
    </CardContent>
  </Card>
) : (
  // Render data
)}
```

### 6. Loading & Error States

**ALWAYS** handle three states:
1. Loading
2. Error
3. Empty/Success

```typescript
if (loading) return <LoadingState />;
if (error) return <ErrorState message={error} />;
if (data.length === 0) return <EmptyState />;
return <DataDisplay />;
```

### 7. Table Rows

**ALWAYS** provide empty state for tables:

```typescript
<TableBody>
  {data.length === 0 ? (
    <TableRow>
      <TableCell colSpan={numberOfColumns} className="text-center py-8">
        No records available
      </TableCell>
    </TableRow>
  ) : (
    data.map(row => (
      <TableRow key={row.id}>
        <TableCell>{row?.field ?? "N/A"}</TableCell>
      </TableRow>
    ))
  )}
</TableBody>
```

### 8. Arithmetic Operations

**ALWAYS** ensure numbers before math:

```typescript
// ❌ WRONG
const total = items.reduce((sum, item) => sum + item.value, 0);

// ✅ CORRECT
const total = items?.reduce((sum, item) => sum + (item?.value ?? 0), 0) ?? 0;
```

### 9. String Operations

**ALWAYS** check before string methods:

```typescript
// ❌ WRONG
const upper = value.toUpperCase();

// ✅ CORRECT
const upper = (value ?? "").toUpperCase();
```

### 10. Supabase Query Results

**ALWAYS** handle null/undefined results:

```typescript
// ❌ WRONG
const { data } = await supabase.from('table').select('*');
setData(data);

// ✅ CORRECT
const { data, error } = await supabase.from('table').select('*');
if (error) {
  console.error(error);
  setData([]);
  return;
}
setData(data ?? []);
```

## Enforcement

- **Code Review**: All PRs must follow these standards
- **No Exceptions**: These are mandatory for ALL code
- **Fix on Sight**: Update any code that doesn't follow these standards
- **AI Generation**: AI must apply these standards to all generated code

## Examples from Real Code

### Good Example (WorkOrders.tsx)
```typescript
{wo?.display_id || wo?.wo_id || "—"}
{wo?.customer || "—"}
{wo?.quantity || 0} pcs
{wo?.current_stage?.replace(/_/g, " ") || "—"}
```

### Bad Example (Needs Fix)
```typescript
{pc.cartons.carton_id}  // Can crash if null
{materialIssues.map(...)}  // No empty state check
{po.material_spec.alloy}  // Nested access without safety
```

## This is Now a Coding Standard

All future code generation and modifications MUST automatically include:
- Optional chaining for all property access
- Safe defaults for all displayed values
- Empty state handling for all lists/tables
- Null checks before all operations
