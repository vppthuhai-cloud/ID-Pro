export enum AppState {
  UPLOAD = 'UPLOAD',
  // CROP step is integrated into CUSTOMIZE
  CUSTOMIZE = 'CUSTOMIZE', // Combined Step 2 & 3: Size, Auto-Crop, Options
  RESULT = 'RESULT'        // Step 4: Final Result & Export
}

export enum Gender {
  MALE = 'Nam',
  FEMALE = 'Nữ',
  UNSPECIFIED = 'Khác'
}

export interface IDPhotoConfig {
  widthMm: number;
  heightMm: number;
  name: string;
}

export interface ProcessingOptions {
  outfitType: string;
  outfitColor: string;
  background: string;
  hairstyle: string;
  gender: Gender;
  beautify: boolean;
  lighting?: boolean; 
  smartFill?: boolean;
}

export const PHOTO_SIZES: IDPhotoConfig[] = [
  { widthMm: 30, heightMm: 40, name: '3x4 cm' },
  { widthMm: 40, heightMm: 60, name: '4x6 cm' },
  { widthMm: 20, heightMm: 30, name: '2x3 cm' },
  { widthMm: 35, heightMm: 45, name: '3.5x4.5 cm (Passport)' },
  { widthMm: 50, heightMm: 50, name: '5x5 cm (Visa Mỹ)' },
];

// Color Definitions
export const OUTFIT_COLORS_DATA: Record<string, { label: string; hex: string; prompt: string }> = {
  'white': { label: 'Trắng', hex: '#ffffff', prompt: 'white' },
  'black': { label: 'Đen', hex: '#1a1a1a', prompt: 'black' },
  'navy': { label: 'Xanh than', hex: '#1e293b', prompt: 'navy blue' },
  'gray': { label: 'Xám', hex: '#64748b', prompt: 'gray' },
  'blue': { label: 'Xanh dương', hex: '#3b82f6', prompt: 'light blue' },
  'red': { label: 'Đỏ', hex: '#ef4444', prompt: 'red' },
  'pink': { label: 'Hồng', hex: '#ec4899', prompt: 'pink' },
  'yellow': { label: 'Vàng', hex: '#eab308', prompt: 'yellow' },
  'purple': { label: 'Tím', hex: '#a855f7', prompt: 'purple' },
  'dark_red': { label: 'Đỏ đô', hex: '#7f1d1d', prompt: 'dark red' },
};

// Outfit Types with allowed colors and prompt templates
export const OUTFIT_TYPES = [
  { 
    id: 'original', 
    label: 'Giữ nguyên', 
    promptTemplate: '', 
    allowedColors: [] 
  },
  { 
    id: 'suit', 
    label: 'Áo Vest (Cà vạt)', 
    promptTemplate: 'wearing a formal {color} business suit with a white shirt and a tie', 
    allowedColors: ['black', 'navy', 'gray', 'dark_red'] 
  },
  { 
    id: 'suit_no_tie', 
    label: 'Áo Vest (Không cà vạt)', 
    promptTemplate: 'wearing a formal {color} business suit with a white shirt, no tie', 
    allowedColors: ['black', 'navy', 'gray'] 
  },
  { 
    id: 'shirt', 
    label: 'Sơ mi', 
    promptTemplate: 'wearing a crisp {color} formal button-down shirt', 
    allowedColors: ['white', 'blue', 'black', 'gray', 'pink'] 
  },
  { 
    id: 'ao_dai', 
    label: 'Áo dài (Nữ)', 
    promptTemplate: 'wearing a traditional Vietnamese {color} Ao Dai dress', 
    allowedColors: ['white', 'red', 'pink', 'blue', 'yellow', 'purple'] 
  },
  { 
    id: 'tshirt', 
    label: 'Áo thun', 
    promptTemplate: 'wearing a plain solid {color} t-shirt', 
    allowedColors: ['white', 'black', 'gray', 'navy', 'red'] 
  },
];

export const BACKGROUNDS = [
  { id: 'original', label: 'Giữ nguyên', color: 'transparent', prompt: '' },
  { id: 'white', label: 'Trắng', color: '#ffffff', prompt: 'solid white background' },
  { id: 'blue', label: 'Xanh dương', color: '#4287f5', prompt: 'solid ID photo blue background' },
  { id: 'gray', label: 'Xám', color: '#a0a0a0', prompt: 'solid neutral gray background' },
  { id: 'red', label: 'Đỏ', color: '#d91b1b', prompt: 'solid red background' },
  { id: 'green', label: 'Xanh lá', color: '#4caf50', prompt: 'solid green chroma key background' },
  { id: 'cyan', label: 'Xanh ngọc', color: '#00bcd4', prompt: 'solid cyan background' },
];

export const HAIRSTYLES = [
  { id: 'original', label: 'Giữ nguyên', prompt: '' },
  { id: 'neat', label: 'Gọn gàng', prompt: 'neatly styled professional hair' },
  { id: 'short', label: 'Tóc ngắn', prompt: 'short professional haircut' },
  { id: 'long_straight', label: 'Dài thẳng', prompt: 'long straight neatly styled hair' },
  { id: 'bun', label: 'Búi tóc', prompt: 'hair tied in a neat bun' },
];