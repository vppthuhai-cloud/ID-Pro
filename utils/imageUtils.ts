export const calculateSmartCrop = (
  faceBox: { ymin: number, xmin: number, ymax: number, xmax: number } | null,
  imgWidth: number,
  imgHeight: number,
  targetAspectRatio: number // width / height
): { x: number; y: number; width: number; height: number } => {
  // Returns normalized coordinates (0-1)

  let x = 0, y = 0, w = 0, h = 0;
  let useFace = false;

  // Use normalized face detection coordinates if available and valid
  if (faceBox) {
      // Check if face box implies a valid size (not tiny garbage noise)
      const faceW = (faceBox.xmax - faceBox.xmin);
      const faceH = (faceBox.ymax - faceBox.ymin);
      
      if (faceW > 0.05 && faceH > 0.05) {
           const faceCX = (faceBox.xmin + faceBox.xmax) / 2;
           // const faceCY = (faceBox.ymin + faceBox.ymax) / 2; // Old centering logic

           // Standard ID Composition: Face height is approx 60% of photo height.
           // We use normalized coordinates directly.
           // Using 0.58 instead of 0.60 to give just a tiny bit more breathing room
           h = faceH / 0.58; 
           
           // Calculate width based on target aspect ratio
           const imgAspect = imgWidth / imgHeight;
           w = h * (1 / imgAspect) * targetAspectRatio;

           // Center X around face center
           x = faceCX - (w / 2);
           
           // Position Y: Professional ID photos have the face shifted upwards.
           // Instead of centering, we position the top of the face box at approx 12% of the total frame height.
           // This provides the standard "headroom" without too much empty space, allowing more chest/shoulder visibility.
           const headroomRatio = 0.12; 
           y = faceBox.ymin - (h * headroomRatio);
           
           useFace = true;
      }
  } 
  
  if (!useFace) {
      // Default Center Crop if no face detected
      const imgAspect = imgWidth / imgHeight;
      
      // If image is wider than target, fit height
      if (imgAspect > targetAspectRatio) {
          h = 0.8; // 80% height
          w = h * (1 / imgAspect) * targetAspectRatio;
      } else {
          // Image is taller, fit width
          w = 0.8; // 80% width
          h = w * (imgAspect) / targetAspectRatio;
      }

      x = 0.5 - (w / 2);
      y = 0.5 - (h / 2);
  }

  // Boundary Checks (Clamp to ensure we don't crop way outside, 
  // though we allow some white space padding which cropImage handles)
  
  // If the calculated box is bigger than the image, scale it down to fit
  if (w > 1) {
      const scale = 1 / w;
      w *= scale;
      h *= scale;
      x = 0.5 - (w / 2);
      y = 0.5 - (h / 2); // Center if full width
  }
  if (h > 1) {
      const scale = 1 / h;
      w *= scale;
      h *= scale;
      x = 0.5 - (w / 2);
      // Recalculate Y based on scale? 
      // Actually if H > 1, we are zoomed out max. 
      // Ideally we should still try to offset face, but clamping to center is safer to avoid OOB too much.
      // But let's stick to the offset logic if possible, just scaled.
      // However, simplified scaling clamp:
      y = 0.5 - (h / 2); 
  }

  return { x, y, width: w, height: h };
};

export const cropImage = (
  imageSrc: string,
  cropArea: { x: number; y: number; width: number; height: number }, // Percentages (0-1)
  targetConfig: { widthMm: number; heightMm: number },
  backgroundColor: string = '#ffffff' // Default fill color for out-of-bounds areas
): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (cropArea.width <= 0 || cropArea.height <= 0) {
        reject(new Error("Vùng cắt ảnh không hợp lệ (kích thước 0). Vui lòng thử lại."));
        return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scaleFactor = 11.81; // ~300 DPI
      const targetWidthPx = Math.round(targetConfig.widthMm * scaleFactor);
      const targetHeightPx = Math.round(targetConfig.heightMm * scaleFactor);

      canvas.width = targetWidthPx;
      canvas.height = targetHeightPx;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error("Could not get canvas context"));
        return;
      }

      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, targetWidthPx, targetHeightPx);

      const sourceW = cropArea.width * img.naturalWidth;
      const sourceH = cropArea.height * img.naturalHeight;
      const sourceX = cropArea.x * img.naturalWidth;
      const sourceY = cropArea.y * img.naturalHeight;

      if (sourceW === 0 || sourceH === 0) {
          reject(new Error("Invalid crop dimensions"));
          return;
      }

      const scaleX = targetWidthPx / sourceW;
      const scaleY = targetHeightPx / sourceH;

      const drawX = -sourceX * scaleX;
      const drawY = -sourceY * scaleY;
      const drawW = img.naturalWidth * scaleX;
      const drawH = img.naturalHeight * scaleY;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      ctx.drawImage(img, drawX, drawY, drawW, drawH);

      resolve(canvas.toDataURL('image/jpeg', 0.95));
    };
    img.onerror = () => reject(new Error("Failed to load original image for cropping"));
    img.src = imageSrc;
  });
};

export const generatePrintSheet = (
    photoSrc: string,
    sheetWidthMm: number = 100,
    sheetHeightMm: number = 150,
    photoWidthMm: number,
    photoHeightMm: number,
    gapMm: number = 2
): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const scaleFactor = 11.81; 
            
            const sheetWidthPx = Math.round(sheetWidthMm * scaleFactor);
            const sheetHeightPx = Math.round(sheetHeightMm * scaleFactor);
            const photoWidthPx = Math.round(photoWidthMm * scaleFactor);
            const photoHeightPx = Math.round(photoHeightMm * scaleFactor);
            const gapPx = Math.round(gapMm * scaleFactor);

            canvas.width = sheetWidthPx;
            canvas.height = sheetHeightPx;
            
            const ctx = canvas.getContext('2d');
             if (!ctx) {
                reject(new Error("Could not get canvas context"));
                return;
            }

            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, sheetWidthPx, sheetHeightPx);

            const cols = Math.floor((sheetWidthPx + gapPx) / (photoWidthPx + gapPx));
            const rows = Math.floor((sheetHeightPx + gapPx) / (photoHeightPx + gapPx));

            const gridWidth = cols * photoWidthPx + (cols - 1) * gapPx;
            const gridHeight = rows * photoHeightPx + (rows - 1) * gapPx;
            
            const startX = (sheetWidthPx - gridWidth) / 2;
            const startY = (sheetHeightPx - gridHeight) / 2;

            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const x = startX + c * (photoWidthPx + gapPx);
                    const y = startY + r * (photoHeightPx + gapPx);
                    ctx.drawImage(img, x, y, photoWidthPx, photoHeightPx);
                    
                    ctx.strokeStyle = '#e2e8f0';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(x, y, photoWidthPx, photoHeightPx);
                }
            }

            resolve(canvas.toDataURL('image/jpeg', 0.95));
        };
        img.onerror = reject;
        img.src = photoSrc;
    });
}

export const saveImageAs = (base64Data: string, fileName: string, format: 'png' | 'jpeg') => {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(img, 0, 0);
      const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
      const quality = format === 'jpeg' ? 0.95 : undefined;
      const dataUrl = canvas.toDataURL(mimeType, quality);
      
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `${fileName}.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };
  img.src = base64Data;
};

// Rotates the image so that the line connecting leftEye and rightEye becomes horizontal.
// Returns a Promise with the base64 string of the rotated image.
export const rotateImage = (
    imageSrc: string, 
    leftEye: { x: number, y: number }, // normalized
    rightEye: { x: number, y: number } // normalized
): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            const canvas = document.createElement('canvas');
            // We want to keep the whole image visible after rotation, so canvas might need to be larger.
            // But for simplicity in ID context, keeping same size and filling background is often okay 
            // because we will crop the center anyway. To be safe, let's keep dimensions.
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;

            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error("No context"));
                return;
            }

            // Calculate angle
            // Eyes are normalized (0-1). Convert to pixels.
            const lx = leftEye.x * img.naturalWidth;
            const ly = leftEye.y * img.naturalHeight;
            const rx = rightEye.x * img.naturalWidth;
            const ry = rightEye.y * img.naturalHeight;

            const dy = ry - ly;
            const dx = rx - lx;
            const angle = Math.atan2(dy, dx); 

            // If angle is negligible (< 1 degree), just return original
            if (Math.abs(angle) < 0.017) { // ~1 degree in radians
                resolve(imageSrc);
                return;
            }

            // Draw rotated
            ctx.fillStyle = '#ffffff'; // Fill background white
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.rotate(-angle); // Rotate opposite to the tilt
            ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
            
            resolve(canvas.toDataURL('image/jpeg', 0.95));
        };
        img.onerror = reject;
        img.src = imageSrc;
    });
};