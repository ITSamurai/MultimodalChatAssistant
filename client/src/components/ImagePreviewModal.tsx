import React from "react";
import { DocumentImage } from "@shared/schema";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface ImagePreviewModalProps {
  image: DocumentImage | null;
  isOpen: boolean;
  onClose: () => void;
}

const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({
  image,
  isOpen,
  onClose,
}) => {
  if (!image) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-4xl p-0">
        <DialogHeader className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between w-full">
            <DialogTitle className="text-lg">Image Preview</DialogTitle>
            <DialogClose asChild>
              <Button
                variant="ghost"
                className="h-8 w-8 p-0 rounded-full"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
              </Button>
            </DialogClose>
          </div>
        </DialogHeader>
        <div className="p-4">
          <img
            src={image.imagePath}
            alt={image.altText || "Document image"}
            className="max-w-full max-h-[70vh] mx-auto"
          />
        </div>
        <div className="bg-gray-50 p-4 text-sm text-gray-700">
          {image.caption || image.altText || "Image from document"}
          {image.pageNumber && ` (page ${image.pageNumber})`}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ImagePreviewModal;
