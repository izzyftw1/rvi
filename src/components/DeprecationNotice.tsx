import { AlertTriangle, ExternalLink } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { getDeprecationInfo } from "@/config/deprecationConfig";

interface DeprecationNoticeProps {
  currentPath: string;
}

/**
 * Displays a deprecation notice banner when viewing a deprecated page.
 * Shows information about the replacement page if available.
 */
export function DeprecationNotice({ currentPath }: DeprecationNoticeProps) {
  const navigate = useNavigate();
  const deprecationInfo = getDeprecationInfo(currentPath);

  if (!deprecationInfo || deprecationInfo.status !== 'deprecated') {
    return null;
  }

  return (
    <Alert variant="destructive" className="mb-4 border-amber-500 bg-amber-50 dark:bg-amber-950/20">
      <AlertTriangle className="h-4 w-4 text-amber-600" />
      <AlertTitle className="text-amber-800 dark:text-amber-200">
        Deprecated Page
      </AlertTitle>
      <AlertDescription className="text-amber-700 dark:text-amber-300">
        <div className="space-y-2">
          <p>
            This page has been deprecated and is no longer accessible from navigation.
            It remains available temporarily for verification purposes.
          </p>
          {deprecationInfo.deprecatedDate && (
            <p className="text-sm">
              Deprecated on: {deprecationInfo.deprecatedDate}
            </p>
          )}
          {deprecationInfo.notes && (
            <p className="text-sm italic">{deprecationInfo.notes}</p>
          )}
          {deprecationInfo.replacedBy && (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-sm">Replaced by:</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(deprecationInfo.replacedBy!)}
                className="gap-1"
              >
                Go to new page
                <ExternalLink className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}
