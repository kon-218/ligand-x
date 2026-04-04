'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import {
  Download,
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Pencil,
  Eraser,
  Undo2,
  ImageDown,
  PenLine,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ImageFileViewerProps {
  imageUrl: string
  name: string
  onClose?: () => void
}

type StrokeTool = 'pen' | 'eraser'

interface Stroke {
  tool: StrokeTool
  color: string
  width: number
  points: { x: number; y: number }[]
}

function drawStrokePath(ctx: CanvasRenderingContext2D, s: Stroke) {
  if (s.points.length < 2) return
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (s.tool === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out'
    ctx.strokeStyle = '#000'
    ctx.lineWidth = s.width * 2.2
  } else {
    ctx.globalCompositeOperation = 'source-over'
    ctx.strokeStyle = s.color
    ctx.lineWidth = s.width
  }
  ctx.beginPath()
  ctx.moveTo(s.points[0].x, s.points[0].y)
  for (let i = 1; i < s.points.length; i++) {
    ctx.lineTo(s.points[i].x, s.points[i].y)
  }
  ctx.stroke()
  ctx.restore()
}

function renderOverlay(
  ctx: CanvasRenderingContext2D,
  cw: number,
  ch: number,
  strokes: Stroke[],
  partial: Stroke | null
) {
  ctx.clearRect(0, 0, cw, ch)
  for (const s of strokes) {
    drawStrokePath(ctx, s)
  }
  if (partial) {
    if (partial.points.length >= 2) {
      drawStrokePath(ctx, partial)
    } else if (partial.points.length === 1) {
      ctx.save()
      ctx.fillStyle = partial.tool === 'eraser' ? 'transparent' : partial.color
      if (partial.tool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out'
        const r = partial.width
        ctx.beginPath()
        ctx.arc(partial.points[0].x, partial.points[0].y, r, 0, Math.PI * 2)
        ctx.fill()
      } else {
        ctx.beginPath()
        ctx.arc(partial.points[0].x, partial.points[0].y, partial.width / 2, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
    }
  }
}

function clientToCanvas(
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect()
  const sx = canvas.width / rect.width
  const sy = canvas.height / rect.height
  return {
    x: (clientX - rect.left) * sx,
    y: (clientY - rect.top) * sy,
  }
}

export function ImageFileViewer({ imageUrl, name, onClose }: ImageFileViewerProps) {
  const [zoom, setZoom] = useState(100)
  const [rotation, setRotation] = useState(0)
  const [annotate, setAnnotate] = useState(false)
  const [tool, setTool] = useState<StrokeTool>('pen')
  const [color, setColor] = useState('#e11d48')
  const [lineWidth, setLineWidth] = useState(4)
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [imgNatural, setImgNatural] = useState({ w: 0, h: 0 })
  const [exportNote, setExportNote] = useState<string | null>(null)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const partialRef = useRef<Stroke | null>(null)
  const drawingRef = useRef(false)

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || imgNatural.w === 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    renderOverlay(ctx, canvas.width, canvas.height, strokes, partialRef.current)
  }, [strokes, imgNatural.w, imgNatural.h, annotate])

  useEffect(() => {
    redraw()
  }, [redraw])

  const handleImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const el = e.currentTarget
    setImgNatural({ w: el.naturalWidth, h: el.naturalHeight })
    setStrokes([])
    partialRef.current = null
    setExportNote(null)
  }

  useEffect(() => {
    setImgNatural({ w: 0, h: 0 })
    setStrokes([])
    partialRef.current = null
  }, [imageUrl])

  const finishStroke = useCallback(() => {
    if (!drawingRef.current) return
    drawingRef.current = false
    const partial = partialRef.current
    partialRef.current = null
    if (partial && partial.points.length > 0) {
      setStrokes((prev) => [...prev, partial])
    }
  }, [])

  const pointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!annotate || imgNatural.w === 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    drawingRef.current = true
    const canvas = canvasRef.current
    if (!canvas) return
    const p = clientToCanvas(e.clientX, e.clientY, canvas)
    partialRef.current = {
      tool,
      color,
      width: lineWidth,
      points: [p],
    }
    redraw()
  }

  const pointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || !partialRef.current || !canvasRef.current) return
    const p = clientToCanvas(e.clientX, e.clientY, canvasRef.current)
    partialRef.current.points.push(p)
    redraw()
  }

  const pointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    finishStroke()
  }

  const handleUndo = () => {
    setStrokes((prev) => prev.slice(0, -1))
  }

  const handleClearAnnotations = () => {
    partialRef.current = null
    setStrokes([])
  }

  const handleDownloadOriginal = () => {
    const a = document.createElement('a')
    a.href = imageUrl
    a.download = name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const handleSaveAnnotated = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || imgNatural.w === 0) return

    const doDownload = (blob: Blob | null, filename: string) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }

    const overlayOnly = () => {
      const out = document.createElement('canvas')
      out.width = canvas.width
      out.height = canvas.height
      const octx = out.getContext('2d')
      if (!octx) return
      octx.drawImage(canvas, 0, 0)
      out.toBlob((blob) => {
        doDownload(blob, `${sanitizeFilename(name)}_annotations.png`)
        setExportNote('Saved drawing only (transparent PNG). Composite with the original in your editor if needed.')
      }, 'image/png')
    }

    if (strokes.length === 0) {
      setExportNote('Nothing drawn yet.')
      return
    }

    const merged = document.createElement('canvas')
    merged.width = imgNatural.w
    merged.height = imgNatural.h
    const mctx = merged.getContext('2d')
    if (!mctx) return

    const base = new Image()
    base.crossOrigin = 'anonymous'
    base.onload = () => {
      try {
        mctx.drawImage(base, 0, 0, merged.width, merged.height)
        mctx.drawImage(canvas, 0, 0)
        merged.toBlob(
          (blob) => {
            if (blob) {
              doDownload(blob, `${sanitizeFilename(name)}_annotated.png`)
              setExportNote(null)
            } else {
              overlayOnly()
            }
          },
          'image/png'
        )
      } catch {
        overlayOnly()
      }
    }
    base.onerror = () => {
      overlayOnly()
    }
    base.src = imageUrl
  }, [imageUrl, name, imgNatural.w, imgNatural.h, strokes.length])

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 10, 300))
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 10, 50))
  const handleResetZoom = () => {
    setZoom(100)
    setRotation(0)
  }
  const handleRotate = () => setRotation((prev) => (prev + 90) % 360)

  return (
    <div className="absolute inset-0 flex flex-col bg-gray-900 z-10">
      <div className="flex flex-col shrink-0">
        {/* Primary toolbar: 52px = sidebar New Experiment row (py-2.5 + h-8) */}
        <div className="h-[52px] min-h-[52px] max-h-[52px] shrink-0 box-border flex min-w-0 items-center justify-between gap-2 px-3 bg-gray-800 border-b border-gray-800/50">
          <div className="flex h-8 max-h-8 min-w-0 flex-1 items-center gap-2">
            <span className="truncate text-sm font-medium leading-none text-gray-200" title={name}>
              {name}
            </span>
            <span className="shrink-0 text-xs leading-none text-gray-400">({zoom}%)</span>
          </div>

          <div className="flex items-center gap-0.5 flex-shrink-0">
            <button
              type="button"
              onClick={() => setAnnotate((a) => !a)}
              className={cn(
                'h-8 px-2 text-[11px] rounded-md flex items-center gap-1 transition-colors',
                annotate
                  ? 'bg-rose-600/90 text-white hover:bg-rose-500'
                  : 'hover:bg-gray-700 text-gray-300 hover:text-white'
              )}
              title={annotate ? 'Stop annotating' : 'Draw annotations for figures and discussion'}
            >
              <PenLine className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">{annotate ? 'Annotating' : 'Annotate'}</span>
            </button>

            <span className="hidden sm:inline w-px h-5 bg-gray-600 mx-0.5" aria-hidden />

            <button
              type="button"
              onClick={handleZoomOut}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-gray-700 text-gray-300 hover:text-white"
              title="Zoom out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleZoomIn}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-gray-700 text-gray-300 hover:text-white"
              title="Zoom in"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleRotate}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-gray-700 text-gray-300 hover:text-white"
              title="Rotate 90°"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleResetZoom}
              className="h-8 px-1.5 text-[10px] rounded-md hover:bg-gray-700 text-gray-300 hover:text-white inline-flex items-center"
              title="Reset zoom and rotation"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={handleDownloadOriginal}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-gray-700 text-gray-300 hover:text-white"
              title="Download original image"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleSaveAnnotated}
              disabled={strokes.length === 0}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-gray-700 text-amber-300/90 hover:text-amber-200 disabled:opacity-30 disabled:pointer-events-none"
              title="Save image with drawings (PNG), or transparent overlay if the source blocks merging"
            >
              <ImageDown className="w-3.5 h-3.5" />
            </button>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-gray-700 text-gray-300 hover:text-white"
                title="Close"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {annotate && (
          <div className="flex flex-wrap items-center gap-1.5 px-3 py-1.5 border-b border-gray-700 bg-gray-800/90">
            <div className="flex rounded overflow-hidden border border-gray-600">
              <button
                type="button"
                onClick={() => setTool('pen')}
                className={cn(
                  'p-1.5',
                  tool === 'pen' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:bg-gray-700'
                )}
                title="Pen"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setTool('eraser')}
                className={cn(
                  'p-1.5',
                  tool === 'eraser' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:bg-gray-700'
                )}
                title="Eraser"
              >
                <Eraser className="w-3.5 h-3.5" />
              </button>
            </div>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              disabled={tool === 'eraser'}
              className="h-7 w-8 rounded border border-gray-600 cursor-pointer bg-transparent p-0 disabled:opacity-40"
              title="Stroke color"
            />
            <label className="flex items-center gap-1 text-[10px] text-gray-400 whitespace-nowrap">
              <span>Size</span>
              <input
                type="range"
                min={1}
                max={32}
                value={lineWidth}
                onChange={(e) => setLineWidth(Number(e.target.value))}
                className="w-16 sm:w-20 accent-rose-500"
              />
            </label>
            <button
              type="button"
              onClick={handleUndo}
              disabled={strokes.length === 0}
              className="p-1.5 rounded hover:bg-gray-700 text-gray-300 hover:text-white disabled:opacity-30 disabled:pointer-events-none"
              title="Undo stroke"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleClearAnnotations}
              disabled={strokes.length === 0}
              className="px-2 py-1 text-[10px] rounded hover:bg-gray-700 text-gray-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none"
              title="Clear all drawings"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {exportNote && (
        <p className="text-[11px] text-amber-200/90 bg-amber-950/40 border-b border-amber-900/50 px-3 py-1.5">
          {exportNote}
        </p>
      )}

      <div className="flex-1 overflow-auto bg-gray-950 flex items-center justify-center p-4 min-h-0">
        <div
          className="flex items-center justify-center"
          style={{
            transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
            transformOrigin: 'center',
            transition: 'transform 0.2s ease-out',
          }}
        >
          <div className="relative inline-block max-w-full max-h-[calc(100vh-12rem)]">
            <img
              src={imageUrl}
              alt={name}
              className={cn(
                'block max-w-full max-h-[calc(100vh-12rem)] w-auto h-auto object-contain select-none',
                annotate && 'pointer-events-none'
              )}
              draggable={false}
              onLoad={handleImgLoad}
            />
            {annotate && imgNatural.w > 0 && (
              <canvas
                ref={canvasRef}
                width={imgNatural.w}
                height={imgNatural.h}
                className="absolute left-0 top-0 w-full h-full touch-none cursor-crosshair"
                onPointerDown={pointerDown}
                onPointerMove={pointerMove}
                onPointerUp={pointerUp}
                onPointerCancel={pointerUp}
                onPointerLeave={(e) => {
                  if (!drawingRef.current) return
                  try {
                    e.currentTarget.releasePointerCapture(e.pointerId)
                  } catch {
                    /* ignore */
                  }
                  finishStroke()
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function sanitizeFilename(s: string) {
  return s.replace(/[^a-z0-9_-]+/gi, '_').replace(/^_|_$/g, '') || 'image'
}
