import * as React from "react";
import { UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DropzoneProps {
  onFilesSelected: (files: FileList | null) => void;
  accept?: string;
  multiple?: boolean;
  isUploading?: boolean;
  uploadProgress?: number;
  label?: string;
  hint?: string;
  className?: string;
}

export function Dropzone({
  onFilesSelected,
  accept = "video/mp4,video/quicktime,video/x-matroska,video/webm",
  multiple = true,
  isUploading = false,
  uploadProgress,
  label = "Tarik & lepas file di sini, atau",
  hint = "Mendukung MP4, MOV, MKV, WebM",
  className,
}: DropzoneProps) {
  const [isDragging, setIsDragging] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFilesSelected(e.dataTransfer.files);
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
      className={cn(
        "relative group cursor-pointer border border-dashed rounded-xl p-4 text-center transition-all duration-200 select-none",
        isDragging
          ? "border-[#3ECF8E] bg-[#3ECF8E]/10"
          : "border-[#2E2E2E] bg-[#181818]/50 hover:border-[#3ECF8E]/40 hover:bg-[#181818]",
        className
      )}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => onFilesSelected(e.target.files)}
      />

      <div className="flex items-center justify-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-[#3ECF8E]/10 border border-[#3ECF8E]/20 flex items-center justify-center text-[#3ECF8E] shrink-0 group-hover:scale-105 transition-transform">
          <UploadCloud className="w-4 h-4" />
        </div>
        <div className="text-left">
          <p className="text-xs font-medium text-foreground">
            {label}{" "}
            <span className="text-[#3ECF8E] group-hover:underline font-semibold">pilih file</span>
          </p>
          {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
        </div>
      </div>

      {isUploading && (
        <div className="w-full mt-3 bg-black/50 rounded-full h-1 overflow-hidden">
          {uploadProgress !== undefined ? (
            <div
              className="bg-[#3ECF8E] h-full rounded-full transition-all duration-300"
              style={{ width: `${Math.max(5, uploadProgress)}%` }}
            />
          ) : (
            <div className="w-1/3 bg-[#3ECF8E] h-full rounded-full animate-progress-indeterminate" />
          )}
        </div>
      )}
    </div>
  );
}
