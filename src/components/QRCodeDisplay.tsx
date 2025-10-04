import { QRCodeSVG } from 'qrcode.react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';

interface QRCodeDisplayProps {
  value: string;
  title: string;
  entityInfo?: string;
  size?: number;
}

export const QRCodeDisplay = ({ value, title, entityInfo, size = 200 }: QRCodeDisplayProps) => {
  const handleDownload = () => {
    const svg = document.getElementById(`qr-${value}`);
    if (!svg) return;
    
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
      canvas.width = size;
      canvas.height = size;
      ctx?.drawImage(img, 0, 0);
      const pngFile = canvas.toDataURL('image/png');
      
      const downloadLink = document.createElement('a');
      downloadLink.download = `${title}-${value}.png`;
      downloadLink.href = pngFile;
      downloadLink.click();
    };
    
    img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
  };

  return (
    <Card className="inline-block">
      <CardHeader>
        <CardTitle className="text-center text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        <QRCodeSVG 
          id={`qr-${value}`}
          value={value} 
          size={size}
          level="H"
          includeMargin
        />
        <div className="text-center">
          <p className="font-mono font-bold">{value}</p>
          {entityInfo && <p className="text-xs text-muted-foreground mt-1">{entityInfo}</p>}
        </div>
        <Button size="sm" variant="outline" onClick={handleDownload}>
          <Download className="h-4 w-4 mr-2" />
          Download QR
        </Button>
      </CardContent>
    </Card>
  );
};