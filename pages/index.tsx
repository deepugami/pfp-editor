import { useRef, useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import Head from "next/head";
import {
  ArrowDownToLine,
  Share2,
  Loader2,
  Upload,
  Trash2,
  RotateCw,
  Maximize2,
  Minimize2,
} from "lucide-react";
import React from "react";
// Import DraggableData and DraggableEvent from react-draggable
import type { DraggableData, DraggableEvent } from "react-draggable";

// Dynamically import Rnd with SSR disabled (prevents the "window is not defined" error)
const Rnd = dynamic(() => import("react-rnd").then((mod) => mod.Rnd), {
  ssr: false,
});

/* TypeScript interface for DraggableData that was missing
interface DraggableData {
  x: number;
  y: number;
}

// TypeScript type for DraggableEvent
type DraggableEvent =
  | React.MouseEvent<HTMLElement>
  | React.TouchEvent<HTMLElement>;
  */

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return <div>Something went wrong. Please refresh the page.</div>;
    }

    return this.props.children;
  }
}

// Store overlay information with preloaded images for better quality
const OVERLAYS = ["/image1.png", "/image2.png", "/image3.png"];
const OVERLAY_CACHE = new Map<string, HTMLImageElement>();

const BOX = 300;

interface HatState {
  width: number;
  height: number;
  x: number;
  y: number;
  rotation: number;
}

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [overlaySrc, setOverlaySrc] = useState(OVERLAYS[0]);
  const [hat, setHat] = useState<HatState>({
    width: 100,
    height: 100,
    x: 100,
    y: 100,
    rotation: 0,
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [recentDownloads, setRecentDownloads] = useState<string[]>([]);
  const [undoStack, setUndoStack] = useState<HatState[]>([]);
  const [redoStack, setRedoStack] = useState<HatState[]>([]);

  // Preload overlay images for better quality
  const preloadOverlay = useCallback((src: string) => {
    if (!OVERLAY_CACHE.has(src)) {
      setIsLoading(true);
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        OVERLAY_CACHE.set(src, img);
        setIsLoading(false);
      };
      img.onerror = () => {
        setError(`Failed to preload overlay: ${src}`);
        setIsLoading(false);
      };
      img.src = src;
    }
    return OVERLAY_CACHE.get(src);
  }, []);

  // Clean up object URLs when component unmounts or image changes
  useEffect(() => {
    return () => {
      if (img?.src && img.src.startsWith("blob:")) {
        URL.revokeObjectURL(img.src);
      }
    };
  }, [img]);

  // Preload all overlay images when component mounts
  useEffect(() => {
    OVERLAYS.forEach((src) => {
      preloadOverlay(src);
    });
  }, [preloadOverlay]);

  // Set dark/light theme based on system preference
  useEffect(() => {
    if (typeof window !== "undefined") {
      const prefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)"
      ).matches;
      setTheme(prefersDark ? "dark" : "light");

      // Listen for changes in theme preference
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleChange = (e: MediaQueryListEvent) => {
        setTheme(e.matches ? "dark" : "light");
      };

      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }
  }, []);

  // Save to local storage when hat position changes
  useEffect(() => {
    if (img && !isDragging && !isResizing) {
      try {
        localStorage.setItem("pfp-editor-last-hat", JSON.stringify(hat));
      } catch (e) {
        // Ignore storage errors
      }
    }
  }, [hat, img, isDragging, isResizing]);

  // Load from local storage on mount
  useEffect(() => {
    try {
      const savedHat = localStorage.getItem("pfp-editor-last-hat");
      if (savedHat) {
        setHat(JSON.parse(savedHat));
      }

      const savedDownloads = localStorage.getItem("pfp-editor-downloads");
      if (savedDownloads) {
        setRecentDownloads(JSON.parse(savedDownloads));
      }
    } catch (e) {
      // Ignore storage errors
    }
  }, []);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    // Revoke previous URL if it exists
    if (img?.src && img.src.startsWith("blob:")) {
      URL.revokeObjectURL(img.src);
    }

    // Show loading state
    setIsLoading(true);

    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      setImg(image);
      setIsLoading(false);

      // Reset undo/redo stacks
      setUndoStack([]);
      setRedoStack([]);
    };
    image.onerror = () => {
      setError("Failed to load image. Please try another file.");
      URL.revokeObjectURL(url);
      setIsLoading(false);
    };
    image.src = url;
  };

  const handleDownload = async () => {
    if (!img) {
      setError("Please upload an image first");
      return;
    }

    try {
      setIsProcessing(true);

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Canvas context not available");
      }

      // Set canvas dimensions
      const outputSize = 1200;
      canvas.width = outputSize;
      canvas.height = outputSize;

      // Enable high quality rendering
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      // Draw image and overlay
      const upscaleRatio = outputSize / BOX;
      const ratio = Math.min(BOX / img.naturalWidth, BOX / img.naturalHeight);
      const drawW = img.naturalWidth * ratio * upscaleRatio;
      const drawH = img.naturalHeight * ratio * upscaleRatio;
      const offsetX = (outputSize - drawW) / 2;
      const offsetY = (outputSize - drawH) / 2;

      ctx.drawImage(img, offsetX, offsetY, drawW, drawH);

      // Get overlay image
      const overlay =
        OVERLAY_CACHE.get(overlaySrc) ||
        (await new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = overlaySrc;
        }));

      // Draw overlay
      const scaledX = hat.x * upscaleRatio;
      const scaledY = hat.y * upscaleRatio;
      const scaledWidth = hat.width * upscaleRatio;
      const scaledHeight = hat.height * upscaleRatio;

      ctx.save();
      ctx.translate(scaledX + scaledWidth / 2, scaledY + scaledHeight / 2);
      ctx.rotate((hat.rotation * Math.PI) / 180);
      ctx.drawImage(
        overlay,
        -scaledWidth / 2,
        -scaledHeight / 2,
        scaledWidth,
        scaledHeight
      );
      ctx.restore();

      // Download image
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `pfp-${timestamp}.png`;

      const dataUrl = canvas.toDataURL("image/png", 1.0);
      const link = document.createElement("a");
      link.download = filename;
      link.href = dataUrl;
      link.click();

      // Create a thumbnail version for storage (much smaller)
      const thumbnailCanvas = document.createElement("canvas");
      const thumbCtx = thumbnailCanvas.getContext("2d");
      if (!thumbCtx) {
        throw new Error("Thumbnail canvas context not available");
      }

      // Set to a small thumbnail size (150px)
      thumbnailCanvas.width = 150;
      thumbnailCanvas.height = 150;

      // Draw at thumbnail size with lower quality
      thumbCtx.drawImage(canvas, 0, 0, 150, 150);

      // Get lower quality thumbnail
      const thumbnailUrl = thumbnailCanvas.toDataURL("image/jpeg", 0.6);

      try {
        // Update recent downloads with the thumbnail
        const newDownloads = [thumbnailUrl, ...recentDownloads.slice(0, 3)];
        setRecentDownloads(newDownloads);
        localStorage.setItem(
          "pfp-editor-downloads",
          JSON.stringify(newDownloads)
        );
      } catch (storageError) {
        console.warn("Failed to save to localStorage: ", storageError);
        // Fallback to just keeping in memory without persisting
        const newDownloads = [thumbnailUrl, ...recentDownloads.slice(0, 2)];
        setRecentDownloads(newDownloads);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setIsProcessing(false);
    }
  };

  // Optional: Add a function to clear storage if needed
  const clearStoredDownloads = () => {
    try {
      localStorage.removeItem("pfp-editor-downloads");
      setRecentDownloads([]);
    } catch (e) {
      console.error("Failed to clear localStorage", e);
    }
  };

  const handleShare = async () => {
    if (!img) {
      setError("Please upload an image first");
      return;
    }

    try {
      setIsProcessing(true);

      // First create the image to share
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Canvas context not available");
      }

      // Set canvas dimensions (same as download function)
      const outputSize = 1200;
      canvas.width = outputSize;
      canvas.height = outputSize;

      // Same drawing code as handleDownload
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      const upscaleRatio = outputSize / BOX;
      const ratio = Math.min(BOX / img.naturalWidth, BOX / img.naturalHeight);
      const drawW = img.naturalWidth * ratio * upscaleRatio;
      const drawH = img.naturalHeight * ratio * upscaleRatio;
      const offsetX = (outputSize - drawW) / 2;
      const offsetY = (outputSize - drawH) / 2;

      ctx.drawImage(img, offsetX, offsetY, drawW, drawH);

      const overlay = OVERLAY_CACHE.get(overlaySrc);
      if (!overlay) {
        throw new Error("Overlay image not loaded");
      }

      // Draw overlay
      const scaledX = hat.x * upscaleRatio;
      const scaledY = hat.y * upscaleRatio;
      const scaledWidth = hat.width * upscaleRatio;
      const scaledHeight = hat.height * upscaleRatio;

      ctx.save();
      ctx.translate(scaledX + scaledWidth / 2, scaledY + scaledHeight / 2);
      ctx.rotate((hat.rotation * Math.PI) / 180);
      ctx.drawImage(
        overlay,
        -scaledWidth / 2,
        -scaledHeight / 2,
        scaledWidth,
        scaledHeight
      );
      ctx.restore();

      // Generate blob for sharing
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error("Failed to create blob"));
            }
          },
          "image/png",
          0.9
        );
      });

      // Try using Web Share API if available
      if (
        navigator.share &&
        navigator.canShare({
          files: [new File([blob], "pfp.png", { type: "image/png" })],
        })
      ) {
        await navigator.share({
          title: "My Custom PFP",
          text: "Check out my PFP created with the PFP Editor!",
          files: [new File([blob], "pfp.png", { type: "image/png" })],
        });
      } else {
        // Fallback to Twitter intent
        const text = encodeURIComponent(
          "Check out my PFP created with the PFP Editor!"
        );
        window.open(
          `https://twitter.com/intent/tweet?text=${text}`,
          "_blank",
          "noopener,noreferrer"
        );
      }
    } catch (e) {
      setError(`Sharing failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleHatChange = (newHat: Partial<HatState>) => {
    // Save current state for undo
    setUndoStack((prev) => [...prev, hat]);
    // Clear redo stack when a new change is made
    setRedoStack([]);
    // Update hat state
    setHat((prev) => ({ ...prev, ...newHat }));
  };

  const handleUndo = () => {
    if (undoStack.length > 0) {
      const prevState = undoStack[undoStack.length - 1];
      setUndoStack((prev) => prev.slice(0, -1));
      setRedoStack((prev) => [hat, ...prev]);
      setHat(prevState);
    }
  };

  const handleRedo = () => {
    if (redoStack.length > 0) {
      const nextState = redoStack[0];
      setRedoStack((prev) => prev.slice(1));
      setUndoStack((prev) => [...prev, hat]);
      setHat(nextState);
    }
  };

  const handleResetPosition = () => {
    setUndoStack((prev) => [...prev, hat]);
    setRedoStack([]);
    setHat({ width: 100, height: 100, x: 100, y: 100, rotation: 0 });
  };

  const handleRemoveImage = () => {
    if (img?.src && img.src.startsWith("blob:")) {
      URL.revokeObjectURL(img.src);
    }
    setImg(null);
    setUndoStack([]);
    setRedoStack([]);
  };

  const handleFitToHead = () => {
    if (!img) return;

    // Estimate a good size based on image dimensions (head is ~1/6 of body height)
    const imgRatio = Math.min(BOX / img.naturalWidth, BOX / img.naturalHeight);
    const drawH = img.naturalHeight * imgRatio;
    const estimatedHeadSize = drawH / 6;

    setUndoStack((prev) => [...prev, hat]);
    setRedoStack([]);
    setHat((prev) => ({
      ...prev,
      width: estimatedHeadSize,
      height: estimatedHeadSize,
      x: BOX / 2 - estimatedHeadSize / 2,
      y: BOX / 4 - estimatedHeadSize / 2, // Place near the top quarter
    }));
  };

  // Dynamic theme classes
  const bgClass = theme === "dark" ? "bg-gray-900" : "bg-gray-100";
  const textClass = theme === "dark" ? "text-white" : "text-gray-900";
  const borderClass = theme === "dark" ? "border-gray-700" : "border-gray-300";
  const buttonClass =
    theme === "dark"
      ? "border border-gray-700 bg-gray-800 hover:bg-gray-700 text-white"
      : "border border-gray-300 bg-white hover:bg-gray-100 text-gray-900";
  const accentButtonClass =
    theme === "dark"
      ? "bg-blue-600 hover:bg-blue-700 text-white"
      : "bg-blue-500 hover:bg-blue-600 text-white";
  const overlayBoxClass =
    theme === "dark"
      ? "border-gray-500 bg-gray-800"
      : "border-gray-300 bg-gray-100";

  return (
    <ErrorBoundary>
      <>
        <Head>
          <title>Fluent PFP Editor</title>
          <meta
            name="description"
            content="Create perfect profile pictures with our PFP Editor"
          />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <link rel="icon" href="/favicon.ico" />
        </Head>

        <div className={`min-h-screen ${bgClass} ${textClass}`}>
          {/* Header */}
          <header
            className={`border-b ${borderClass} p-4 flex items-center justify-between`}
          >
            <h1 className="text-2xl font-light">Fluent PFP Editor</h1>
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className={`p-2 rounded-full ${buttonClass}`}
            >
              {theme === "dark" ? "☀️" : "🌙"}
            </button>
          </header>

          <main className="max-w-4xl mx-auto p-4 md:p-8">
            {/* Error message */}
            {error && (
              <div className="bg-red-600 text-white p-3 rounded mb-6 flex items-center justify-between">
                <p>{error}</p>
                <button onClick={() => setError(null)}>✕</button>
              </div>
            )}

            <div className="grid md:grid-cols-3 gap-6">
              {/* Left column - Editor */}
              <div className="md:col-span-2 space-y-6">
                {/* Image upload area */}
                <div
                  className={`border-2 border-dashed ${borderClass} rounded-lg flex flex-col items-center justify-center p-6 transition-all`}
                >
                  {!img && !isLoading && (
                    <div className="text-center py-12">
                      <Upload className="mx-auto h-12 w-12 mb-4 opacity-50" />
                      <p className="mb-4">Upload your photo to get started</p>
                      <label
                        className={`inline-flex items-center px-4 py-2 rounded ${accentButtonClass} cursor-pointer transition-all`}
                      >
                        <span>Choose File</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleUpload}
                          ref={inputRef}
                          className="hidden"
                        />
                      </label>
                    </div>
                  )}

                  {isLoading && (
                    <div className="flex flex-col items-center justify-center py-12">
                      <Loader2 className="h-12 w-12 animate-spin mb-4" />
                      <p>Loading your image...</p>
                    </div>
                  )}

                  {img && !isLoading && (
                    <div className="relative w-full">
                      {/* Editor controls */}
                      <div className="flex justify-between mb-4">
                        <div className="flex space-x-2">
                          <button
                            onClick={handleRemoveImage}
                            className={`p-2 rounded ${buttonClass} inline-flex items-center`}
                            title="Remove image"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={handleUndo}
                            disabled={undoStack.length === 0}
                            className={`p-2 rounded ${buttonClass} inline-flex items-center ${
                              undoStack.length === 0
                                ? "opacity-50 cursor-not-allowed"
                                : ""
                            }`}
                            title="Undo"
                          >
                            ↩
                          </button>
                          <button
                            onClick={handleRedo}
                            disabled={redoStack.length === 0}
                            className={`p-2 rounded ${buttonClass} inline-flex items-center ${
                              redoStack.length === 0
                                ? "opacity-50 cursor-not-allowed"
                                : ""
                            }`}
                            title="Redo"
                          >
                            ↪
                          </button>
                        </div>
                        <div className="flex space-x-2">
                          <button
                            onClick={handleFitToHead}
                            className={`p-2 rounded ${buttonClass} inline-flex items-center`}
                            title="Auto-fit to head"
                          >
                            <Maximize2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={handleResetPosition}
                            className={`p-2 rounded ${buttonClass} inline-flex items-center`}
                            title="Reset position"
                          >
                            <Minimize2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {/* Image preview area */}
                      <div
                        className={`relative mx-auto ${overlayBoxClass} border`}
                        style={{ width: BOX, height: BOX }}
                      >
                        <img
                          src={img.src}
                          alt="preview"
                          className="absolute w-full h-full object-contain"
                        />
                        <Rnd
                          className={`hat-box z-10 ${
                            theme === "dark" ? "border-white" : "border-black"
                          }`}
                          bounds="parent"
                          size={{ width: hat.width, height: hat.height }}
                          position={{ x: hat.x, y: hat.y }}
                          onDragStart={() => setIsDragging(true)}
                          onDragStop={(e: DraggableEvent, d: DraggableData) => {
                            setIsDragging(false);
                            handleHatChange({ x: d.x, y: d.y });
                          }}
                          onResizeStart={() => setIsResizing(true)}
                          onResizeStop={(_, __, ref, ___, position) => {
                            setIsResizing(false);
                            handleHatChange({
                              width: parseInt(ref.style.width),
                              height: parseInt(ref.style.height),
                              x: position.x,
                              y: position.y,
                            });
                          }}
                        >
                          <div
                            style={{
                              width: "100%",
                              height: "100%",
                              transform: `rotate(${hat.rotation}deg)`,
                              transformOrigin: "center center",
                            }}
                          >
                            <img
                              src={overlaySrc}
                              alt="overlay"
                              className="w-full h-full pointer-events-none"
                            />
                          </div>
                        </Rnd>
                      </div>
                    </div>
                  )}
                </div>

                {/* Image actions */}
                {img && (
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-4">
                      <button
                        onClick={() => setModalOpen(true)}
                        className={`px-4 py-2 rounded flex items-center space-x-2 ${buttonClass}`}
                        disabled={isLoading}
                      >
                        <span>Choose Overlay</span>
                      </button>

                      <div className="flex items-center space-x-3 flex-grow">
                        <RotateCw className="h-4 w-4" />
                        <input
                          type="range"
                          min={0}
                          max={360}
                          value={hat.rotation}
                          onChange={(e) =>
                            handleHatChange({
                              rotation: Number(e.target.value),
                            })
                          }
                          disabled={isLoading}
                          className="flex-grow"
                        />
                        <span className="w-12 text-right">{hat.rotation}°</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-4">
                      <button
                        onClick={handleDownload}
                        className={`px-4 py-2 rounded flex items-center space-x-2 ${accentButtonClass}`}
                        disabled={isLoading || isProcessing}
                      >
                        {isProcessing ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Processing...</span>
                          </>
                        ) : (
                          <>
                            <ArrowDownToLine className="h-4 w-4" />
                            <span>Download</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={handleShare}
                        className={`px-4 py-2 rounded flex items-center space-x-2 ${buttonClass}`}
                        disabled={isLoading || isProcessing}
                      >
                        {isProcessing ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Processing...</span>
                          </>
                        ) : (
                          <>
                            <Share2 className="h-4 w-4" />
                            <span>Share</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Right column - Recent downloads & Info */}
              <div className="space-y-6">
                {/* Recent downloads */}
                {recentDownloads.length > 0 && (
                  <div className={`border ${borderClass} rounded-lg p-4`}>
                    <h2 className="text-lg font-medium mb-3">
                      Recent Creations
                    </h2>
                    <div className="grid grid-cols-2 gap-2">
                      {recentDownloads.map((dataUrl, i) => (
                        <div
                          key={i}
                          className={`aspect-square border ${borderClass} rounded overflow-hidden`}
                        >
                          <img
                            src={dataUrl}
                            alt={`Recent creation ${i + 1}`}
                            className="w-full h-full object-contain"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Info box */}
                <div className={`border ${borderClass} rounded-lg p-4`}>
                  <h2 className="text-lg font-medium mb-2">Tips</h2>
                  <ul className="space-y-2 text-sm">
                    <li>• Drag the hat to position it</li>
                    <li>• Resize using the corner handles</li>
                    <li>• Use the slider to rotate</li>
                    <li>• Try different overlays from our collection</li>
                    <li>• Download in high resolution</li>
                  </ul>
                </div>

                {/* Available overlays preview */}
                <div className={`border ${borderClass} rounded-lg p-4`}>
                  <h2 className="text-lg font-medium mb-3">
                    Available Overlays
                  </h2>
                  <div className="grid grid-cols-3 gap-2">
                    {OVERLAYS.map((src) => (
                      <div
                        key={src}
                        className={`aspect-square ${overlayBoxClass} rounded p-2 ${
                          overlaySrc === src ? "ring-2 ring-blue-500" : ""
                        }`}
                        onClick={() => {
                          if (img) setOverlaySrc(src);
                        }}
                      >
                        <img
                          src={src}
                          alt="Overlay option"
                          className={`w-full h-full object-contain ${
                            img ? "cursor-pointer" : "opacity-50"
                          }`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </main>

          <footer
            className={`border-t ${borderClass} mt-12 py-6 text-center text-sm opacity-70`}
          >
            Fluent PFP Editor © {new Date().getFullYear()} | Made with 💖 by{" "}
            <a
              href="https://x.com/deepugami"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-blue-400"
            >
              deepugami
            </a>
          </footer>
        </div>

        {/* Overlay selection modal */}
        {modalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className={`${bgClass} rounded-lg p-6 w-full max-w-md`}>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-medium">Select Overlay</h2>
                <button
                  onClick={() => setModalOpen(false)}
                  className="p-2 hover:bg-opacity-10 hover:bg-gray-500 rounded"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-3 gap-4">
                {OVERLAYS.map((src) => (
                  <div
                    key={src}
                    className={`aspect-square p-3 rounded border ${borderClass} ${
                      overlaySrc === src
                        ? "ring-2 ring-blue-500 bg-blue-50 bg-opacity-10"
                        : ""
                    } transition-all cursor-pointer hover:border-blue-300`}
                    onClick={() => {
                      setOverlaySrc(src);
                      setModalOpen(false);
                    }}
                  >
                    <img
                      src={src}
                      alt="overlay choice"
                      className="w-full h-full object-contain"
                    />
                  </div>
                ))}
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setModalOpen(false)}
                  className={`px-4 py-2 rounded ${buttonClass}`}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    </ErrorBoundary>
  );
}
