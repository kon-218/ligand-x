'use client'

import * as React from 'react'
import * as SwitchPrimitives from '@radix-ui/react-switch'

interface SwitchProps extends React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root> {
  accentColor?: 'blue' | 'pink' | 'cyan' | 'green' | 'purple' | 'orange' | 'indigo'
}

const accentColorMap = {
  blue: { ring: 'focus-visible:ring-blue-400', checked: 'data-[state=checked]:bg-blue-500' },
  pink: { ring: 'focus-visible:ring-pink-400', checked: 'data-[state=checked]:bg-pink-500' },
  cyan: { ring: 'focus-visible:ring-cyan-400', checked: 'data-[state=checked]:bg-cyan-500' },
  green: { ring: 'focus-visible:ring-green-400', checked: 'data-[state=checked]:bg-green-500' },
  purple: { ring: 'focus-visible:ring-purple-400', checked: 'data-[state=checked]:bg-purple-500' },
  orange: { ring: 'focus-visible:ring-orange-400', checked: 'data-[state=checked]:bg-orange-500' },
  indigo: { ring: 'focus-visible:ring-indigo-400', checked: 'data-[state=checked]:bg-indigo-500' },
}

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  SwitchProps
>(({ className, accentColor = 'blue', ...props }, ref) => {
  const colors = accentColorMap[accentColor]
  return (
    <SwitchPrimitives.Root
      className={`peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=unchecked]:bg-gray-700 ${colors.ring} ${colors.checked} ${className || ''}`}
      {...props}
      ref={ref}
    >
      <SwitchPrimitives.Thumb
        className="pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0"
      />
    </SwitchPrimitives.Root>
  )
})
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
