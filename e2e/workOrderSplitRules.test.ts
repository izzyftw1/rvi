import { describe, expect, test } from "bun:test";
import { isValidWorkOrderSplit, workOrderWeightGrams } from "../src/lib/workOrderSplitRules";

describe("distinct manufacturing requirements", () => {
  test("a second WO requires a reason rather than another production run", () => {
    expect(isValidWorkOrderSplit(true, "")).toBe(false);
    expect(isValidWorkOrderSplit(true, "another production run")).toBe(false);
    expect(isValidWorkOrderSplit(false, "")).toBe(true);
  });
  for (const reason of ["different route", "different component", "different material/spec", "separately controlled packaging/configuration", "spec change after production started"]) {
    test(`allows ${reason}`, () => expect(isValidWorkOrderSplit(true, reason)).toBe(true));
  }
  test("WO weight is stored in grams without converting to kilograms", () => {
    expect(workOrderWeightGrams("1250")).toBe(1250);
    expect(workOrderWeightGrams("")).toBeNull();
  });
});