"use client";

import { useState, useRef } from "react";
import { Upload, X, Loader2 } from "lucide-react";
import { MenuItemImage } from "@/components/menu-item-image";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { uploadToImgBB } from "@/lib/upload-image";
import { toast } from "sonner";

interface ImageUploadProps {
  value?: string;
  onChange: (url: string | undefined) => void;
  label?: string;
}

export function ImageUpload({ value, onChange, label = "Product image" }: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5MB");
      return;
    }
    setUploading(true);
    try {
      const url = await uploadToImgBB(file);
      onChange(url);
      toast.success("Image uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-2 flex flex-wrap items-start gap-4">
        {value && (
          <div className="relative h-28 w-28 overflow-hidden rounded-xl border">
            <MenuItemImage src={value} alt="Preview" fill />
            <button
              type="button"
              className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white"
              onClick={() => onChange(undefined)}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
        <div>
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
          <Button
            type="button"
            variant="outline"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            {uploading ? "Uploading..." : value ? "Change image" : "Upload image"}
          </Button>
          <p className="mt-1 text-xs text-muted-foreground">
            Uploads to ImgBB → URL saved on menu item in Firestore when you click Save
          </p>
        </div>
      </div>
    </div>
  );
}
