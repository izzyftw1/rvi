import * as React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * SafeSelect - A wrapper around Select that prevents empty string values
 * 
 * Features:
 * - Automatically defaults to first option if value is empty/undefined
 * - Provides 'unassigned' fallback option
 * - Prevents silent crashes from empty Select values
 * 
 * @example
 * <SafeSelect
 *   value={myValue}
 *   onValueChange={setMyValue}
 *   placeholder="Select option"
 *   options={[
 *     { value: "option1", label: "Option 1" },
 *     { value: "option2", label: "Option 2" }
 *   ]}
 * />
 */

interface SafeSelectOption {
  value: string;
  label: string;
}

interface SafeSelectProps {
  value: string | undefined | null;
  onValueChange: (value: string) => void;
  options: SafeSelectOption[];
  placeholder?: string;
  defaultValue?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  includeUnassigned?: boolean;
}

export function SafeSelect({
  value,
  onValueChange,
  options,
  placeholder = "Select option",
  defaultValue,
  className,
  disabled = false,
  required = false,
  includeUnassigned = false,
}: SafeSelectProps) {
  // Ensure we always have valid options
  const safeOptions = React.useMemo(() => {
    const opts = [...options];
    
    // Add unassigned option if requested and not already present
    if (includeUnassigned && !opts.some(opt => opt.value === 'unassigned')) {
      opts.unshift({ value: 'unassigned', label: 'Unassigned' });
    }
    
    return opts.filter(opt => opt.value && opt.value.trim() !== '');
  }, [options, includeUnassigned]);

  // Compute safe value
  const safeValue = React.useMemo(() => {
    // If value is valid and exists in options, use it
    if (value && value.trim() !== '' && safeOptions.some(opt => opt.value === value)) {
      return value;
    }
    
    // Try default value
    if (defaultValue && safeOptions.some(opt => opt.value === defaultValue)) {
      return defaultValue;
    }
    
    // Fall back to first option or 'unassigned'
    if (includeUnassigned) {
      return 'unassigned';
    }
    
    return safeOptions[0]?.value || 'unassigned';
  }, [value, defaultValue, safeOptions, includeUnassigned]);

  // Auto-correct on mount if value is invalid
  React.useEffect(() => {
    if (required && (!value || value.trim() === '')) {
      onValueChange(safeValue);
    }
  }, [required, value, safeValue, onValueChange]);

  return (
    <Select
      value={safeValue}
      onValueChange={onValueChange}
      disabled={disabled}
      required={required}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {safeOptions.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
