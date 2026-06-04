"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button, Label } from "@project50/ui";

const ACTIVITY_TYPES = ["Run", "Bike", "Gym", "Yoga"] as const;
type ActivityType = (typeof ACTIVITY_TYPES)[number];

const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export interface SelectedMedia {
  objectKey: string;
  width: number;
  height: number;
  previewUrl: string;
}

/**
 * Read the natural dimensions of an image from a File.
 * Extracted as a named export so tests can mock it.
 */
export function readImageDimensions(
  file: File,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };
    img.src = url;
  });
}

export interface LogActivityFormProps {
  challengeId: string;
  goalType: "TARGET" | "BINARY";
  unit?: string | null;
  /** Injectable for testing — defaults to readImageDimensions */
  readDimensions?: (file: File) => Promise<{ width: number; height: number }>;
}

export function LogActivityForm({
  challengeId,
  goalType,
  unit,
  readDimensions = readImageDimensions,
}: LogActivityFormProps) {
  const router = useRouter();

  const [activityType, setActivityType] = useState<ActivityType | null>(null);
  const [amount, setAmount] = useState("");
  const [done, setDone] = useState(false);
  const [note, setNote] = useState("");
  const [mood, setMood] = useState<number | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Photo upload state
  const [selectedMedia, setSelectedMedia] = useState<SelectedMedia | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_TYPES.has(file.type)) {
      setUploadError("Only PNG, JPEG, and WebP images are supported.");
      return;
    }

    setUploadError(null);
    setUploading(true);

    try {
      // Read image dimensions
      const { width, height } = await readDimensions(file);

      // Derive a safe suffix from the filename (strip extension, sanitize)
      const baseName = file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64) || "upload";

      // POST /api/uploads/presign
      const presignRes = await fetch("/api/uploads/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: file.type, suffix: baseName }),
      });

      if (!presignRes.ok) {
        setUploadError("Failed to get upload URL. You can still submit without a photo.");
        return;
      }

      const { uploadUrl, objectKey, uploadHeaders } = (await presignRes.json()) as {
        uploadUrl: string;
        objectKey: string;
        uploadHeaders?: Record<string, string>;
      };

      // PUT the file bytes to the presigned URL. Spread the presign-provided
      // headers so backend-specific requirements (e.g. Azure's
      // x-ms-blob-type: BlockBlob) are sent; fall back to content-type only.
      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: uploadHeaders ?? { "content-type": file.type },
      });

      if (!putRes.ok) {
        setUploadError("Photo upload failed. You can still submit without a photo.");
        return;
      }

      // Success — keep the object URL as preview (will be revoked on unmount/clear)
      const previewUrl = URL.createObjectURL(file);
      setSelectedMedia({ objectKey, width, height, previewUrl });
    } catch {
      setUploadError("Photo upload failed. You can still submit without a photo.");
    } finally {
      setUploading(false);
    }
  }

  function handleRemovePhoto() {
    if (selectedMedia?.previewUrl) {
      URL.revokeObjectURL(selectedMedia.previewUrl);
    }
    setSelectedMedia(null);
    setUploadError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors([]);
    setSubmitting(true);

    const body: Record<string, unknown> = {
      dayKey: new Date().toISOString().slice(0, 10),
      activityType: activityType ?? undefined,
      note: note || undefined,
      mood: mood ?? undefined,
    };

    if (goalType === "TARGET") {
      body.amount = amount ? Number(amount) : undefined;
    } else {
      body.done = done;
    }

    // Include media if a photo was successfully uploaded
    if (selectedMedia) {
      body.media = [
        {
          objectKey: selectedMedia.objectKey,
          width: selectedMedia.width,
          height: selectedMedia.height,
        },
      ];
    }

    try {
      const res = await fetch(`/api/challenges/${challengeId}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        router.push("/");
        return;
      }

      if (res.status === 422) {
        const data = await res.json();
        const detail: string[] = Array.isArray(data?.detail)
          ? data.detail
          : typeof data?.detail === "string"
            ? [data.detail]
            : [data?.code ?? "Validation error"];
        setErrors(detail);
      } else {
        setErrors(["Something went wrong. Please try again."]);
      }
    } catch {
      setErrors(["Network error. Please try again."]);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        padding: "32px",
        maxWidth: "480px",
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: "24px",
      }}
    >
      <h1
        style={{
          fontFamily: "var(--font-display, 'Anton', sans-serif)",
          fontSize: "28px",
          letterSpacing: "0.03em",
          textTransform: "uppercase",
          color: "var(--text)",
          margin: 0,
        }}
      >
        Log Activity
      </h1>

      {/* Activity type chips */}
      <div>
        <Label>Activity type</Label>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "10px" }}>
          {ACTIVITY_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setActivityType(type === activityType ? null : type)}
              data-testid={`chip-${type.toLowerCase()}`}
              aria-pressed={activityType === type}
              style={{
                padding: "8px 16px",
                borderRadius: "999px",
                border: "1px solid var(--hairline)",
                background: activityType === type ? "var(--accent)" : "var(--card)",
                color: activityType === type ? "var(--bg)" : "var(--text)",
                fontFamily: "var(--font-body, system-ui)",
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Amount (TARGET) or Done toggle (BINARY) */}
      {goalType === "TARGET" ? (
        <div>
          <Label>{`Amount${unit ? ` (${unit})` : ""}`}</Label>
          <input
            type="number"
            min="0"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            data-testid="amount-input"
            placeholder="0"
            style={inputStyle}
          />
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <input
            type="checkbox"
            id="done-toggle"
            checked={done}
            onChange={(e) => setDone(e.target.checked)}
            data-testid="done-toggle"
            style={{ width: "20px", height: "20px", cursor: "pointer" }}
          />
          <label
            htmlFor="done-toggle"
            style={{ fontFamily: "var(--font-body, system-ui)", color: "var(--text)", cursor: "pointer" }}
          >
            Mark as done
          </label>
        </div>
      )}

      {/* Note */}
      <div>
        <Label>Note (optional)</Label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          data-testid="note-input"
          rows={3}
          placeholder="How did it feel?"
          style={{ ...inputStyle, resize: "vertical", minHeight: "72px" }}
        />
      </div>

      {/* Mood 1–5 */}
      <div>
        <Label>Mood</Label>
        <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
          {[1, 2, 3, 4, 5].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMood(m === mood ? null : m)}
              data-testid={`mood-${m}`}
              aria-pressed={mood === m}
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "50%",
                border: "1px solid var(--hairline)",
                background: mood === m ? "var(--accent)" : "var(--card)",
                color: mood === m ? "var(--bg)" : "var(--text)",
                fontFamily: "var(--font-display, 'Anton', sans-serif)",
                fontSize: "16px",
                cursor: "pointer",
              }}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Photo upload */}
      <div>
        <Label>Photo (optional)</Label>
        {/* The file input stays mounted (hidden) so its ref persists across
            select/remove cycles and the same file can be re-selected. */}
        <input
          id="photo-input"
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={handleFileChange}
          data-testid="photo-input"
          disabled={uploading}
          style={{ display: "none" }}
        />
        {selectedMedia ? (
          <div style={{ marginTop: "10px" }}>
            {/* Thumbnail preview */}
            <img
              src={selectedMedia.previewUrl}
              alt="Selected photo preview"
              data-testid="photo-preview"
              style={{
                display: "block",
                width: "100%",
                maxHeight: "200px",
                objectFit: "cover",
                borderRadius: "10px",
                marginBottom: "8px",
              }}
            />
            <button
              type="button"
              onClick={handleRemovePhoto}
              data-testid="remove-photo-btn"
              style={{
                fontFamily: "var(--font-body, system-ui)",
                fontSize: "13px",
                color: "var(--danger)",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
              }}
            >
              Remove photo
            </button>
          </div>
        ) : (
          <div style={{ marginTop: "10px" }}>
            <label
              htmlFor="photo-input"
              style={{
                display: "inline-block",
                padding: "10px 18px",
                borderRadius: "10px",
                border: "1px dashed var(--hairline)",
                background: "var(--card)",
                color: "var(--muted)",
                fontFamily: "var(--font-body, system-ui)",
                fontSize: "14px",
                cursor: uploading ? "wait" : "pointer",
              }}
            >
              {uploading ? "Uploading…" : "Choose photo"}
            </label>
          </div>
        )}

        {/* Upload error */}
        {uploadError && (
          <p
            data-testid="upload-error"
            style={{
              marginTop: "8px",
              fontFamily: "var(--font-body, system-ui)",
              fontSize: "13px",
              color: "var(--danger)",
            }}
          >
            {uploadError}
          </p>
        )}
      </div>

      {/* Inline validation errors */}
      {errors.length > 0 && (
        <ul
          data-testid="form-errors"
          style={{
            listStyle: "none",
            padding: "12px 16px",
            borderRadius: "8px",
            background: "rgba(229,72,77,0.12)",
            border: "1px solid rgba(229,72,77,0.3)",
            margin: 0,
          }}
        >
          {errors.map((err, i) => (
            <li
              key={i}
              style={{
                fontFamily: "var(--font-body, system-ui)",
                color: "var(--danger)",
                fontSize: "14px",
              }}
            >
              {err}
            </li>
          ))}
        </ul>
      )}

      <Button type="submit" variant="primary" disabled={submitting}>
        {submitting ? "Logging…" : "Log activity"}
      </Button>
    </form>
  );
}

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "14px 16px",
  marginTop: "8px",
  borderRadius: "12px",
  border: "1px solid var(--hairline)",
  background: "var(--card)",
  color: "var(--text)",
  fontFamily: "var(--font-body, system-ui)",
  fontSize: "16px",
};
