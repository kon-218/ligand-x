'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useUIStore } from '@/store/ui-store'

export default function SupportPage() {
  const router = useRouter()
  const { setActiveOverlay } = useUIStore()

  useEffect(() => {
    setActiveOverlay('support')
    router.replace('/')
  }, [setActiveOverlay, router])

  return null
}
