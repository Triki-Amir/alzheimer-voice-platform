'use client'

import { useRouter } from 'next/navigation'
import type { Test } from '@/types'

interface TestListProps {
    tests: Test[]
    patientId: string
    patientName: string
    completedTests: string[]
    onStartTest: (testId: string) => void
}

export default function TestList({ tests, patientId, patientName, completedTests, onStartTest }: TestListProps) {
    const router = useRouter()

    const allCompleted = completedTests.length === tests.length

    return (
        <div>
            {/* En-tête avec patient */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div>
                    <h2 className="text-xl font-bold text-gray-900">
                        🧪 Tests cognitifs pour {patientName}
                    </h2>
                    <p className="text-sm text-gray-500">
                        Choisissez la tâche cognitive à réaliser
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-500">
                        {completedTests.length} / {tests.length} complétés
                    </span>
                    <button
                        onClick={() => router.push('/dashboard')}
                        className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition text-sm"
                    >
                        ← Changer de patient
                    </button>
                </div>
            </div>

            {/* Liste des tests */}
            <div className="space-y-4">
                {tests.map((test) => {
                    const isCompleted = completedTests.includes(test.id)
                    return (
                        <div
                            key={test.id}
                            className={`bg-white border rounded-xl p-4 sm:p-6 shadow-sm hover:shadow-md transition ${
                                isCompleted ? 'border-green-200 bg-green-50/30' : 'border-gray-200'
                            }`}
                        >
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
                                    onClick={() => onStartTest(test.id)}
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
                })}
            </div>

            {/* Bouton protocole complet */}
            <button
                className={`w-full mt-6 py-3 font-semibold rounded-xl transition ${
                    allCompleted
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
                disabled={allCompleted}
                onClick={() => {
                    const firstPending = tests.find(t => !completedTests.includes(t.id))
                    if (firstPending) {
                        onStartTest(firstPending.id)
                    }
                }}
            >
                {allCompleted
                    ? '✅ Tous les tests sont complétés'
                    : '▶️ Lancer le protocole complet'
                }
            </button>
        </div>
    )
}