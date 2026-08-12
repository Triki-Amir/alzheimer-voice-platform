'use client'

import { useRouter } from 'next/navigation'
import type { User } from '@/types'
import { logout } from '@/lib/auth'

interface HeaderProps {
    user: User
}

export default function Header({ user }: HeaderProps) {
    const router = useRouter()

    const handleLogout = () => {
        logout()
        localStorage.removeItem('selectedPatient')
        router.push('/')
    }

    return (
        <header className="flex justify-between items-center px-4 sm:px-8 py-4 bg-white border-b border-gray-200 sticky top-0 z-50">
            <div className="flex items-center gap-2 sm:gap-3">
                <span className="text-2xl">🔵</span>
                <span className="text-lg sm:text-xl font-bold text-blue-600">eHealthBridge</span>
                <span className="text-xs sm:text-sm text-gray-400 hidden md:inline">Voix - Alzheimer - IA</span>
            </div>
            <div className="flex items-center gap-2 sm:gap-4">
                <span className="badge-success hidden sm:inline">📡 Hors-ligne</span>
                <span className="text-sm font-medium text-gray-700 hidden sm:inline">
                    👤 {user.name}
                </span>
                <button
                    onClick={handleLogout}
                    className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition font-medium"
                >
                    Déconnexion
                </button>
            </div>
        </header>
    )
}