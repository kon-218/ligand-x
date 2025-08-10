'use client'

import { useState, useMemo } from 'react'
import { Download, Copy, Check, Search, X, ChevronUp, ChevronDown, FileText, Terminal, Code } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TextFileViewerProps {
  content: string
  name: string
  onClose?: () => void
}

type FileType = 'log' | 'input' | 'output' | 'generic'

function detectFileType(name: string): FileType {
  const lowerName = name.toLowerCase()
  if (lowerName.includes('log') || lowerName.includes('equilibration') || lowerName.includes('optimization')) {
    return 'log'
  }
  if (lowerName.includes('input') || lowerName.endsWith('.inp')) {
    return 'input'
  }
  if (lowerName.includes('output') || lowerName.endsWith('.out')) {
    return 'output'
  }
  return 'generic'
}

function getFileIcon(fileType: FileType) {
  switch (fileType) {
    case 'log':
      return Terminal
    case 'input':
    case 'output':
      return Code
    default:
      return FileText
  }
}

function getFileDescription(name: string, fileType: FileType): string {
  switch (fileType) {
    case 'log':
      if (name.toLowerCase().includes('equilibration')) {
        return 'MD Equilibration Log - Shows simulation progress, energy values, and convergence'
      }
      if (name.toLowerCase().includes('orca')) {
        return 'ORCA Output Log - Contains calculation results and diagnostic information'
      }
      return 'Simulation log file'
    case 'input':
      if (name.toLowerCase().includes('orca')) {
        return 'ORCA Input File - Quantum chemistry calculation parameters'
      }
      return 'Input configuration file'
    case 'output':
      return 'Calculation output file'
    default:
      return 'Text file preview'
  }
}

export function TextFileViewer({ content, name, onClose }: TextFileViewerProps) {
  const [copied, setCopied] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [currentMatch, setCurrentMatch] = useState(0)
  const [showLineNumbers, setShowLineNumbers] = useState(true)

  const fileType = detectFileType(name)
  const FileIcon = getFileIcon(fileType)
  const description = getFileDescription(name, fileType)

  // Split content into lines for line numbers
  const lines = useMemo(() => content.split('\n'), [content])
  
  // Find search matches
  const matches = useMemo(() => {
    if (!searchQuery.trim()) return []
    const query = searchQuery.toLowerCase()
    const results: { lineIndex: number; startIndex: number }[] = []
    lines.forEach((line, lineIndex) => {
      let startIndex = 0
      const lowerLine = line.toLowerCase()
      while (true) {
        const index = lowerLine.indexOf(query, startIndex)
        if (index === -1) break
        results.push({ lineIndex, startIndex: index })
        startIndex = index + 1
      }
    })
    return results
  }, [lines, searchQuery])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handleDownload = () => {
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name.includes('.') ? name : `${name}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const navigateMatch = (direction: 'next' | 'prev') => {
    if (matches.length === 0) return
    let newIndex = currentMatch
    if (direction === 'next') {
      newIndex = (currentMatch + 1) % matches.length
    } else {
      newIndex = (currentMatch - 1 + matches.length) % matches.length
    }
    setCurrentMatch(newIndex)
    
    // Scroll to match
    const match = matches[newIndex]
    const lineElement = document.getElementById(`line-${match.lineIndex}`)
    if (lineElement) {
      lineElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  // Highlight search matches in a line
  const highlightLine = (line: string, lineIndex: number) => {
    if (!searchQuery.trim()) return line
    
    const query = searchQuery.toLowerCase()
    const lowerLine = line.toLowerCase()
    const parts: React.ReactNode[] = []
    let lastIndex = 0
    let matchIndexInLine = 0
    
    let startIndex = 0
    while (true) {
      const index = lowerLine.indexOf(query, startIndex)
      if (index === -1) break
      
      // Add text before match
      if (index > lastIndex) {
        parts.push(line.slice(lastIndex, index))
      }
      
      // Check if this is the current match
      const globalMatchIndex = matches.findIndex(
        m => m.lineIndex === lineIndex && m.startIndex === index
      )
      const isCurrentMatch = globalMatchIndex === currentMatch
      
      // Add highlighted match
      parts.push(
        <span
          key={`${lineIndex}-${matchIndexInLine}`}
          className={cn(
            'rounded px-0.5',
            isCurrentMatch 
              ? 'bg-yellow-500 text-black font-semibold' 
              : 'bg-yellow-500/30 text-yellow-200'
          )}
        >
          {line.slice(index, index + searchQuery.length)}
        </span>
      )
      
      lastIndex = index + searchQuery.length
      startIndex = index + 1
      matchIndexInLine++
    }
    
    // Add remaining text
    if (lastIndex < line.length) {
      parts.push(line.slice(lastIndex))
    }
    
    return parts.length > 0 ? parts : line
  }

  return (
    <div className="w-full h-full flex flex-col bg-gray-900 text-gray-300">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-600/20 rounded-lg">
            <FileIcon className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">{name}</h3>
            <p className="text-xs text-gray-400">{description}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Line count badge */}
          <span className="text-xs text-gray-500 bg-gray-700 px-2 py-1 rounded">
            {lines.length} lines
          </span>
          
          {/* Search toggle */}
          <button
            onClick={() => setShowSearch(!showSearch)}
            className={cn(
              'p-2 rounded-lg transition-colors',
              showSearch 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            )}
            title="Search (Ctrl+F)"
          >
            <Search className="w-4 h-4" />
          </button>
          
          {/* Line numbers toggle */}
          <button
            onClick={() => setShowLineNumbers(!showLineNumbers)}
            className={cn(
              'p-2 rounded-lg transition-colors text-xs font-mono',
              showLineNumbers 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            )}
            title="Toggle line numbers"
          >
            #
          </button>
          
          {/* Copy button */}
          <button
            onClick={handleCopy}
            className="p-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors"
            title="Copy to clipboard"
          >
            {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
          </button>
          
          {/* Download button */}
          <button
            onClick={handleDownload}
            className="p-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors"
            title="Download file"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      {/* Search bar */}
      {showSearch && (
        <div className="flex items-center gap-2 px-4 py-2 bg-gray-800/50 border-b border-gray-700">
          <Search className="w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setCurrentMatch(0)
            }}
            placeholder="Search in file..."
            className="flex-1 bg-gray-700 text-white text-sm px-3 py-1.5 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
            autoFocus
          />
          {matches.length > 0 && (
            <>
              <span className="text-xs text-gray-400">
                {currentMatch + 1} of {matches.length}
              </span>
              <button
                onClick={() => navigateMatch('prev')}
                className="p-1 hover:bg-gray-700 rounded"
                title="Previous match"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
              <button
                onClick={() => navigateMatch('next')}
                className="p-1 hover:bg-gray-700 rounded"
                title="Next match"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </>
          )}
          {searchQuery && matches.length === 0 && (
            <span className="text-xs text-red-400">No matches</span>
          )}
          <button
            onClick={() => {
              setShowSearch(false)
              setSearchQuery('')
            }}
            className="p-1 hover:bg-gray-700 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      
      {/* Content */}
      <div className="flex-1 overflow-auto custom-scrollbar">
        <div className="min-w-max">
          {lines.map((line, index) => (
            <div
              key={index}
              id={`line-${index}`}
              className={cn(
                'flex hover:bg-gray-800/50 transition-colors',
                matches.some(m => m.lineIndex === index) && 'bg-yellow-900/20'
              )}
            >
              {showLineNumbers && (
                <span className="select-none text-gray-600 text-xs font-mono px-3 py-0.5 text-right min-w-[4rem] border-r border-gray-800 bg-gray-900/50 sticky left-0">
                  {index + 1}
                </span>
              )}
              <pre className="flex-1 text-sm font-mono px-4 py-0.5 whitespace-pre overflow-x-visible">
                {highlightLine(line, index) || ' '}
              </pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
