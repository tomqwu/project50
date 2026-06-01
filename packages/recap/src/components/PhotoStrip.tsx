import React from "react";
import { useCurrentFrame, interpolate } from "remotion";
import { colors } from "../tokens.js";

export interface PhotoStripProps {
  /** Array of photo URLs to cycle through. When empty/undefined a neutral
   *  placeholder block is shown instead. */
  photoUrls?: string[];
  /** Number of frames each photo is displayed before cross-fading (default 60). */
  framesPerPhoto?: number;
  /** Number of frames for the cross-fade transition (default 15). */
  fadeDuration?: number;
  width?: number;
  height?: number;
}

/**
 * Fades through an array of `photoUrls` using interpolated opacity.
 * When `photoUrls` is empty or undefined it renders a charcoal placeholder —
 * no fake images, no network requests.
 */
export function PhotoStrip({
  photoUrls,
  framesPerPhoto = 60,
  fadeDuration = 15,
  width = 1080,
  height = 400,
}: PhotoStripProps) {
  const frame = useCurrentFrame();

  const urls = photoUrls && photoUrls.length > 0 ? photoUrls : null;

  if (!urls) {
    return (
      <div
        data-testid="photo-strip-placeholder"
        style={{
          width,
          height,
          background: colors.surface2,
          borderRadius: 24,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            fontFamily: "'Sora', sans-serif",
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: "0.22em",
            textTransform: "uppercase" as const,
            color: colors.muted,
          }}
        >
          No photos
        </span>
      </div>
    );
  }

  return (
    <div
      data-testid="photo-strip-images"
      style={{ position: "relative", width, height, borderRadius: 24, overflow: "hidden" }}
    >
      {urls.map((url, index) => {
        const start = index * framesPerPhoto;
        const end = start + framesPerPhoto;
        const fadeIn = [start, start + fadeDuration] as const;
        const fadeOut = [end - fadeDuration, end] as const;

        // Opacity schedule per image:
        //   index 0: always starts at 1 (its own window begins at frame 0).
        //   index > 0: 0 until window start, fade-in, hold, fade-out.
        let opacity: number;
        if (frame < fadeIn[0]) {
          // Before this image's window — always 0 (index 0 starts at frame 0 so
          // this branch is only reached for index > 0).
          opacity = 0;
        } else if (frame < fadeIn[1] && index > 0) {
          // Non-first images fade in from 0→1
          opacity = interpolate(frame, fadeIn, [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
        } else if (frame < fadeOut[0]) {
          // Hold at full opacity (covers first-image start and all hold phases)
          opacity = 1;
        } else {
          // Fade out 1→0
          opacity = interpolate(frame, fadeOut, [1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
        }

        return (
          <img
            key={url}
            src={url}
            alt={`recap photo ${index + 1}`}
            data-testid={`photo-strip-img-${index}`}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              opacity,
            }}
          />
        );
      })}
    </div>
  );
}
