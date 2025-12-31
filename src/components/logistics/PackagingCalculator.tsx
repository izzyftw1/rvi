import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Scale, Package } from "lucide-react";

// Standardized packaging options with fixed weights
export const PACKAGING_OPTIONS = {
  NONE: { label: 'None / N/A', weight: 0 },
  CRATE_1_3: { label: 'Crate – 1.3 kg', weight: 1.3 },
  CRATE_1_2: { label: 'Crate – 1.2 kg', weight: 1.2 },
  CRATE_1_1: { label: 'Crate – 1.1 kg', weight: 1.1 },
  CRATE_0_7: { label: 'Crate – 0.7 kg', weight: 0.7 },
  BAG_0_10: { label: 'Bag – 0.10 kg', weight: 0.10 },
  BAG_0_075: { label: 'Bag – 0.075 kg', weight: 0.075 },
} as const;

export type PackagingType = keyof typeof PACKAGING_OPTIONS;

export interface PackagingRow {
  id: string;
  type: PackagingType;
  count: number;
}

interface PackagingCalculatorProps {
  grossWeight: number;
  onNetWeightChange: (netWeight: number, tareWeight: number, packagingRows: PackagingRow[], manualTareOverride: number | null) => void;
  defaultToNone?: boolean;
  initialPackaging?: PackagingRow[];
  initialManualTare?: number | null;
}

export function PackagingCalculator({
  grossWeight,
  onNetWeightChange,
  defaultToNone = false,
  initialPackaging,
  initialManualTare = null
}: PackagingCalculatorProps) {
  const [packagingRows, setPackagingRows] = useState<PackagingRow[]>(
    initialPackaging || [{ id: crypto.randomUUID(), type: 'NONE', count: 1 }]
  );
  const [useManualTare, setUseManualTare] = useState(initialManualTare !== null);
  const [manualTare, setManualTare] = useState<string>(initialManualTare?.toString() || '');

  // Calculate tare from packaging rows
  const calculatedTare = useMemo(() => {
    return packagingRows.reduce((total, row) => {
      const option = PACKAGING_OPTIONS[row.type];
      return total + (option.weight * row.count);
    }, 0);
  }, [packagingRows]);

  // Effective tare weight (manual override or calculated)
  const effectiveTare = useMemo(() => {
    if (useManualTare && manualTare) {
      return parseFloat(manualTare) || 0;
    }
    return calculatedTare;
  }, [useManualTare, manualTare, calculatedTare]);

  // Net weight calculation
  const netWeight = useMemo(() => {
    return Math.max(0, grossWeight - effectiveTare);
  }, [grossWeight, effectiveTare]);

  // Notify parent of changes
  useEffect(() => {
    onNetWeightChange(
      netWeight, 
      effectiveTare, 
      packagingRows,
      useManualTare ? (parseFloat(manualTare) || 0) : null
    );
  }, [netWeight, effectiveTare, packagingRows, useManualTare, manualTare]);

  const addPackagingRow = () => {
    setPackagingRows(prev => [
      ...prev,
      { id: crypto.randomUUID(), type: 'NONE', count: 1 }
    ]);
  };

  const removePackagingRow = (id: string) => {
    if (packagingRows.length > 1) {
      setPackagingRows(prev => prev.filter(row => row.id !== id));
    }
  };

  const updatePackagingRow = (id: string, field: 'type' | 'count', value: string | number) => {
    setPackagingRows(prev => prev.map(row => {
      if (row.id === id) {
        if (field === 'type') {
          return { ...row, type: value as PackagingType };
        } else {
          return { ...row, count: Math.max(1, Number(value) || 1) };
        }
      }
      return row;
    }));
  };

  // Reset to None/N/A when defaultToNone changes to true
  useEffect(() => {
    if (defaultToNone && packagingRows.length === 1 && packagingRows[0].type !== 'NONE') {
      setPackagingRows([{ id: crypto.randomUUID(), type: 'NONE', count: 1 }]);
    }
  }, [defaultToNone]);

  return (
    <div className="border rounded-lg p-4 bg-muted/30 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-medium flex items-center gap-2">
          <Package className="h-4 w-4" />
          Packaging & Tare Weight
        </h4>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addPackagingRow}
          className="h-8"
        >
          <Plus className="h-3 w-3 mr-1" />
          Add Row
        </Button>
      </div>

      {/* Packaging Rows */}
      <div className="space-y-2">
        {packagingRows.map((row, index) => (
          <div key={row.id} className="flex items-center gap-2">
            <div className="flex-1">
              <Select
                value={row.type}
                onValueChange={(v) => updatePackagingRow(row.id, 'type', v)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  {Object.entries(PACKAGING_OPTIONS).map(([key, option]) => (
                    <SelectItem key={key} value={key}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-20">
              <Input
                type="number"
                min="1"
                value={row.count}
                onChange={(e) => updatePackagingRow(row.id, 'count', parseInt(e.target.value) || 1)}
                className="h-9 text-center"
                disabled={row.type === 'NONE'}
              />
            </div>
            <div className="w-24 text-right text-sm text-muted-foreground">
              = {(PACKAGING_OPTIONS[row.type].weight * row.count).toFixed(3)} kg
            </div>
            {packagingRows.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => removePackagingRow(row.id)}
              >
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            )}
          </div>
        ))}
      </div>

      {/* Manual Tare Override */}
      <div className="flex items-center justify-between pt-2 border-t">
        <div className="flex items-center gap-2">
          <Switch
            id="manual-tare"
            checked={useManualTare}
            onCheckedChange={setUseManualTare}
          />
          <Label htmlFor="manual-tare" className="text-sm cursor-pointer">
            Manual tare override
          </Label>
        </div>
        {useManualTare && (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              step="0.001"
              value={manualTare}
              onChange={(e) => setManualTare(e.target.value)}
              placeholder="0.000"
              className="w-24 h-8 text-right"
            />
            <span className="text-sm text-muted-foreground">kg</span>
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 pt-3 border-t">
        <div className="text-center">
          <p className="text-xs text-muted-foreground">Gross Weight</p>
          <p className="font-semibold">{grossWeight.toFixed(3)} kg</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-muted-foreground">
            Tare {useManualTare ? '(Manual)' : `(${packagingRows.filter(r => r.type !== 'NONE').length} items)`}
          </p>
          <p className="font-semibold text-amber-600">– {effectiveTare.toFixed(3)} kg</p>
        </div>
        <div className="text-center bg-primary/10 rounded-lg py-1">
          <p className="text-xs text-muted-foreground">Net Weight</p>
          <p className="font-bold text-lg text-primary">{netWeight.toFixed(3)} kg</p>
        </div>
      </div>
    </div>
  );
}
