// app/test-result/[patientId]/[testId]/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import Navbar from '@/components/Navbar'
import EthicsBanner from '@/components/EthicsBanner'
import { mockPatients, mockPatientReports } from '@/lib/data'
import type { User, Patient, TestResult } from '@/types'

interface TestResultPageProps {
    params: Promise<{
        patientId: string
        testId: string
    }>
}

export default function TestResultPage({ params }: TestResultPageProps) {
    const router = useRouter()
    const [user, setUser] = useState<User | null>(null)
    const [patient, setPatient] = useState<Patient | null>(null)
    const [testResult, setTestResult] = useState<TestResult | null>(null)
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        const loadData = async () => {
            const userData = localStorage.getItem('user')
            if (!userData) {
                router.push('/')
                return
            }
            setUser(JSON.parse(userData))

            const { patientId, testId } = await params

            if (!patientId || !testId) {
                router.push('/dashboard')
                return
            }

            const foundPatient = mockPatients.find(p => p.id === patientId)
            if (foundPatient) {
                setPatient(foundPatient)
            } else {
                router.push('/dashboard')
                return
            }

            const report = mockPatientReports[patientId]
            if (report) {
                const result = report.tests.find(t => t.testId === testId)
                if (result) {
                    setTestResult(result)
                }
            }

            setIsLoading(false)
        }

        loadData()
    }, [router, params])

    const getDiagnosisLabel = (diagnosis?: string) => {
        switch (diagnosis) {
            case 'control': return { label: 'Normal', color: 'text-green-700 bg-green-50' }
            case 'mci': return { label: 'MCI', color: 'text-amber-700 bg-amber-50' }
            case 'ad': return { label: 'Alzheimer', color: 'text-red-700 bg-red-50' }
            default: return { label: 'Non évalué', color: 'text-gray-500 bg-gray-50' }
        }
    }

    const getScoreColor = (score: number) => {
        if (score >= 80) return 'text-green-600'
        if (score >= 60) return 'text-amber-500'
        return 'text-red-500'
    }

    const formatDuration = (seconds: number) => {
        const m = Math.floor(seconds / 60)
        const s = seconds % 60
        return `${m}:${String(s).padStart(2, '0')}`
    }

    // Données mockées pour les détails du test (à remplacer par les vraies données)
    const mockTestDetails = {
        transcript: "hello hello Hi how are you will you be something",
        words: ["hello", "hello", "Hi", "how", "are", "you", "will", "you", "be", "something"],
        wordCount: 10,
        speechRate: 30,
        fillerWords: 0,
        repetitions: 1,
        accuracy: 0,
        timeToFirstWord: 3.23,
        pausePatterns: {
            totalPauses: 4,
            avgPauseDuration: 0.8
        }
    }

    if (isLoading || !user || !patient || !testResult) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-4 text-gray-500">Chargement...</p>
                </div>
            </div>
        )
    }

    const diagInfo = testResult.diagnosis ? getDiagnosisLabel(testResult.diagnosis) : getDiagnosisLabel(undefined)

    return (
        <>
            <Header user={user} />
            <Navbar active="reports" />
            <main className="max-w-4xl mx-auto px-4 py-6">
                
                {/* ==================== EN-TÊTE ==================== */}
                <div className="flex items-center justify-between mb-6">
                    <Link href={`/rapport/${patient.id}`} className="text-sm text-gray-500 hover:text-gray-700 transition">
                        ← Retour au rapport
                    </Link>
                    <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-400">
                            {testResult.date}
                        </span>
                        <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium">
                            📄 Exporter
                        </button>
                    </div>
                </div>

                {/* ==================== EN-TÊTE DU TEST ==================== */}
                <div className="bg-white border-2 border-gray-200 rounded-2xl p-6 shadow-sm mb-6">
                    <div className="flex items-center gap-4">
                        <span className="text-5xl">{getTestIcon(testResult.testId)}</span>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">{testResult.testName}</h1>
                            <div className="flex flex-wrap gap-4 text-sm text-gray-500">
                                <span>📅 {testResult.date}</span>
                                <span>⏱️ {formatDuration(testResult.duration)}</span>
                                <span>🎤 Qualité: <span className="font-medium">{testResult.quality}</span></span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ==================== RÉSULTATS PRINCIPAUX ==================== */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-white border-2 border-gray-200 rounded-xl p-4 text-center">
                        <p className="text-sm text-gray-500">Score</p>
                        <p className={`text-2xl font-bold ${getScoreColor(testResult.score)}`}>
                            {testResult.score}%
                        </p>
                    </div>
                    <div className="bg-white border-2 border-gray-200 rounded-xl p-4 text-center">
                        <p className="text-sm text-gray-500">Diagnostic</p>
                        <p className={`text-lg font-bold ${diagInfo.color.split(' ')[0]}`}>
                            {diagInfo.label}
                        </p>
                    </div>
                    <div className="bg-white border-2 border-gray-200 rounded-xl p-4 text-center">
                        <p className="text-sm text-gray-500">Confiance</p>
                        <p className="text-2xl font-bold text-purple-600">
                            {testResult.confidence ? `${Math.round(testResult.confidence * 100)}%` : '—'}
                        </p>
                    </div>
                    <div className="bg-white border-2 border-gray-200 rounded-xl p-4 text-center">
                        <p className="text-sm text-gray-500">Durée</p>
                        <p className="text-2xl font-bold text-blue-600">
                            {formatDuration(testResult.duration)}
                        </p>
                    </div>
                </div>

                {/* ==================== ANALYSE DÉTAILLÉE ==================== */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    {/* Colonne Gauche : Métriques Vocales */}
                    <div className="bg-white border-2 border-gray-200 rounded-2xl p-6 shadow-sm">
                        <h2 className="text-lg font-bold text-gray-900 mb-4">🎤 Analyse Vocale</h2>
                        <div className="space-y-4">
                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-sm text-gray-600">Speech Rate</span>
                                    <span className="text-sm font-bold">{mockTestDetails.speechRate} wpm</span>
                                </div>
                                <div className="text-xs text-gray-400">90–190 wpm = Normal</div>
                            </div>
                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-sm text-gray-600">Speed Variability</span>
                                    <span className="text-sm font-bold">±0 wpm</span>
                                </div>
                                <div className="text-xs text-gray-400">Low variability = steady pace</div>
                            </div>
                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-sm text-gray-600">Time to First Word</span>
                                    <span className="text-sm font-bold">{mockTestDetails.timeToFirstWord}s</span>
                                </div>
                            </div>
                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-sm text-gray-600">Completion</span>
                                    <span className="text-sm font-bold">27%</span>
                                </div>
                                <div className="text-xs text-gray-400">Total recording time: 20s</div>
                            </div>
                        </div>
                    </div>

                    {/* Colonne Droite : Métriques de Transcription */}
                    <div className="bg-white border-2 border-gray-200 rounded-2xl p-6 shadow-sm">
                        <h2 className="text-lg font-bold text-gray-900 mb-4">📝 Transcription</h2>
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-gray-600">Word Accuracy</span>
                                <span className="text-sm font-bold text-red-500">{mockTestDetails.accuracy}%</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-gray-600">Filler Words</span>
                                <span className="text-sm font-bold">{mockTestDetails.fillerWords}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-gray-600">Repetitions</span>
                                <span className="text-sm font-bold">{mockTestDetails.repetitions}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-gray-600">Word Count</span>
                                <span className="text-sm font-bold">{mockTestDetails.wordCount}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-gray-600">Total Pauses</span>
                                <span className="text-sm font-bold">{mockTestDetails.pausePatterns.totalPauses}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ==================== TRANSCRIPTION COMPLÈTE ==================== */}
                <div className="bg-white border-2 border-gray-200 rounded-2xl p-6 shadow-sm mb-6">
                    <h2 className="text-lg font-bold text-gray-900 mb-3">📄 Votre transcription</h2>
                    <div className="bg-gray-50 rounded-xl p-4">
                        <p className="text-gray-700 italic">"{mockTestDetails.transcript}"</p>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-3">
                        {mockTestDetails.words.map((word, index) => (
                            <span
                                key={index}
                                className="px-2 py-1 bg-blue-100 text-blue-800 rounded-md text-sm"
                            >
                                {word}
                            </span>
                        ))}
                    </div>
                </div>

                {/* ==================== BOUTONS D'ACTION ==================== */}
                <div className="flex flex-wrap gap-3">
                    <Link
                        href={`/rapport/${patient.id}`}
                        className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition"
                    >
                        ← Retour au rapport
                    </Link>
                    <button
                        onClick={() => alert('🔊 Lecture audio...')}
                        className="px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition"
                    >
                        🔊 Écouter l'enregistrement
                    </button>
                    <button className="px-6 py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition">
                        📄 Exporter en PDF
                    </button>
                </div>

                <div className="mt-8">
                    <EthicsBanner />
                </div>
            </main>
        </>
    )
}

// Helper pour les icônes
function getTestIcon(testId: string): string {
    const icons: Record<string, string> = {
        cookie_theft: '🖼️',
        fluency: '🐾',
        recall: '📝',
        sentence: '✏️',
        naming: '🔍',
        repetition: '🔊',
        comprehension: '🧠',
        spontaneous: '💬'
    }
    return icons[testId] || '📋'
}