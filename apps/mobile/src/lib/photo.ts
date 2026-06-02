/**
 * Photo utilities for the project50 mobile app.
 *
 * pickImage(): wraps expo-image-picker — the picker call is the thin native-glue line.
 * uploadPhoto(): presign → PUT to storage → return objectKey + dimensions.
 */

import * as ImagePicker from "expo-image-picker";
import type { ApiClient } from "./apiClient";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PickedImage {
  uri: string;
  width: number;
  height: number;
  mimeType: string;
}

export interface UploadedPhoto {
  objectKey: string;
  width: number;
  height: number;
}

// ─── pickImage ────────────────────────────────────────────────────────────────

/**
 * Present the system image picker (photo library).
 * Returns the picked image info, or null if the user cancelled.
 *
 * COVERAGE EXCLUSION: This entire function is a thin native bridge wrapper.
 * launchImageLibraryAsync is a single native call with no branching logic of
 * our own. The testable logic (parsePickerResult) is exercised separately.
 * See COVERAGE.md.
 */
/* istanbul ignore next */
export async function pickImageFromLibrary(): Promise<PickedImage | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.85,
    allowsEditing: false,
  });
  return parsePickerResult(result);
}

/**
 * Present the camera to capture a new photo.
 * Returns the captured image info, or null if the user cancelled.
 *
 * COVERAGE EXCLUSION: Same as pickImageFromLibrary — thin native wrapper.
 * See COVERAGE.md.
 */
/* istanbul ignore next */
export async function pickImageFromCamera(): Promise<PickedImage | null> {
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.85,
    allowsEditing: false,
  });
  return parsePickerResult(result);
}

/**
 * Parse an ImagePickerResult into our PickedImage shape.
 * Testable: the result object is passed in, no native call here.
 */
export function parsePickerResult(
  result: ImagePicker.ImagePickerResult,
): PickedImage | null {
  if (result.canceled || !result.assets || result.assets.length === 0) {
    return null;
  }

  const asset = result.assets[0]!;
  return {
    uri: asset.uri,
    width: asset.width,
    height: asset.height,
    mimeType: asset.mimeType ?? "image/jpeg",
  };
}

// ─── uploadPhoto ──────────────────────────────────────────────────────────────

/**
 * Upload a photo to storage:
 * 1. Presign a PUT URL via the API.
 * 2. PUT the file bytes directly to the storage URL.
 * 3. Return the objectKey + dimensions for use in logActivity.
 */
export async function uploadPhoto(
  client: ApiClient,
  uri: string,
  mimeType: string,
  ext: string,
  suffix: string,
  width: number,
  height: number,
): Promise<UploadedPhoto> {
  // Step 1: Get presigned PUT URL
  const { uploadUrl, objectKey } = await client.presignUpload(mimeType, ext, suffix);

  // Step 2: Fetch the local file as a blob and PUT it
  // In React Native, fetch on a file:// URI returns a blob-like response.
  const fileResponse = await fetch(uri);
  const blob = await fileResponse.blob();

  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": mimeType },
    body: blob,
  });

  if (!uploadResponse.ok) {
    throw new Error(`Photo upload failed: ${uploadResponse.status}`);
  }

  return { objectKey, width, height };
}
