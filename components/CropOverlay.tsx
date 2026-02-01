import React, { useEffect, useRef, useState } from 'react';

interface CropOverlayProps {
  aspectRatio: number; // width / height
  onCropChange: (crop: { x: number; y: number; width: number; height: number }) => void;
  containerWidth: number;
  containerHeight: number;
  isVisible: boolean;
  faceBox?: { ymin: number, xmin: number, ymax: number, xmax: number } | null;
}

type DragMode = 'move' | 'nw' | 'ne' | 'sw' | 'se' | null;

const CropOverlay: React.FC<CropOverlayProps> = ({ 
    aspectRatio, 
    onCropChange, 
    containerWidth, 
    containerHeight,
    isVisible,
    faceBox
}) => {
  const [position, setPosition] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const dragMode = useRef<DragMode>(null);
  const dragStart = useRef({ x: 0, y: 0 });
  const startPos = useRef({ x: 0, y: 0, w: 0, h: 0 });

  // Initialize crop box
  useEffect(() => {
    if (containerWidth === 0 || containerHeight === 0) return;

    let x = 0, y = 0, w = 0, h = 0;
    let useFace = false;

    if (faceBox) {
        // Validate facebox size
        const faceW = (faceBox.xmax - faceBox.xmin) * containerWidth;
        const faceH = (faceBox.ymax - faceBox.ymin) * containerHeight;
        
        // Only use face detection if it's reasonably sized (at least 5% of container)
        // Also check for valid numbers
        if (
            !isNaN(faceW) && !isNaN(faceH) &&
            faceW > containerWidth * 0.05 && faceH > containerHeight * 0.05
        ) {
             const faceCX = ((faceBox.xmin + faceBox.xmax) / 2) * containerWidth;
             const faceCY = ((faceBox.ymin + faceBox.ymax) / 2) * containerHeight;

             // Target: Face height is ~65% of the crop height for ID photos
             h = faceH / 0.65;
             w = h * aspectRatio;

             // Center around face
             x = faceCX - (w / 2);
             y = faceCY - (h / 2);
             
             // Check if calculated values are valid
             if (!isNaN(x) && !isNaN(y) && !isNaN(w) && !isNaN(h) && w > 0 && h > 0) {
                 useFace = true;
             }
        }
    } 
    
    if (!useFace) {
        // Default Center Crop
        w = containerWidth * 0.6;
        h = w / aspectRatio;

        // Ensure it fits vertically
        if (h > containerHeight * 0.9) {
            h = containerHeight * 0.9;
            w = h * aspectRatio;
        }
        
        // Ensure it fits horizontally
        if (w > containerWidth * 0.9) {
            w = containerWidth * 0.9;
            h = w / aspectRatio;
        }

        x = (containerWidth - w) / 2;
        y = (containerHeight - h) / 2;
    }

    // Final safety check
    if (isNaN(x) || isNaN(y) || isNaN(w) || isNaN(h) || w <= 0 || h <= 0) {
        // Absolute fallback
        w = 100;
        h = 100 / aspectRatio;
        x = (containerWidth - 100) / 2;
        y = (containerHeight - h) / 2;
    }

    setPosition({ x, y, w, h });
  }, [containerWidth, containerHeight, aspectRatio, faceBox]);

  // Report changes
  useEffect(() => {
    if (containerWidth && containerHeight && position.w > 0) {
        onCropChange({
            x: position.x / containerWidth,
            y: position.y / containerHeight,
            width: position.w / containerWidth,
            height: position.h / containerHeight
        });
    }
  }, [position, containerWidth, containerHeight, onCropChange]);

  const handleMouseDown = (e: React.MouseEvent, mode: DragMode) => {
    e.stopPropagation();
    e.preventDefault(); // Prevent text selection
    dragMode.current = mode;
    dragStart.current = { x: e.clientX, y: e.clientY };
    startPos.current = { ...position };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragMode.current) return;
    e.preventDefault();
    
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;

    let newX = startPos.current.x;
    let newY = startPos.current.y;
    let newW = startPos.current.w;
    let newH = startPos.current.h;

    // Constraints: Allow moving outside but keep at least 20px overlap to avoid losing the box
    const minOverlap = 20;

    if (dragMode.current === 'move') {
        newX += dx;
        newY += dy;
        
        // Relaxed bounds
        const minX = -newW + minOverlap;
        const maxX = containerWidth - minOverlap;
        const minY = -newH + minOverlap;
        const maxY = containerHeight - minOverlap;

        newX = Math.max(minX, Math.min(newX, maxX));
        newY = Math.max(minY, Math.min(newY, maxY));

    } else {
        // Resizing logic preserving aspect ratio
        
        let deltaW = 0;

        if (dragMode.current === 'se') {
            deltaW = dx;
        } else if (dragMode.current === 'sw') {
             deltaW = -dx;
        } else if (dragMode.current === 'ne') {
            deltaW = dx;
        } else if (dragMode.current === 'nw') {
            deltaW = -dx;
        }

        // Apply aspect ratio
        let tentativeW = startPos.current.w + deltaW;
        tentativeW = Math.max(50, tentativeW); // Min size 50px
        let tentativeH = tentativeW / aspectRatio;

        // No Max Size Constraint relative to container (can grow larger than image)
        // But let's limit it reasonably (e.g., 2x container) to prevent chaos
        const maxDimension = Math.max(containerWidth, containerHeight) * 2;
        if (tentativeW > maxDimension) {
            tentativeW = maxDimension;
            tentativeH = tentativeW / aspectRatio;
        }

        newW = tentativeW;
        newH = tentativeH;

        // Adjust X and Y based on corner anchored
        if (dragMode.current === 'sw') {
            newX = startPos.current.x + (startPos.current.w - newW);
        } else if (dragMode.current === 'ne') {
            newY = startPos.current.y + (startPos.current.h - newH);
        } else if (dragMode.current === 'nw') {
            newX = startPos.current.x + (startPos.current.w - newW);
            newY = startPos.current.y + (startPos.current.h - newH);
        }
    }

    setPosition({ x: newX, y: newY, w: newW, h: newH });
  };

  const handleMouseUp = () => {
    dragMode.current = null;
  };

  if (!isVisible) return null;

  return (
    <div 
        className="absolute inset-0 pointer-events-auto"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
    >
        {/* Dimmed background - Only dims the actual image area because this div is inset-0 on the container */}
        <div className="absolute inset-0 bg-black/40 pointer-events-none"></div>

        {/* The Crop Box */}
        <div 
            style={{
                left: position.x,
                top: position.y,
                width: position.w,
                height: position.h,
                boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)' 
            }}
            className="absolute z-10"
        >
            {/* Move Area (Invisible full cover, but behind handles) */}
            <div 
                className="absolute inset-0 cursor-move border-2 border-white/80"
                onMouseDown={(e) => handleMouseDown(e, 'move')}
            >
                {/* Grid lines */}
                <div className="absolute top-1/3 left-0 right-0 h-px bg-white/40 pointer-events-none"></div>
                <div className="absolute top-2/3 left-0 right-0 h-px bg-white/40 pointer-events-none"></div>
                <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/40 pointer-events-none"></div>
                <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/40 pointer-events-none"></div>
            </div>

            {/* Resize Handles */}
            <div 
                className="absolute -top-1.5 -left-1.5 w-4 h-4 bg-white border border-slate-400 cursor-nw-resize z-20 rounded-sm shadow-sm"
                onMouseDown={(e) => handleMouseDown(e, 'nw')}
            />
            <div 
                className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-white border border-slate-400 cursor-ne-resize z-20 rounded-sm shadow-sm"
                onMouseDown={(e) => handleMouseDown(e, 'ne')}
            />
            <div 
                className="absolute -bottom-1.5 -left-1.5 w-4 h-4 bg-white border border-slate-400 cursor-sw-resize z-20 rounded-sm shadow-sm"
                onMouseDown={(e) => handleMouseDown(e, 'sw')}
            />
            <div 
                className="absolute -bottom-1.5 -right-1.5 w-4 h-4 bg-white border border-slate-400 cursor-se-resize z-20 rounded-sm shadow-sm"
                onMouseDown={(e) => handleMouseDown(e, 'se')}
            />
        </div>
    </div>
  );
};

export default CropOverlay;