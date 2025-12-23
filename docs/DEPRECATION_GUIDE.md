# Page Deprecation Guide

## Overview

This guide outlines the process for deprecating Production and Quality pages safely without data loss or broken functionality.

## Deprecation Workflow

### Step 1: Mark Page as Deprecated

Edit `src/config/deprecationConfig.ts` and change the page status:

```typescript
{ 
  path: '/example-page', 
  status: 'deprecated',
  deprecatedDate: '2024-01-15',
  replacedBy: '/new-page',
  notes: 'Functionality merged into New Page component'
}
```

### Step 2: Navigation Automatically Hides

Once marked as deprecated, the page will be automatically hidden from navigation menus. The `isHiddenFromNav()` function in the navigation component filters out deprecated pages.

### Step 3: Route Remains Accessible

The route remains functional for:
- Existing bookmarks
- Verification testing
- Data comparison

Users accessing the deprecated page will see a deprecation notice banner.

### Step 4: Verify Functional Parity

Before marking as 'verified', confirm ALL items from `docs/FEATURE_INVENTORY.md`:

1. **Data Shown**: All metrics/data visible on deprecated page exist elsewhere
2. **Source Tables**: Same data sources are used in replacement
3. **User Actions**: All buttons, forms, and interactions are available elsewhere

### Step 5: Mark as Verified

After confirmation, update status:

```typescript
{ 
  path: '/example-page', 
  status: 'verified',
  deprecatedDate: '2024-01-15',
  verifiedDate: '2024-01-22',
  replacedBy: '/new-page',
  notes: 'All features confirmed in New Page'
}
```

### Step 6: Hard Deletion (Optional)

Only after 'verified' status, the page component can be safely deleted:

1. Remove the route from `App.tsx`
2. Delete the page component file
3. Remove from deprecation config

## Checking Deprecation Status

Use these utility functions:

```typescript
import { 
  isHiddenFromNav, 
  isDeprecated, 
  getDeprecatedPages,
  getVerifiedPages 
} from '@/config/deprecationConfig';

// Check if page should be hidden from nav
isHiddenFromNav('/some-page'); // true/false

// Check if page is deprecated (for showing notice)
isDeprecated('/some-page'); // true/false

// Get all deprecated pages
getDeprecatedPages(); // PageDeprecation[]

// Get pages ready for deletion
getVerifiedPages(); // PageDeprecation[]
```

## Important Notes

1. **Never skip verification**: Always confirm functional parity before hard deletion
2. **Keep FEATURE_INVENTORY.md updated**: This is the source of truth for page functionality
3. **Document replacements**: Always specify which page replaces the deprecated one
4. **Allow time for testing**: Keep deprecated pages accessible for at least 1 week

## Production Pages Subject to This Policy

- Daily Production Log
- CNC Programmer Activity
- Cutting
- Forging
- Floor Dashboard
- CNC Dashboard
- Production Progress
- Machine Utilisation
- Operator Efficiency
- Setter Efficiency
- Downtime Analytics

## Quality Pages Subject to This Policy

- Quality Dashboard
- Incoming QC
- Hourly QC
- Final QC List
- Final QC Detail
- NCR Management
- NCR Detail
- Quality Traceability
- Quality Documents
- Quality Analytics
- Tolerances
- Instruments
