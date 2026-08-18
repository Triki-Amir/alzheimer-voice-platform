// app/test-result/[patientId]/[testId]/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import Navbar from '@/components/Navbar'
import EthicsBanner from '@/components/EthicsBanner'
import { patientsApi } from '@/lib/api'
import { ingestionApi } from '@/lib/ingestion_service_api'
import { getToken } from '@/lib/auth'
import type { User, Patient } from '@/types'

interface TestResultPageProps {
    params: Promise<{
        patientId: string
        testId: string
    }>
}

interface TestDetail {
    testId: string
    testName: string
    date: string
    duration: number
    score: number
    quality: 'excellent' | 'good' | 'poor'
    diagnosis?: 'control' | 'mci' | 'ad'
    confidence?: number
    transcript?: string
    words?: string[]
    wordCount?: number
    speechRate?: number
    fillerWords?: number
    repetitions?: number
    accuracy?: number
    timeToFirstWord?: number
    pausePatterns?: {
        totalPauses: number
        avgPauseDuration: number
    }
    features?: {
        lexicalRichness: number
        syntacticComplexity: number
        responseTime: number
    }
}

export default function TestResultPage({ params }: TestResultPageProps) {
    const router = useRouter()
    const [user, setUser] = useState<User | null>(null)
    const [patient, setPatient] = useState<Patient | null>(null)
    const [testDetail, setTestDetail] = useState<TestDetail | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const loadData = async () => {
            try {
                const token = getToken()
                if (!token) {
                    router.push('/')
                    return
                }

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

                // Charger le patient depuis l'API
                const patientsResult = await patientsApi.getAll()
                if (patientsResult.success && patientsResult.data) {
                    type ApiPatientLike = {
                        id?: string | number
                        external_ref?: string | null
                    }

                    const foundPatient = patientsResult.data.find(
                        (item: ApiPatientLike) => String(item.id) === patientId || item.external_ref === patientId
                    ) as Patient | undefined

                    if (foundPatient) {
                        setPatient(foundPatient)
                    } else {
                        setError('Patient non trouvé')
                        return
                    }
                } else {
                    setError('Patient non trouvé')
                    return
                }

                // Charger les sessions du patient depuis l'ingestion service
                const sessionsResult = await ingestionApi.getPatientSessions(patientId)
                if (sessionsResult.success && sessionsResult.data) {
                    // Trouver la session correspondante pour ce test
                    // Pour l'instant, on utilise la première session disponible
                    const session = sessionsResult.data[0]
                    if (session) {
                        // Générer les détails du test à partir de la session
                        const details = generateTestDetailsFromSession(testId, session)
                        setTestDetail(details)
                    } else {
                        // Si aucune session, générer des données mockées pour l'affichage
                        const details = generateMockTestDetails(testId)
                        setTestDetail(details)
                    }
                } else {
                    // Si l'API échoue, générer des données mockées
                    const details = generateMockTestDetails(testId)
                    setTestDetail(details)
                }

                setIsLoading(false)
            } catch (error) {
                console.error('Error loading test result:', error)
                setError('Erreur lors du chargement des données')
                setIsLoading(false)
            }
        }

        loadData()
    }, [router, params])

    const generateTestDetailsFromSession = (testId: string, session: any): TestDetail => {
        const testNames: Record<string, string> = {
            cookie_theft: 'Récit d\'image (Cookie Theft)',
            fluency: 'Fluence verbale (Animaux)',
            recall: 'Rappel d\'informations',
            sentence: 'Construction de phrases',
            naming: 'Nomination d\'objets',
            repetition: 'Répétition de phrases',
            comprehension: 'Compréhension',
            spontaneous: 'Discours spontané'
        }

        return {
            testId: testId,
            testName: testNames[testId] || testId,
            date: session.created_at ? new Date(session.created_at).toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR'),
            duration: 120,
            score: Math.floor(Math.random() * 40) + 60,
            quality: 'good',
            diagnosis: 'control',
            confidence: 0.85,
            transcript: "Transcription du test en cours de traitement...",
            words: ['mot1', 'mot2', 'mot3'],
            wordCount: 45,
            speechRate: 3.2,
            fillerWords: 2,
            repetitions: 1,
            accuracy: 85,
            timeToFirstWord: 2.5,
            pausePatterns: {
                totalPauses: 4,
                avgPauseDuration: 0.8
            },
            features: {
                lexicalRichness: 0.75,
                syntacticComplexity: 0.62,
                responseTime: 1.8
            }
        }
    }

    const generateMockTestDetails = (testId: string): TestDetail => {
        const testNames: Record<string, string> = {
            cookie_theft: 'Récit d\'image (Cookie Theft)',
            fluency: 'Fluence verbale (Animaux)',
            recall: 'Rappel d\'informations',
            sentence: 'Construction de phrases',
            naming: 'Nomination d\'objets',
            repetition: 'Répétition de phrases',
            comprehension: 'Compréhension',
            spontaneous: 'Discours spontané'
        }

        return {
            testId: testId,
            testName: testNames[testId] || testId,
            date: new Date().toLocaleDateString('fr-FR'),
            duration: Math.floor(Math.random() * 120) + 60,
            score: Math.floor(Math.random() * 40) + 60,
            quality: 'good',
            diagnosis: 'control',
            confidence: 0.85,
            transcript: "Le patient a décrit l'image avec une bonne fluidité. Il a identifié la majorité des éléments clés.",
            words: ['maison', 'enfant', 'cookie', 'cuisine', 'fenêtre'],
            wordCount: 45,
            speechRate: 3.2,
            fillerWords: 2,
            repetitions: 1,
            accuracy: 85,
            timeToFirstWord: 2.5,
            pausePatterns: {
                totalPauses: 4,
                avgPauseDuration: 0.8
            },
            features: {
                lexicalRichness: 0.75,
                syntacticComplexity: 0.62,
                responseTime: 1.8
            }
        }
    }

    const getTestIcon = (testId: string): string => {
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

    const getDiagnosisLabel = (diagnosis?: string) => {
        switch (diagnosis) {
            case 'control': return { label: 'Normal', color: 'text-green-700 bg-green-50 border-green-200', badge: '✅ Normal' }
            case 'mci': return { label: 'Trouble Cognitif Léger (MCI)', color: 'text-amber-700 bg-amber-50 border-amber-200', badge: '⚠️ MCI' }
            case 'ad': return { label: 'Maladie d\'Alzheimer', color: 'text-red-700 bg-red-50 border-red-200', badge: '🔴 Alzheimer' }
            default: return { label: 'Non évalué', color: 'text-gray-500 bg-gray-50 border-gray-200', badge: '⏳ En attente' }
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

    if (isLoading || !user) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-4 text-gray-500">Chargement...</p>
                </div>
            </div>
        )
    }

    if (error || !patient || !testDetail) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <div className="text-red-500 text-6xl mb-4">⚠️</div>
                    <h2 className="text-xl font-semibold text-gray-900 mb-2">Erreur</h2>
                    <p className="text-gray-500">{error || 'Données non disponibles'}</p>
                    <button
                        onClick={() => router.push('/dashboard')}
                        className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                    >
                        Retour au dashboard
                    </button>
                </div>
            </div>
        )
    }

    const diagInfo = testDetail.diagnosis ? getDiagnosisLabel(testDetail.diagnosis) : getDiagnosisLabel(undefined)

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
                            {testDetail.date}
                        </span>
                        <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium">
                            📄 Exporter
                        </button>
                    </div>
                </div>

                {/* ==================== EN-TÊTE DU TEST ==================== */}
                <div className="bg-white border-2 border-gray-200 rounded-2xl p-6 shadow-sm mb-6">
                    <div className="flex items-center gap-4">
                        <span className="text-5xl">{getTestIcon(testDetail.testId)}</span>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">{testDetail.testName}</h1>
                            <div className="flex flex-wrap gap-4 text-sm text-gray-500">
                                <span>📅 {testDetail.date}</span>
                                <span>⏱️ {formatDuration(testDetail.duration)}</span>
                                <span>🎤 Qualité: <span className="font-medium">{testDetail.quality}</span></span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ==================== RÉSULTATS PRINCIPAUX ==================== */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-white border-2 border-gray-200 rounded-xl p-4 text-center">
                        <p className="text-sm text-gray-500">Score</p>
                        <p className={`text-2xl font-bold ${getScoreColor(testDetail.score)}`}>
                            {testDetail.score}%
                        </p>
                    </div>
                    <div className="bg-white border-2 border-gray-200 rounded-xl p-4 text-center">
                        <p className="text-sm text-gray-500">Diagnostic</p>
                        <p className={`text-lg font-bold ${diagInfo.color.split(' ')[0]}`}>
                            {diagInfo.label}
                        </p>
                    </div>
                    
                    <div className="bg-white border-2 border-gray-200 rounded-xl p-4 text-center">
                        <p className="text-sm text-gray-500">Durée</p>
                        <p className="text-2xl font-bold text-blue-600">
                            {formatDuration(testDetail.duration)}
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
                                    <span className="text-sm text-gray-600">Débit de parole</span>
                                    <span className="text-sm font-bold">3 mots/min</span>
                                </div>
                                <div className="text-xs text-gray-400">Normal: 16 mots/min</div>
                            </div>
                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-sm text-gray-600">Temps 1er mot</span>
                                    <span className="text-sm font-bold">{testDetail.timeToFirstWord?.toFixed(1) || '—'}s</span>
                                </div>
                            </div>
                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-sm text-gray-600">Mots</span>
                                    <span className="text-sm font-bold">{testDetail.wordCount || 0}</span>
                                </div>
                            </div>
                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-sm text-gray-600">Précision</span>
                                    <span className="text-sm font-bold">{testDetail.accuracy || 0}%</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Colonne Droite : Métriques de Transcription */}
                    <div className="bg-white border-2 border-gray-200 rounded-2xl p-6 shadow-sm">
                        <h2 className="text-lg font-bold text-gray-900 mb-4">📝 Analyse Linguistique</h2>
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-gray-600">Richesse lexicale</span>
                                <span className="text-sm font-bold">
                                    {testDetail.features?.lexicalRichness ? `${(testDetail.features.lexicalRichness * 100).toFixed(0)}%` : '—'}
                                </span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-gray-600">Complexité syntaxique</span>
                                <span className="text-sm font-bold">
                                    {testDetail.features?.syntacticComplexity ? `${(testDetail.features.syntacticComplexity * 100).toFixed(0)}%` : '—'}
                                </span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-gray-600">Temps de réponse</span>
                                <span className="text-sm font-bold">{testDetail.features?.responseTime?.toFixed(1) || '—'}s</span>
                            </div>
                            
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-gray-600">Répétitions</span>
                                <span className="text-sm font-bold">{testDetail.repetitions || 0}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ==================== PAUSES ==================== */}
                {testDetail.pausePatterns && (
                    <div className="bg-white border-2 border-gray-200 rounded-2xl p-6 shadow-sm mb-6">
                        <h2 className="text-lg font-bold text-gray-900 mb-3">⏸️ Pauses</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-gray-50 p-4 rounded-xl text-center">
                                <p className="text-sm text-gray-500">Nombre de pauses</p>
                                <p className="text-xl font-bold text-blue-600">{testDetail.pausePatterns.totalPauses}</p>
                            </div>
                            <div className="bg-gray-50 p-4 rounded-xl text-center">
                                <p className="text-sm text-gray-500">Durée moyenne</p>
                                <p className="text-xl font-bold text-blue-600">{testDetail.pausePatterns.avgPauseDuration.toFixed(1)}s</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* ==================== TRANSCRIPTION ==================== */}
                {testDetail.transcript && (
                    <div className="bg-white border-2 border-gray-200 rounded-2xl p-6 shadow-sm mb-6">
                        <h2 className="text-lg font-bold text-gray-900 mb-3">📄 Transcription</h2>
                        <div className="bg-gray-50 rounded-xl p-4">
                            <p className="text-gray-700 italic">"{testDetail.transcript}"</p>
                        </div>
                        {testDetail.words && testDetail.words.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-3">
                                {testDetail.words.map((word, index) => (
                                    <span
                                        key={index}
                                        className="px-2 py-1 bg-blue-100 text-blue-800 rounded-md text-sm"
                                    >
                                        {word}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                )}

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