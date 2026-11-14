/**
 * Client-side image compressor for photo evidence.
 * Resizes large photos to a maximum dimension (default 1920px) while maintaining aspect ratio,
 * compressing to high-quality JPEG (0.85) to optimize mobile bandwidth without losing evidence fidelity.
 */
export interface CompressedImageResult {
  file: File;
  dataUrl: string;
  originalSize: number;
  compressedSize: number;
  width: number;
  height: number;
}

export async function compressImage(
  file: File,
  maxDimension = 1920,
  quality = 0.85
): Promise<CompressedImageResult> {
  // If not an image, return original
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
    const dataUrl = await fileToDataUrl(file);
    return {
      file,
      dataUrl,
      originalSize: file.size,
      compressedSize: file.size,
      width: 0,
      height: 0,
    };
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.src = e.target?.result as string;
    };

    reader.onerror = () => reject(new Error('Failed to read file'));

    img.onload = () => {
      let width = img.width;
      let height = img.height;

      // Calculate new dimensions
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas 2D context'));
        return;
      }

      // Draw and compress
      ctx.drawImage(img, 0, 0, width, height);
      const outputMime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      const dataUrl = canvas.toDataURL(outputMime, quality);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Canvas to blob failed'));
            return;
          }
          const compressedFile = new File([blob], file.name, {
            type: outputMime,
            lastModified: Date.now(),
          });

          resolve({
            file: compressedFile,
            dataUrl,
            originalSize: file.size,
            compressedSize: compressedFile.size,
            width,
            height,
          });
        },
        outputMime,
        quality
      );
    };

    img.onerror = () => reject(new Error('Failed to load image for compression'));

    reader.readAsDataURL(file);
  });
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
