import React, { useRef, useState } from 'react'
import { Upload, File, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FileUploadProps extends React.InputHTMLAttributes<HTMLInputElement> {
    onFileSelect: (file: File) => void
    accept?: string
    label?: string
    description?: string
    className?: string
    maxSize?: number // in bytes
}

export function FileUpload({
    onFileSelect,
    accept,
    label = 'Upload File',
    description = 'Drag and drop or click to upload',
    className,
    maxSize,
    ...props
}: FileUploadProps) {
    const inputRef = useRef<HTMLInputElement>(null)
    const [isDragging, setIsDragging] = useState(false)
    const [selectedFile, setSelectedFile] = useState<File | null>(null)
    const [error, setError] = useState<string | null>(null)

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(true)
    }

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)
    }

    const validateFile = (file: File): boolean => {
        if (maxSize && file.size > maxSize) {
            setError(`File size exceeds ${Math.round(maxSize / 1024 / 1024)}MB limit`)
            return false
        }
        // Check extension if accept is provided
        if (accept) {
            const extensions = accept.split(',').map(ext => ext.trim().toLowerCase())
            const fileName = file.name.toLowerCase()
            const isValid = extensions.some(ext => fileName.endsWith(ext))
            if (!isValid) {
                setError(`Invalid file type. Accepted: ${accept}`)
                return false
            }
        }
        setError(null)
        return true
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)

        const file = e.dataTransfer.files?.[0]
        if (file) {
            if (validateFile(file)) {
                setSelectedFile(file)
                onFileSelect(file)
            }
        }
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) {
            if (validateFile(file)) {
                setSelectedFile(file)
                onFileSelect(file)
            }
        }
    }

    const clearFile = (e: React.MouseEvent) => {
        e.stopPropagation()
        setSelectedFile(null)
        setError(null)
        if (inputRef.current) {
            inputRef.current.value = ''
        }
    }

    return (
        <div className={cn('w-full', className)}>
            <div
                onClick={() => inputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={cn(
                    'relative flex flex-col items-center justify-center w-full p-6 border-2 border-dashed rounded-lg transition-colors cursor-pointer',
                    isDragging
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-gray-700 bg-gray-800/50 hover:bg-gray-800',
                    error ? 'border-red-500/50 bg-red-500/5' : ''
                )}
            >
                <input
                    ref={inputRef}
                    type="file"
                    className="hidden"
                    accept={accept}
                    onChange={handleChange}
                    {...props}
                />

                {selectedFile ? (
                    <div className="flex items-center gap-3 text-sm">
                        <div className="p-2 bg-blue-500/20 rounded-full">
                            <File className="w-5 h-5 text-blue-400" />
                        </div>
                        <div className="flex flex-col">
                            <span className="font-medium text-gray-200">{selectedFile.name}</span>
                            <span className="text-xs text-gray-400">
                                {(selectedFile.size / 1024).toFixed(1)} KB
                            </span>
                        </div>
                        <button
                            onClick={clearFile}
                            className="p-1 hover:bg-gray-700 rounded-full transition-colors"
                        >
                            <X className="w-4 h-4 text-gray-400" />
                        </button>
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-2 text-center">
                        <div className="p-2 bg-gray-700/50 rounded-full">
                            <Upload className="w-6 h-6 text-gray-400" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-gray-300">{label}</p>
                            <p className="text-xs text-gray-500">{description}</p>
                        </div>
                        {accept && (
                            <p className="text-[10px] text-gray-600 mt-1">
                                Accepted: {accept}
                            </p>
                        )}
                    </div>
                )}
            </div>
            {error && (
                <p className="mt-1 text-xs text-red-400">{error}</p>
            )}
        </div>
    )
}
