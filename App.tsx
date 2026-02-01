import React, { useState, useRef, useEffect } from 'react';
import { 
  AppState, 
  ProcessingOptions, 
  Gender, 
  OUTFIT_TYPES,
  OUTFIT_COLORS_DATA,
  BACKGROUNDS, 
  HAIRSTYLES, 
  PHOTO_SIZES,
  IDPhotoConfig
} from './types';
import PhotoUploader from './components/PhotoUploader';
import { editPhoto, detectFace } from './services/geminiService';
import { cropImage, generatePrintSheet, calculateSmartCrop, saveImageAs, rotateImage } from './utils/imageUtils';
import { 
  Layout, 
  Download, 
  RotateCcw, 
  Palette, 
  Shirt, 
  Scissors, 
  Check, 
  Loader2,
  Printer,
  ChevronLeft,
  ArrowRight,
  Sparkles,
  Crop,
  CheckCircle2,
  Image as ImageIcon,
  FileImage,
  Sun,
  ImagePlus
} from 'lucide-react';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.UPLOAD);
  
  // Image Data
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [croppedImage, setCroppedImage] = useState<string | null>(null); // Input for AI
  const [resultImage, setResultImage] = useState<string | null>(null);   // Output from AI
  const [sheetImage, setSheetImage] = useState<string | null>(null);     // Export sheet
  const [detectedFaceBox, setDetectedFaceBox] = useState<{ ymin: number, xmin: number, ymax: number, xmax: number } | null>(null);
  const [imgDimensions, setImgDimensions] = useState({ width: 0, height: 0 });

  // Configuration
  const [selectedSize, setSelectedSize] = useState<IDPhotoConfig>(PHOTO_SIZES[0]); // Default 3x4
  const [options, setOptions] = useState<ProcessingOptions>({
    outfitType: 'original',
    outfitColor: '',
    background: 'original',
    hairstyle: 'original',
    gender: Gender.UNSPECIFIED,
    beautify: false,
    lighting: false
  });

  // UI State
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');

  // --- Step 1: Upload & Auto Detect & Tilt Correction ---
  const handleImageSelected = async (base64: string) => {
    setIsProcessing(true);
    setLoadingMessage("Đang quét khuôn mặt...");

    try {
        // 1. Initial Detection
        const detection = await detectFace(base64);
        
        let finalImage = base64;
        let finalBox = detection?.box || null;

        // 2. Check for Tilt and Rotate if necessary
        if (detection && detection.landmarks) {
             const { leftEye, rightEye } = detection.landmarks;
             // Calculate angle just to check magnitude
             const img = new Image();
             img.src = base64;
             await new Promise(r => img.onload = r);
             
             const lx = leftEye.x * img.width;
             const ly = leftEye.y * img.height;
             const rx = rightEye.x * img.width;
             const ry = rightEye.y * img.height;
             const angleRad = Math.atan2(ry - ly, rx - lx);
             const angleDeg = angleRad * (180 / Math.PI);

             // If tilt is significant (> 1.5 degrees)
             if (Math.abs(angleDeg) > 1.5) {
                 setLoadingMessage("Phát hiện mặt nghiêng. Đang tự động cân chỉnh...");
                 const rotatedBase64 = await rotateImage(base64, leftEye, rightEye);
                 finalImage = rotatedBase64;
                 
                 // Re-detect on the rotated image to get accurate box
                 // (Because rotation changes coordinate space)
                 const newDetection = await detectFace(rotatedBase64);
                 if (newDetection) {
                     finalBox = newDetection.box;
                 }
             }
        }

        // 3. Set State
        setOriginalImage(finalImage);
        
        // Get dimensions of the final image
        const dimImg = new Image();
        dimImg.onload = () => {
            setImgDimensions({ width: dimImg.width, height: dimImg.height });
            setDetectedFaceBox(finalBox);
            setIsProcessing(false);
            setAppState(AppState.CUSTOMIZE);
        };
        dimImg.src = finalImage;

    } catch (e) {
        console.error("Processing error", e);
        // Fallback to basic load
        setOriginalImage(base64);
        const img = new Image();
        img.onload = () => {
             setImgDimensions({ width: img.width, height: img.height });
             setIsProcessing(false);
             setAppState(AppState.CUSTOMIZE);
        };
        img.src = base64;
    }
  };

  // --- Step 2/3 Integrated: Auto Crop & Customize ---
  
  // Effect: When size or facebox changes, re-calculate crop
  useEffect(() => {
    if (appState === AppState.CUSTOMIZE && originalImage && imgDimensions.width > 0) {
        const doAutoCrop = async () => {
            try {
                const targetAR = selectedSize.widthMm / selectedSize.heightMm;
                const cropRect = calculateSmartCrop(
                    detectedFaceBox, 
                    imgDimensions.width, 
                    imgDimensions.height, 
                    targetAR
                );
                const cropped = await cropImage(originalImage, cropRect, selectedSize, '#ffffff');
                setCroppedImage(cropped);
            } catch (e) {
                console.error("Auto crop failed", e);
            }
        };
        doAutoCrop();
    }
  }, [appState, originalImage, detectedFaceBox, selectedSize, imgDimensions]);

  const handleOutfitTypeChange = (typeId: string) => {
      const type = OUTFIT_TYPES.find(t => t.id === typeId);
      if (type) {
          // If the new type doesn't support the current color, or if currently 'original', select first allowed color
          let newColor = options.outfitColor;
          if (typeId === 'original') {
              newColor = '';
          } else if (type.allowedColors.length > 0) {
             if (!newColor || !type.allowedColors.includes(newColor)) {
                 newColor = type.allowedColors[0];
             }
          }
          
          setOptions(prev => ({ ...prev, outfitType: typeId, outfitColor: newColor }));
      }
  };

  // --- Step 4: AI Generation ---
  const handleGenerateAI = async () => {
    if (!croppedImage) return;

    setIsProcessing(true);
    setLoadingMessage('AI đang xử lý yêu cầu của bạn...');
    
    const msgs = [
        'Đang phân tích khuôn mặt...',
        'Đang thay đổi trang phục & nền...',
        'Đang bổ sung phần thân còn thiếu...',
        'Đang hoàn thiện chi tiết...'
    ];
    let msgIdx = 0;
    const interval = setInterval(() => {
        setLoadingMessage(msgs[msgIdx % msgs.length]);
        msgIdx++;
    }, 2000);

    try {
        const result = await editPhoto(croppedImage, options);
        setResultImage(result);
        
        const sheet = await generatePrintSheet(
            result, 
            150, 
            100, 
            selectedSize.widthMm, 
            selectedSize.heightMm
        );
        setSheetImage(sheet);
        
        setAppState(AppState.RESULT);
    } catch (error) {
        console.error(error);
        alert("Có lỗi xảy ra khi xử lý ảnh. Vui lòng thử lại.");
    } finally {
        clearInterval(interval);
        setIsProcessing(false);
    }
  };

  // --- Utils ---
  const handleDownload = (base64: string | null, name: string, format: 'jpeg' | 'png') => {
      if (!base64) return;
      saveImageAs(base64, name, format);
  };

  const handleReset = () => {
      setAppState(AppState.UPLOAD);
      setOriginalImage(null);
      setCroppedImage(null);
      setResultImage(null);
      setSheetImage(null);
      setDetectedFaceBox(null);
      setOptions({
        outfitType: 'original',
        outfitColor: '',
        background: 'original',
        hairstyle: 'original',
        gender: Gender.UNSPECIFIED,
        beautify: false,
        lighting: false
      });
  };

  const StepIndicator = () => (
      <div className="flex items-center justify-center gap-2 text-xs font-semibold text-slate-400 mb-6">
          <div className={`px-3 py-1 rounded-full ${appState === AppState.UPLOAD ? 'bg-blue-600 text-white' : 'bg-slate-200'}`}>1. Tải ảnh</div>
          <div className="w-4 h-px bg-slate-300"></div>
          <div className={`px-3 py-1 rounded-full ${appState === AppState.CUSTOMIZE ? 'bg-blue-600 text-white' : 'bg-slate-200'}`}>2. Tuỳ chỉnh & Kích thước</div>
          <div className="w-4 h-px bg-slate-300"></div>
          <div className={`px-3 py-1 rounded-full ${appState === AppState.RESULT ? 'bg-blue-600 text-white' : 'bg-slate-200'}`}>3. Kết quả</div>
      </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-800">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">
                ID
            </div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                AI Pro
            </h1>
        </div>
        <button 
            onClick={handleReset}
            className="text-sm font-medium text-slate-500 hover:text-slate-800 flex items-center gap-1"
        >
            <RotateCcw className="w-4 h-4" />
            Làm mới
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        
        {/* Loading Overlay */}
        {isProcessing && (
            <div className="absolute inset-0 z-[60] bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center">
                <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
                <p className="text-xl font-medium text-slate-800">{loadingMessage}</p>
                <p className="text-sm text-slate-500 mt-2">Vui lòng đợi trong giây lát...</p>
            </div>
        )}

        <div className="p-4">
            <StepIndicator />
        </div>

        {/* STEP 1: UPLOAD */}
        {appState === AppState.UPLOAD && (
            <PhotoUploader onImageSelected={handleImageSelected} />
        )}

        {/* STEP 2: CUSTOMIZE & SIZE */}
        {appState === AppState.CUSTOMIZE && (
             <div className="flex flex-col lg:flex-row h-full max-w-6xl mx-auto w-full gap-6 px-4 pb-4">
                 {/* Preview Cropped Image */}
                <div className="flex-1 bg-slate-100 rounded-2xl border border-slate-200 relative flex flex-col items-center justify-center p-6 min-h-[500px]">
                     <h3 className="absolute top-4 left-4 bg-white/90 px-3 py-1 rounded-full text-sm font-medium shadow-sm z-10 flex gap-2 items-center">
                        <ImageIcon className="w-4 h-4 text-blue-600" />
                        Ảnh xem trước (Đã tự động cắt)
                    </h3>
                    <div className="relative shadow-xl w-fit">
                        {croppedImage ? (
                            <img 
                                src={croppedImage} 
                                alt="Auto Cropped Preview" 
                                className="max-h-[60vh] object-contain rounded border-4 border-white block transition-all duration-300"
                            />
                        ) : (
                             <div className="w-64 h-80 bg-slate-200 animate-pulse rounded flex items-center justify-center text-slate-400">
                                 Đang cắt ảnh...
                             </div>
                        )}
                        {/* Overlay visual hint */}
                        <div className="absolute inset-0 border-2 border-dashed border-blue-400/50 rounded pointer-events-none"></div>
                    </div>
                    <p className="text-sm text-slate-500 mt-4 text-center max-w-md">
                        Hệ thống tự động căn chỉnh khuôn mặt phù hợp với kích thước {selectedSize.name}. 
                        AI sẽ xử lý chi tiết ở bước tiếp theo.
                    </p>
                </div>

                {/* Sidebar */}
                <div className="w-full lg:w-96 flex flex-col gap-4 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden h-[80vh] lg:h-auto">
                    <div className="p-4 border-b border-slate-100 bg-slate-50">
                        <h2 className="font-bold text-lg">Thiết lập ảnh</h2>
                        <p className="text-xs text-slate-500">Chọn kích thước và tuỳ chỉnh AI</p>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-4 space-y-6">
                        
                        {/* Size Selection */}
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                            <label className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-3">
                                <Layout className="w-4 h-4" /> Kích thước ảnh
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                {PHOTO_SIZES.map((size) => (
                                    <button
                                        key={size.name}
                                        onClick={() => setSelectedSize(size)}
                                        className={`px-3 py-2 rounded-lg text-sm border text-left transition-all ${
                                            selectedSize.name === size.name 
                                            ? 'border-blue-500 bg-blue-100 text-blue-700 font-bold ring-1 ring-blue-500' 
                                            : 'bg-white border-slate-200 hover:border-slate-300 text-slate-600'
                                        }`}
                                    >
                                        {size.name}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Beautify & Lighting Group */}
                         <div>
                            <label className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-2">
                                <Sparkles className="w-4 h-4" /> Xử lý khuôn mặt
                            </label>
                            <div className="grid grid-cols-1 gap-2">
                                <button
                                    onClick={() => setOptions(prev => ({ ...prev, beautify: !prev.beautify }))}
                                    className={`w-full px-4 py-3 rounded-xl border flex items-center justify-between transition-all ${
                                        options.beautify
                                        ? 'border-pink-500 bg-pink-50 text-pink-700 font-medium' 
                                        : 'border-slate-200 hover:border-slate-300 text-slate-600'
                                    }`}
                                >
                                    <span>Làm mịn & sáng da</span>
                                    {options.beautify && <CheckCircle2 className="w-5 h-5 text-pink-600" />}
                                </button>
                                <button
                                    onClick={() => setOptions(prev => ({ ...prev, lighting: !prev.lighting }))}
                                    className={`w-full px-4 py-3 rounded-xl border flex items-center justify-between transition-all ${
                                        options.lighting
                                        ? 'border-yellow-500 bg-yellow-50 text-yellow-700 font-medium' 
                                        : 'border-slate-200 hover:border-slate-300 text-slate-600'
                                    }`}
                                >
                                    <span className="flex items-center gap-2"><Sun className="w-4 h-4"/> Cân bằng ánh sáng</span>
                                    {options.lighting && <CheckCircle2 className="w-5 h-5 text-yellow-600" />}
                                </button>
                            </div>
                        </div>

                        {/* Outfit Section (Split) */}
                        <div>
                            <label className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-2">
                                <Shirt className="w-4 h-4" /> Trang phục
                            </label>
                            
                            {/* Type Selection */}
                            <div className="grid grid-cols-1 gap-2 mb-3">
                                {OUTFIT_TYPES.map((type) => (
                                    <button
                                        key={type.id}
                                        onClick={() => handleOutfitTypeChange(type.id)}
                                        className={`px-4 py-3 rounded-xl border text-left transition-all flex items-center justify-between ${
                                            options.outfitType === type.id
                                            ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium' 
                                            : 'border-slate-200 hover:border-slate-300 text-slate-600'
                                        }`}
                                    >
                                        <span>{type.label}</span>
                                        {options.outfitType === type.id && <Check className="w-4 h-4" />}
                                    </button>
                                ))}
                            </div>

                            {/* Color Selection (Only if type supports colors and is not original) */}
                            {options.outfitType !== 'original' && (
                                <div className="animate-in fade-in slide-in-from-top-2 duration-300 p-3 bg-slate-50 rounded-xl border border-slate-100">
                                    <label className="block text-xs font-semibold text-slate-500 mb-2">Màu sắc</label>
                                    <div className="flex flex-wrap gap-2">
                                        {OUTFIT_TYPES.find(t => t.id === options.outfitType)?.allowedColors.map((colorKey) => {
                                            const colorData = OUTFIT_COLORS_DATA[colorKey];
                                            if (!colorData) return null;
                                            return (
                                                <button
                                                    key={colorKey}
                                                    onClick={() => setOptions(prev => ({ ...prev, outfitColor: colorKey }))}
                                                    className={`w-8 h-8 rounded-full border-2 transition-all flex items-center justify-center shadow-sm ${
                                                        options.outfitColor === colorKey ? 'border-blue-600 scale-110 ring-2 ring-blue-100' : 'border-white hover:scale-105'
                                                    }`}
                                                    style={{ backgroundColor: colorData.hex }}
                                                    title={colorData.label}
                                                >
                                                     {options.outfitColor === colorKey && <Check className={`w-4 h-4 ${['white', 'yellow'].includes(colorKey) ? 'text-black' : 'text-white'}`} />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <p className="text-xs text-slate-400 mt-2 text-right">
                                        {OUTFIT_COLORS_DATA[options.outfitColor]?.label || 'Chọn màu'}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Background */}
                        <div>
                            <label className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-2">
                                <Palette className="w-4 h-4" /> Phông nền
                            </label>
                            <div className="flex flex-wrap gap-2">
                                {BACKGROUNDS.map((bg) => (
                                    <button
                                        key={bg.id}
                                        onClick={() => setOptions(prev => ({ ...prev, background: bg.id }))}
                                        className={`w-10 h-10 rounded-full border-2 transition-all flex items-center justify-center ${
                                            options.background === bg.id ? 'border-blue-600 scale-110 shadow-sm' : 'border-transparent hover:scale-105'
                                        }`}
                                        style={{ backgroundColor: bg.color === 'transparent' ? '#f1f5f9' : bg.color }}
                                        title={bg.label}
                                    >
                                        {bg.id === 'original' && <span className="text-[10px] font-bold text-slate-400">Gốc</span>}
                                        {options.background === bg.id && bg.id !== 'original' && <Check className="w-5 h-5 text-white/80 drop-shadow-md" />}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Hairstyle */}
                         <div>
                            <label className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-2">
                                <Scissors className="w-4 h-4" /> Kiểu tóc
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                {HAIRSTYLES.map((hair) => (
                                    <button
                                        key={hair.id}
                                        onClick={() => setOptions(prev => ({ ...prev, hairstyle: hair.id }))}
                                        className={`px-3 py-2 rounded-lg text-sm border text-center transition-all ${
                                            options.hairstyle === hair.id
                                            ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium' 
                                            : 'border-slate-200 hover:border-slate-300 text-slate-600'
                                        }`}
                                    >
                                        {hair.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="p-4 border-t border-slate-200">
                         <div className="flex gap-3">
                            <button 
                                onClick={handleReset}
                                className="px-4 py-3 border border-slate-300 rounded-xl hover:bg-slate-50 text-slate-600"
                            >
                                <ChevronLeft className="w-5 h-5" />
                            </button>
                            <button 
                                onClick={handleGenerateAI}
                                className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold text-lg shadow-lg shadow-indigo-200 flex items-center justify-center gap-2 transition-all"
                            >
                                <Sparkles className="w-5 h-5" /> Tạo ảnh ngay
                            </button>
                        </div>
                    </div>
                </div>
             </div>
        )}

        {/* STEP 3: RESULT & EXPORT */}
        {appState === AppState.RESULT && resultImage && (
             <div className="flex flex-col items-center justify-center min-h-full p-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
                <div className="max-w-4xl w-full bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-100">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-800">Kết quả AI</h2>
                            <p className="text-slate-500">Xem lại kết quả hoặc xuất file.</p>
                        </div>
                    </div>
                    
                    <div className="p-8 grid md:grid-cols-2 gap-12">
                        {/* Single Photo */}
                        <div className="flex flex-col items-center gap-6">
                            <div className="relative group">
                                <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
                                <img 
                                    src={resultImage} 
                                    alt="Result ID Photo" 
                                    className="relative rounded shadow-lg border-2 border-white max-w-[200px]"
                                />
                            </div>
                            <div className="text-center w-full">
                                <h3 className="font-semibold text-lg mb-1">Ảnh đơn ({selectedSize.name})</h3>
                                <div className="flex gap-2 mt-4 justify-center">
                                    <button 
                                        onClick={() => handleDownload(resultImage, `ID_Photo_${selectedSize.widthMm}x${selectedSize.heightMm}`, 'jpeg')}
                                        className="py-2 px-4 bg-white border border-slate-200 hover:border-blue-400 hover:text-blue-600 text-slate-700 rounded-xl font-medium flex items-center justify-center gap-2 transition-all shadow-sm text-sm"
                                        title="Tải ảnh JPG (Dung lượng nhẹ)"
                                    >
                                        <Download className="w-4 h-4" /> JPG
                                    </button>
                                     <button 
                                        onClick={() => handleDownload(resultImage, `ID_Photo_${selectedSize.widthMm}x${selectedSize.heightMm}`, 'png')}
                                        className="py-2 px-4 bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-700 rounded-xl font-medium flex items-center justify-center gap-2 transition-all shadow-sm text-sm"
                                        title="Tải ảnh PNG (Chất lượng cao nhất)"
                                    >
                                        <FileImage className="w-4 h-4" /> PNG (Tốt nhất)
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Print Sheet */}
                        <div className="flex flex-col items-center gap-6 border-l border-slate-100 pl-0 md:pl-12">
                            <div className="relative group">
                                <div className="absolute -inset-1 bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
                                {sheetImage ? (
                                    <img 
                                        src={sheetImage} 
                                        alt="Print Sheet" 
                                        className="relative rounded shadow-lg border-2 border-white max-w-[240px]"
                                    />
                                ) : (
                                    <div className="w-[240px] h-[160px] bg-slate-100 rounded flex items-center justify-center text-slate-400 text-sm">
                                        Đang tạo file in...
                                    </div>
                                )}
                            </div>
                            <div className="text-center w-full">
                                <h3 className="font-semibold text-lg mb-1">File in ấn (10x15 cm)</h3>
                                <div className="flex gap-2 mt-4 justify-center">
                                    <button 
                                        disabled={!sheetImage}
                                        onClick={() => handleDownload(sheetImage, 'Print_Sheet_10x15cm', 'jpeg')}
                                        className="py-2 px-4 bg-white border border-slate-200 hover:border-blue-400 hover:text-blue-600 text-slate-700 rounded-xl font-medium flex items-center justify-center gap-2 transition-all shadow-sm text-sm disabled:opacity-50"
                                        title="Tải ảnh JPG (Dung lượng nhẹ)"
                                    >
                                        <Printer className="w-4 h-4" /> JPG
                                    </button>
                                     <button 
                                        disabled={!sheetImage}
                                        onClick={() => handleDownload(sheetImage, 'Print_Sheet_10x15cm', 'png')}
                                        className="py-2 px-4 bg-purple-50 border border-purple-200 hover:bg-purple-100 text-purple-700 rounded-xl font-medium flex items-center justify-center gap-2 transition-all shadow-sm text-sm disabled:opacity-50"
                                        title="Tải ảnh PNG (Chất lượng cao nhất)"
                                    >
                                        <FileImage className="w-4 h-4" /> PNG (Tốt nhất)
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="p-6 bg-slate-50 border-t border-slate-200 flex gap-4">
                        <button 
                            onClick={handleReset}
                            className="py-3 px-6 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl font-bold flex items-center justify-center gap-2 transition-all whitespace-nowrap"
                        >
                            <ImagePlus className="w-4 h-4" /> Hình thẻ mới
                        </button>
                        <button 
                            onClick={() => setAppState(AppState.CUSTOMIZE)}
                            className="flex-1 py-3 bg-white border border-blue-200 text-blue-700 hover:bg-blue-50 rounded-xl font-bold flex items-center justify-center gap-2 transition-all"
                        >
                            <RotateCcw className="w-4 h-4" /> Tuỳ chỉnh lại
                        </button>
                    </div>
                </div>
            </div>
        )}

      </main>
    </div>
  );
};

export default App;