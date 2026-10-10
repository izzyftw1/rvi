export const WORK_ORDER_SPLIT_REASONS = [
  "different route",
  "different component",
  "different material/spec",
  "separately controlled packaging/configuration",
  "spec change after production started",
] as const;

export function isValidWorkOrderSplit(hasExistingWO: boolean, reason: string): boolean {
  return !hasExistingWO || WORK_ORDER_SPLIT_REASONS.some(value => value === reason);
}

export function workOrderWeightGrams(value: string): number | null {
  return value ? Number.parseFloat(value) : null;
}