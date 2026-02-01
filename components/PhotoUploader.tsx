import React, { useCallback } from 'react';
import { Upload, Camera, Image as ImageIcon } from 'lucide-react';

interface PhotoUploaderProps {
  onImageSelected: (base64: string) => void;
}

const PhotoUploader: React.FC<PhotoUploaderProps> = ({ onImageSelected }) => {
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onloadend = () => {
        onImageSelected(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const [isDragOver, setIsDragOver] = React.useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
       if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onloadend = () => {
        onImageSelected(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  }, [onImageSelected]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] w-full max-w-2xl mx-auto p-6">
      <div 
        className={`w-full border-4 border-dashed rounded-3xl p-12 text-center transition-all duration-300 ${
          isDragOver ? 'border-blue-500 bg-blue-50 scale-105' : 'border-slate-300 bg-white hover:border-blue-400'
        }`}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
      >
        <div className="flex justify-center mb-6">
          <div className="bg-blue-100 p-4 rounded-full">
            <Upload className="w-12 h-12 text-blue-600" />
          </div>
        </div>
        
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Tải ảnh chân dung lên</h2>
        <p className="text-slate-500 mb-8">Kéo thả hoặc chọn ảnh từ thiết bị của bạn</p>
        
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <label className="cursor-pointer group relative overflow-hidden bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-xl shadow-lg shadow-blue-200 transition-all transform hover:-translate-y-1">
                <span className="flex items-center gap-2">
                    <ImageIcon className="w-5 h-5" />
                    Chọn ảnh từ thư viện
                </span>
                <input 
                    type="file" 
                    accept="image/*" 
                    className="absolute inset-0 opacity-0 cursor-pointer" 
                    onChange={handleFileChange}
                />
            </label>
        </div>
        
        <p className="mt-6 text-xs text-slate-400">
            Hỗ trợ: JPG, PNG, WEBP. Tốt nhất nên dùng ảnh chụp chính diện, đủ sáng.
        </p>
      </div>
    </div>
  );
};

export default PhotoUploader;
