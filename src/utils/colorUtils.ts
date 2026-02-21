
export interface RGB {
  r: number;
  g: number;
  b: number;
}

export const rgbToHex = (rgb: RGB): string => {
  const toHex = (c: number) => c.toString(16).padStart(2, '0');
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`.toUpperCase();
};

export const hexToRgb = (hex: string): RGB => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
};

export const calculateColorDistance = (c1: RGB, c2: RGB): number => {
  // Simple Euclidean distance in RGB space
  const dr = c1.r - c2.r;
  const dg = c1.g - c2.g;
  const db = c1.b - c2.b;
  const distance = Math.sqrt(dr * dr + dg * dg + db * db);
  
  // Max distance is sqrt(255^2 * 3) approx 441.67
  const maxDistance = Math.sqrt(255 * 255 * 3);
  
  // More severe scoring: use a power function to penalize distance more heavily
  // (distance / maxDistance) is 0 to 1.
  // 1 - (dist/max)^0.5 would be more lenient.
  // 1 - (dist/max)^2 would be more severe.
  const normalizedDist = distance / maxDistance;
  const score = Math.max(0, 100 * (1 - Math.pow(normalizedDist, 0.7) * 1.5));
  
  return Math.round(score);
};

export const getRandomColor = (): { name: string; hex: string } => {
  const colors = [
    { name: "さくら色 (Pink)", hex: "#FECAE0" },
    { name: "そらいろ (Sky Blue)", hex: "#87CEEB" },
    { name: "わかくさいろ (Green)", hex: "#ABC900" },
    { name: "ひまわりいろ (Yellow)", hex: "#FFC800" },
    { name: "あかいろ (Red)", hex: "#B7282E" },
    { name: "ふじいろ (Purple)", hex: "#BB94D7" },
    { name: "まっちゃいろ (Dark Green)", hex: "#8BA36D" },
    { name: "るりいろ (Deep Blue)", hex: "#2A5CAA" },
    { name: "きんいろ (Gold)", hex: "#E6B422" },
    { name: "すみいろ (Black)", hex: "#333333" },
    { name: "さんごいろ (Coral)", hex: "#F88379" },
    { name: "もえぎいろ (Green)", hex: "#006E4F" },
    { name: "やまぶきいろ (Orange)", hex: "#FFA400" },
    { name: "あいいろ (Navy)", hex: "#165E83" },
    { name: "ぼたんいろ (Magenta)", hex: "#E7609E" },
  ];
  return colors[Math.floor(Math.random() * colors.length)];
};
