import { useState, useEffect, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calculator, Scale, Hash } from "lucide-react";

export interface PCSEstimation {
  sampleCount: number | null;
  sampleWeight: number | null;
  avgWeightPerPc: number | null;
  estimatedPcs: number | null;
}

interface PCSEstimationSectionProps {
  netWeight: number;
  onChange: (estimation: PCSEstimation) => void;
  disabled?: boolean;
}

export function PCSEstimationSection({
  netWeight,
  onChange,
  disabled = false
}: PCSEstimationSectionProps) {
  const [sampleCount, setSampleCount] = useState<string>('');
  const [sampleWeight, setSampleWeight] = useState<string>('');

  // Calculate avg weight per piece and estimated PCS
  const calculation = useMemo(() => {
    const count = parseFloat(sampleCount) || 0;
    const weight = parseFloat(sampleWeight) || 0;

    if (count <= 0 || weight <= 0) {
      return { avgWeightPerPc: null, estimatedPcs: null };
    }

    const avgWeightPerPc = weight / count;
    const estimatedPcs = netWeight > 0 ? Math.round(netWeight / avgWeightPerPc) : 0;

    return { avgWeightPerPc, estimatedPcs };
  }, [sampleCount, sampleWeight, netWeight]);

  // Notify parent of changes
  useEffect(() => {
    onChange({
      sampleCount: parseFloat(sampleCount) || null,
      sampleWeight: parseFloat(sampleWeight) || null,
      avgWeightPerPc: calculation.avgWeightPerPc,
      estimatedPcs: calculation.estimatedPcs
    });
  }, [sampleCount, sampleWeight, calculation, onChange]);

  return (
    <div className="border rounded-lg p-4 bg-purple-500/5 space-y-4">
      <div className="flex items-center gap-2">
        <Calculator className="h-4 w-4 text-purple-600" />
        <h4 className="font-medium text-purple-900 dark:text-purple-100">
          PCS Estimation (Optional)
        </h4>
      </div>
      <p className="text-xs text-muted-foreground">
        For external processes: estimate piece count from sample weighing. Weight remains the source of truth.
      </p>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-sm flex items-center gap-1">
            <Hash className="h-3 w-3" />
            Sample Count (pcs)
          </Label>
          <Input
            type="number"
            min="1"
            step="1"
            value={sampleCount}
            onChange={(e) => setSampleCount(e.target.value)}
            placeholder="e.g. 5 or 10"
            className="h-9"
            disabled={disabled}
          />
        </div>
        <div>
          <Label className="text-sm flex items-center gap-1">
            <Scale className="h-3 w-3" />
            Sample Weight (kg)
          </Label>
          <Input
            type="number"
            min="0.001"
            step="0.001"
            value={sampleWeight}
            onChange={(e) => setSampleWeight(e.target.value)}
            placeholder="e.g. 0.250"
            className="h-9"
            disabled={disabled}
          />
        </div>
      </div>

      {/* Results */}
      {calculation.avgWeightPerPc !== null && calculation.estimatedPcs !== null && (
        <div className="grid grid-cols-3 gap-4 pt-3 border-t border-purple-200 dark:border-purple-800">
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Avg Wt/Pc</p>
            <p className="font-semibold text-purple-700 dark:text-purple-300">
              {calculation.avgWeightPerPc.toFixed(4)} kg
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Net Weight</p>
            <p className="font-semibold">{netWeight.toFixed(3)} kg</p>
          </div>
          <div className="text-center bg-purple-100 dark:bg-purple-900/30 rounded-lg py-1">
            <p className="text-xs text-muted-foreground">Estimated PCS</p>
            <p className="font-bold text-lg text-purple-700 dark:text-purple-300">
              {calculation.estimatedPcs.toLocaleString()}
            </p>
          </div>
        </div>
      )}

      {!calculation.avgWeightPerPc && (
        <div className="text-center py-2 text-xs text-muted-foreground bg-muted/50 rounded">
          Enter sample count and weight to calculate estimated PCS
        </div>
      )}
    </div>
  );
}
