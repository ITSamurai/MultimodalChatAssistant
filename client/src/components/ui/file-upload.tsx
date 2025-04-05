import React, { useRef, useState } from "react";
import { Button } from "@/components/ui/button";

interface FileUploadProps {
  onFileSelected: (file: File) => Promise<void>;
  acceptedFileTypes: string;
  isLoading?: boolean;
}

const FileUpload: React.FC<FileUploadProps> = ({
  onFileSelected,
  acceptedFileTypes,
  isLoading = false,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files.length) {
      const file = e.dataTransfer.files[0];
      if (isValidFileType(file)) {
        await onFileSelected(file);
      }
    }
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && isValidFileType(file)) {
      await onFileSelected(file);
    }
  };

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  const isValidFileType = (file: File) => {
    // Convert acceptedFileTypes string to array and check if file type matches
    const fileTypes = acceptedFileTypes.split(",");
    const fileName = file.name.toLowerCase();
    
    return fileTypes.some(type => {
      // Handle both MIME types and file extensions
      if (type.startsWith(".")) {
        return fileName.endsWith(type);
      } else {
        return file.type === type;
      }
    });
  };

  return (
    <div
      className={`border-2 border-dashed ${
        isDragging ? "border-primary bg-blue-50" : "border-gray-300"
      } rounded-lg p-4 text-center hover:bg-gray-50 transition cursor-pointer`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleBrowseClick}
    >
      {isLoading ? (
        <div className="flex flex-col items-center justify-center">
          <svg
            className="animate-spin h-5 w-5 text-primary mb-2"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
          <p className="text-sm text-gray-500">Processing document...</p>
        </div>
      ) : (
        <>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-8 w-8 text-gray-400 mb-2 mx-auto"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
            <polyline points="14 2 14 8 20 8" />
            <path d="M12 18v-6" />
            <path d="M8 15l4 4 4-4" />
          </svg>
          <p className="text-sm text-gray-500">Drag & drop document or</p>
          <p className="mt-2 text-sm text-primary font-medium">Browse files</p>
          <input
            type="file"
            className="hidden"
            ref={fileInputRef}
            accept={acceptedFileTypes}
            onChange={handleFileInput}
          />
          <p className="text-xs text-gray-400 mt-2">Supports .doc and .docx</p>
        </>
      )}
    </div>
  );
};

export default FileUpload;
