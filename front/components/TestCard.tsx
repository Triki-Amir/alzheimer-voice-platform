// components/TestCard.tsx

'use client'

import type { Test } from '@/types'

interface TestCardProps {
    test: Test
    isCompleted?: boolean
    onStart: (testId: string) => void
    isLast?: boolean
}

export default function TestCard({ test, isCompleted = false, onStart, isLast = false }: TestCardProps) {
    return (
        <div className={`bg-white border rounded-xl p-4 sm:p-6 shadow-sm hover:shadow-md transition ${!isLast ? 'mb-4' : ''}`}>
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                {/* Icône */}
                <div className="text-4xl sm:text-5xl flex-shrink-0 text-center sm:text-left">
                    {test.icon}
                </div>

                {/* Info Test */}
                <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                        <h3 className="text-lg font-semibold text-gray-900">{test.name}</h3>
                        <span className="text-sm text-gray-500">{test.duration}</span>
                        {/* Badge catégorie */}
                        {test.category && (
                            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">
                                {test.category}
                            </span>
                        )}
                        {isCompleted && (
                            <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                                ✅ Terminé
                            </span>
                        )}
                    </div>
                    <p className="text-sm text-gray-500 mt-1">{test.description}</p>
                </div>

                {/* Bouton Démarrer */}
                <button
                    onClick={() => onStart(test.id)}
                    disabled={isCompleted}
                    className={`px-6 py-2.5 rounded-lg font-medium transition whitespace-nowrap ${
                        isCompleted
                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                >
                    {isCompleted ? '✅ Terminé' : '▶️ Démarrer'}
                </button>
            </div>
        </div>
    )
}