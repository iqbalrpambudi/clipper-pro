"use client";

import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef } from "react";
import {
  Stage,
  Layer,
  Image as KonvaImage,
  Text as KonvaText,
  Label as KonvaLabel,
  Tag as KonvaTag,
  Transformer,
  Rect,
} from "react-konva";
import type Konva from "konva";
import { ThumbnailTextLayer } from "@/types";

export interface ThumbnailCanvasRef {
  exportHd: () => Promise<string | null>;
}

interface ThumbnailKonvaCanvasProps {
  imageUrl: string | null;
  layers: ThumbnailTextLayer[];
  selectedLayerId: string | null;
  onSelectLayer: (layerId: string | null) => void;
  onUpdateLayer: (layerId: string, updates: Partial<ThumbnailTextLayer>) => void;
  containerClassName?: string;
}

const BASE_WIDTH = 1280;
const BASE_HEIGHT = 720;

export const ThumbnailKonvaCanvas = forwardRef<ThumbnailCanvasRef, ThumbnailKonvaCanvasProps>(
  (
    { imageUrl, layers, selectedLayerId, onSelectLayer, onUpdateLayer, containerClassName = "" },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const stageRef = useRef<Konva.Stage | null>(null);
    const transformerRef = useRef<Konva.Transformer | null>(null);
    const nodeRefs = useRef<Record<string, Konva.Node | null>>({});

    const [stageScale, setStageScale] = useState(1);
    const [canvasSize, setCanvasSize] = useState({ width: BASE_WIDTH, height: BASE_HEIGHT });
    const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
    const [isImageLoading, setIsImageLoading] = useState(false);

    // Responsive scaling based on container width
    useEffect(() => {
      const updateSize = () => {
        if (!containerRef.current) return;
        const width = containerRef.current.offsetWidth;
        if (width <= 0) return;
        const scale = width / BASE_WIDTH;
        setStageScale(scale);
        setCanvasSize({
          width: width,
          height: width * (BASE_HEIGHT / BASE_WIDTH),
        });
      };

      updateSize();
      window.addEventListener("resize", updateSize);
      const resizeObserver = new ResizeObserver(updateSize);
      if (containerRef.current) {
        resizeObserver.observe(containerRef.current);
      }

      return () => {
        window.removeEventListener("resize", updateSize);
        resizeObserver.disconnect();
      };
    }, []);

    // Load background image
    useEffect(() => {
      if (!imageUrl) {
        setBgImage(null);
        return;
      }

      setIsImageLoading(true);
      const img = new window.Image();
      img.crossOrigin = "anonymous";
      img.src = imageUrl;
      img.onload = () => {
        setBgImage(img);
        setIsImageLoading(false);
        stageRef.current?.batchDraw();
      };
      img.onerror = () => {
        setBgImage(null);
        setIsImageLoading(false);
      };
    }, [imageUrl]);

    // Redraw on fonts load
    useEffect(() => {
      if (typeof document !== "undefined" && "fonts" in document) {
        (document as unknown as { fonts: { ready: Promise<void> } }).fonts.ready.then(() => {
          stageRef.current?.batchDraw();
        });
      }
    }, [layers]);

    // Attach transformer to selected node
    useEffect(() => {
      if (!transformerRef.current) return;

      if (selectedLayerId && nodeRefs.current[selectedLayerId]) {
        const targetNode = nodeRefs.current[selectedLayerId];
        if (targetNode) transformerRef.current.nodes([targetNode]);
        transformerRef.current.getLayer()?.batchDraw();
      } else {
        transformerRef.current.nodes([]);
        transformerRef.current.getLayer()?.batchDraw();
      }
    }, [selectedLayerId, layers]);

    // Expose high-res export via ref
    useImperativeHandle(ref, () => ({
      exportHd: async () => {
        if (!stageRef.current) return null;

        // Hide transformer temporarily for clean export
        const previousNodes = transformerRef.current?.nodes() || [];
        if (transformerRef.current) {
          transformerRef.current.nodes([]);
        }
        stageRef.current.batchDraw();

        // 1280 * 1.5 = 1920x1080 Full HD
        const pixelRatio = 1.5 / stageScale;
        const uri = stageRef.current.toDataURL({
          pixelRatio: Math.max(1, pixelRatio),
          mimeType: "image/png",
        });

        // Restore transformer
        if (transformerRef.current && previousNodes.length > 0) {
          transformerRef.current.nodes(previousNodes);
          stageRef.current.batchDraw();
        }

        return uri;
      },
    }));

    return (
      <div
        ref={containerRef}
        className={`relative w-full aspect-video rounded-2xl overflow-hidden bg-[#0A0A0A] border border-[#2A2A2A] shadow-2xl select-none ${containerClassName}`}
      >
        {/* Loading overlay for image */}
        {isImageLoading && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-20 backdrop-blur-xs">
            <div className="flex items-center gap-2 text-xs font-semibold text-white/80">
              <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
              <span>Memuat Latar Gambar...</span>
            </div>
          </div>
        )}

        <Stage
          ref={stageRef}
          width={canvasSize.width}
          height={canvasSize.height}
          scaleX={stageScale}
          scaleY={stageScale}
          onMouseDown={(e) => {
            // Deselect when clicking empty stage area
            if (e.target === e.target.getStage()) {
              onSelectLayer(null);
            }
          }}
          onTouchStart={(e) => {
            if (e.target === e.target.getStage()) {
              onSelectLayer(null);
            }
          }}
        >
          {/* Layer 1: Background Base Image */}
          <Layer>
            {bgImage ? (
              <KonvaImage
                image={bgImage}
                width={BASE_WIDTH}
                height={BASE_HEIGHT}
                listening={false}
              />
            ) : (
              <Rect width={BASE_WIDTH} height={BASE_HEIGHT} fill="#121212" listening={false} />
            )}
          </Layer>

          {/* Layer 2: Text Elements & Transformer */}
          <Layer>
            {layers.map((layer) => {
              const hasStroke = layer.strokeEnabled && (layer.strokeWidth ?? 0) > 0;
              const hasShadow = layer.shadowEnabled;

              return (
                <KonvaLabel
                  key={layer.id}
                  id={layer.id}
                  ref={(node) => {
                    if (node) {
                      nodeRefs.current[layer.id] = node as unknown as Konva.Node;
                    } else {
                      delete nodeRefs.current[layer.id];
                    }
                  }}
                  x={layer.x}
                  y={layer.y}
                  rotation={layer.rotation || 0}
                  scaleX={layer.scaleX || 1}
                  scaleY={layer.scaleY || 1}
                  draggable
                  onClick={() => onSelectLayer(layer.id)}
                  onTap={() => onSelectLayer(layer.id)}
                  onDragEnd={(e) => {
                    onUpdateLayer(layer.id, {
                      x: Math.round(e.target.x()),
                      y: Math.round(e.target.y()),
                    });
                  }}
                  onTransformEnd={(e) => {
                    const node = e.target;
                    onUpdateLayer(layer.id, {
                      x: Math.round(node.x()),
                      y: Math.round(node.y()),
                      rotation: Math.round(node.rotation()),
                      scaleX: node.scaleX(),
                      scaleY: node.scaleY(),
                    });
                  }}
                >
                  {/* Background Box / Highlight Pill (Photoshop Tag Box) */}
                  {layer.bgEnabled && (
                    <KonvaTag
                      fill={layer.bgFill || "#E50914"}
                      cornerRadius={layer.bgCornerRadius ?? 8}
                      opacity={layer.bgOpacity ?? 1}
                      shadowColor={hasShadow ? layer.shadowColor || "#000000" : undefined}
                      shadowBlur={hasShadow ? (layer.shadowBlur ?? 8) : 0}
                      shadowOffset={
                        hasShadow
                          ? { x: layer.shadowOffsetX ?? 4, y: layer.shadowOffsetY ?? 4 }
                          : undefined
                      }
                      shadowOpacity={hasShadow ? (layer.shadowOpacity ?? 0.8) : 0}
                    />
                  )}

                  {/* Text Item */}
                  <KonvaText
                    text={layer.text}
                    fontSize={layer.fontSize}
                    fontFamily={layer.fontFamily}
                    fontStyle={layer.fontStyle || "bold"}
                    fill={layer.fill}
                    padding={layer.bgEnabled ? (layer.bgPaddingX ?? 16) : 4}
                    align={layer.align || "center"}
                    // Stroke / Outside Outline
                    stroke={hasStroke ? layer.stroke || "#000000" : undefined}
                    strokeWidth={hasStroke ? layer.strokeWidth || 5 : 0}
                    fillAfterStrokeEnabled={true}
                    // Shadow if bg is not enabled
                    shadowColor={
                      !layer.bgEnabled && hasShadow ? layer.shadowColor || "#000000" : undefined
                    }
                    shadowBlur={!layer.bgEnabled && hasShadow ? (layer.shadowBlur ?? 6) : 0}
                    shadowOffset={
                      !layer.bgEnabled && hasShadow
                        ? { x: layer.shadowOffsetX ?? 4, y: layer.shadowOffsetY ?? 4 }
                        : undefined
                    }
                    shadowOpacity={!layer.bgEnabled && hasShadow ? (layer.shadowOpacity ?? 0.9) : 0}
                  />
                </KonvaLabel>
              );
            })}

            {/* Transformer Selection Box with Interactive Handles */}
            <Transformer
              ref={transformerRef}
              enabledAnchors={[
                "top-left",
                "top-right",
                "bottom-left",
                "bottom-right",
                "middle-left",
                "middle-right",
              ]}
              rotateEnabled={true}
              borderStroke="#FFE600"
              borderStrokeWidth={1.5}
              borderDash={[4, 4]}
              anchorStroke="#FFE600"
              anchorFill="#181818"
              anchorSize={9}
              anchorCornerRadius={2}
              boundBoxFunc={(oldBox, newBox) => {
                // Minimum box bounds
                if (Math.abs(newBox.width) < 20 || Math.abs(newBox.height) < 20) {
                  return oldBox;
                }
                return newBox;
              }}
            />
          </Layer>
        </Stage>
      </div>
    );
  }
);

ThumbnailKonvaCanvas.displayName = "ThumbnailKonvaCanvas";
export default ThumbnailKonvaCanvas;
