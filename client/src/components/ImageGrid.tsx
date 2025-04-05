import React from "react";
import { DocumentImage } from "@shared/schema";

interface ImageGridProps {
  images: DocumentImage[];
  onImageSelect: (image: DocumentImage) => void;
}

const ImageGrid: React.FC<ImageGridProps> = ({ images, onImageSelect }) => {
  if (images.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-2 gap-2 p-2">
      {images.map((image) => (
        <div
          key={image.id}
          className="aspect-square rounded-md overflow-hidden cursor-pointer border border-gray-200 hover:border-primary"
          onClick={() => onImageSelect(image)}
        >
          <img
            src={image.imagePath}
            alt={image.altText || "Document image"}
            className="w-full h-full object-cover"
          />
        </div>
      ))}
    </div>
  );
};

export default ImageGrid;
