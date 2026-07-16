// Client-side Image Compression using HTML5 Canvas (runs instantly on iOS/Android)
export async function compressImageClient(
  file: File,
  maxWidth = 1920,
  maxHeight = 1920,
  quality = 0.8
): Promise<File> {
  // If file is not an image, skip
  if (!file.type.startsWith('image/')) {
    return file;
  }

  // Create an image object
  const img = new Image();
  img.src = URL.createObjectURL(file);

  return new Promise((resolve, reject) => {
    img.onload = () => {
      URL.revokeObjectURL(img.src);

      let width = img.width;
      let height = img.height;

      // Maintain aspect ratio
      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      // Draw onto canvas
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        resolve(file); // Fallback to raw file if canvas context is unavailable
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      // Convert back to file
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }
          const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", {
            type: 'image/jpeg',
            lastModified: Date.now(),
          });
          resolve(compressedFile);
        },
        'image/jpeg',
        quality
      );
    };

    img.onerror = (err) => {
      URL.revokeObjectURL(img.src);
      reject(err);
    };
  });
}

// Format bytes to readable string
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Client-side file type and extension validator
export function validateFile(file: File): { isValid: boolean; error?: string } {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/heic'];
  
  // Extension check (since some mobile files might miss mime-types)
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const allowedExtensions = ['jpg', 'jpeg', 'png', 'heic'];

  if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(ext)) {
    return {
      isValid: false,
      error: 'Tipe file tidak didukung. Hanya JPG, JPEG, PNG, dan HEIC yang diperbolehkan.',
    };
  }

  // 10MB check
  if (file.size > 10 * 1024 * 1024) {
    return {
      isValid: false,
      error: 'Ukuran file melebihi batas 10 MB.',
    };
  }

  return { isValid: true };
}

// Heuristics document classification check from file names
export function scanFilenameForCategory(fieldName: string, fileName: string): { warning: boolean; message?: string } {
  const f = fileName.toLowerCase();
  const field = fieldName.toLowerCase();

  // If KTP file is put into SPK field
  if (field === 'spk' && (f.includes('ktp') || f.includes('nik') || f.includes('identitas'))) {
    return { warning: true, message: 'Sepertinya Anda mengunggah KTP di kolom SPK. Mohon periksa kembali.' };
  }

  // If SPK file is put into KTP field
  if (field === 'ktp' && (f.includes('spk') || f.includes('pesanan') || f.includes('invoice') || f.includes('faktur'))) {
    return { warning: true, message: 'Sepertinya Anda mengunggah SPK di kolom KTP. Mohon periksa kembali.' };
  }

  // If Payment is put into Unit hand over
  if (field === 'unit' && (f.includes('bukti') || f.includes('bayar') || f.includes('tf') || f.includes('transfer'))) {
    return { warning: true, message: 'Sepertinya Anda mengunggah Bukti Pembayaran di kolom Unit Serah Terima. Mohon periksa kembali.' };
  }

  return { warning: false };
}
