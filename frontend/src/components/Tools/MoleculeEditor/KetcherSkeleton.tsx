import React from 'react'

export const KetcherSkeleton = () => {
  return (
    <div className="flex flex-col h-full w-full bg-white relative overflow-hidden">
      {/* Toolbar Skeleton (Top) */}
      <div className="h-10 border-b border-gray-200 bg-gray-50 flex items-center px-2 gap-2">
        <div className="h-6 w-6 bg-gray-200 rounded"></div>
        <div className="h-6 w-6 bg-gray-200 rounded"></div>
        <div className="h-6 w-6 bg-gray-200 rounded"></div>
        <div className="h-6 w-1 bg-gray-200 mx-1"></div>
        <div className="h-6 w-6 bg-gray-200 rounded"></div>
        <div className="h-6 w-6 bg-gray-200 rounded"></div>
        <div className="h-6 w-6 bg-gray-200 rounded"></div>
        <div className="flex-1"></div>
        <div className="h-6 w-20 bg-gray-200 rounded"></div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar Skeleton (Left) */}
        <div className="w-10 border-r border-gray-200 bg-gray-50 flex flex-col items-center py-2 gap-3">
          <div className="h-6 w-6 bg-gray-200 rounded"></div>
          <div className="h-6 w-6 bg-gray-200 rounded"></div>
          <div className="h-6 w-6 bg-gray-200 rounded"></div>
          <div className="h-6 w-6 bg-gray-200 rounded"></div>
          <div className="h-6 w-6 bg-gray-200 rounded"></div>
          <div className="h-6 w-6 bg-gray-200 rounded"></div>
          <div className="h-1 w-6 bg-gray-200 my-1"></div>
          <div className="h-6 w-6 bg-gray-200 rounded"></div>
        </div>

        {/* Canvas Skeleton (Center) */}
        <div className="flex-1 bg-white relative flex items-center justify-center">
          <div className="text-center">
             <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-500 border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" role="status">
              <span className="!absolute !-m-px !h-px !w-px !overflow-hidden !whitespace-nowrap !border-0 !p-0 ![clip:rect(0,0,0,0)]">Loading...</span>
            </div>
            <p className="mt-4 text-sm text-gray-500 font-medium">Initializing Chemical Editor...</p>
            <p className="mt-1 text-xs text-gray-400">Loading chemical structure engine (WASM)</p>
          </div>
        </div>

        {/* Right Toolbar Skeleton (Right) */}
        <div className="w-10 border-l border-gray-200 bg-gray-50 flex flex-col items-center py-2 gap-3">
          <div className="h-6 w-6 bg-gray-200 rounded"></div>
          <div className="h-6 w-6 bg-gray-200 rounded"></div>
          <div className="h-6 w-6 bg-gray-200 rounded"></div>
          <div className="flex-1"></div>
        </div>
      </div>

      {/* Bottom Bar Skeleton */}
      <div className="h-8 border-t border-gray-200 bg-gray-50 flex items-center px-2">
        <div className="h-4 w-32 bg-gray-200 rounded"></div>
      </div>
    </div>
  )
}
