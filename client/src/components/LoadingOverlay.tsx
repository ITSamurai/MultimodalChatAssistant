import React from "react";

interface LoadingOverlayProps {
  isVisible: boolean;
  message?: string;
}

const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  isVisible,
  message = "Processing document...",
}) => {
  if (!isVisible) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-white bg-opacity-75 flex items-center justify-center z-50">
      <div className="text-center">
        <div className="inline-block animate-spin text-primary text-4xl mb-4">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-10 w-10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 22C6.5 22 2 17.5 2 12S6.5 2 12 2s10 4.5 10 10" />
          </svg>
        </div>
        <p className="text-gray-800 font-medium">{message}</p>
        <p className="text-sm text-gray-500 mt-2">This may take a moment</p>
      </div>
    </div>
  );
};

export default LoadingOverlay;
