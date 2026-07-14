"use client";

import { useState, useRef, useTransition } from "react";
import { BookOpen, Upload, Loader2 } from "lucide-react";
import { uploadStoryCover } from "@/lib/library/actions";

export function StoryCoverUpload({
  storyId,
  initialCoverUrl,
}: {
  storyId: string;
  initialCoverUrl: string | null;
}) {
  const [coverUrl, setCoverUrl] = useState<string | null>(initialCoverUrl);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Optimistic preview
    const objectUrl = URL.createObjectURL(file);
    setCoverUrl(objectUrl);

    startTransition(async () => {
      const formData = new FormData();
      formData.append("coverFile", file);
      
      const result = await uploadStoryCover(storyId, formData);
      if (result.error) {
        alert(result.error);
        setCoverUrl(initialCoverUrl); // revert
      } else if (result.coverImageUrl) {
        setCoverUrl(result.coverImageUrl);
      }
    });
  };

  return (
    <div 
      className="group relative flex h-20 w-14 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-xl border shadow-sm transition-opacity hover:opacity-90"
      style={{
        background: coverUrl 
          ? `url(${coverUrl}) center/cover no-repeat` 
          : "linear-gradient(160deg, var(--kd-binding), color-mix(in srgb, var(--kd-binding) 55%, #000))",
        borderColor: "color-mix(in srgb, var(--kd-gilt) 45%, transparent)",
        color: "var(--kd-accent-foreground)",
      }}
      onClick={() => fileInputRef.current?.click()}
    >
      <input
        type="file"
        accept="image/png, image/jpeg, image/webp, image/gif"
        className="hidden"
        ref={fileInputRef}
        onChange={handleFileChange}
      />
      
      {!coverUrl && !isPending && <BookOpen size={22} />}
      
      {/* Hover overlay */}
      <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
        {isPending ? (
          <Loader2 className="animate-spin text-white" size={20} />
        ) : (
          <Upload className="text-white" size={20} />
        )}
      </div>
    </div>
  );
}
