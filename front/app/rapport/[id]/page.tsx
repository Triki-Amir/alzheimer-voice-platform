// app/rapport/[id]/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import Navbar from '@/components/Navbar'
import EthicsBanner from '@/components/EthicsBanner'
import { patientsApi } from '@/lib/api'
import { getUser, verifySession } from '@/lib/auth'
import type { User, Patient } from '@/types'

interface RapportPageProps {
    params: Promise<{
        id: string
    }>
}

// Types pour le rapport
interface TestResult {
    testId: string
    testName: string
    date: string
    duration: number
    score: number
    quality: 'excellent' | 'good' | 'poor'
    diagnosis?: 'control' | 'mci' | 'ad'
    confidence?: number
    sessionId?: string
}

interface PatientReport {
    patientId: string
    patientName: string
    lastSession: string
    totalTests: number
    completedTests: number
    overallScore?: number
    diagnosis?: 'control' | 'mci' | 'ad'
    confidence?: number
    tests: TestResult[]
}

export default function RapportPage({ params }: RapportPageProps) {
    const router = useRouter()
    const [user, setUser] = useState<User | null>(null)
    const [patient, setPatient] = useState<Patient | null>(null)
    const [report, setReport] = useState<PatientReport | null>(null)
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        const loadData = async () => {
            try {
                // ✅ Vérifier l'authentification via le cookie
                const isAuth = await verifySession()
                if (!isAuth) {
                    router.push('/')
                    return
                }

                const userData = getUser()
                if (!userData) {
                    router.push('/')
                    return
                }

                // ✅ Convertir AuthUser en User
                const appUser: User = {
                    id: userData.id,
                    email: userData.email,
                    name: userData.name,
                    role: userData.role === 'clinician' ? 'doctor' : 
                          userData.role === 'superadmin' ? 'admin' : 'doctor',
                    hospital: undefined,
                    voiceReferenceId: undefined
                }
                setUser(appUser)

                const { id } = await params

                if (!id) {
                    router.push('/dashboard')
                    return
                }

                // Charger le patient depuis l'API
                const result = await patientsApi.getById(id)
                if (result.success && result.data) {
                    const normalizedPatient: Patient = {
                        ...result.data,
                        id: String(result.data.id),
                        name: result.data.name || '',
                        initials: result.data.initials || '',
                        age: Number(result.data.age) || 0,
                        birthDate: result.data.birthDate || '',
                        dmiId: result.data.dmiId || '',
                        lastSession: result.data.lastSession || '',
                        color: result.data.color || '#2563EB',
                        createdAt: result.data.createdAt || new Date().toISOString(),
                        gender: result.data.gender === 'Homme' || result.data.gender === 'Femme'
                            ? result.data.gender
                            : undefined,
                    }

                    setPatient(normalizedPatient)
                    const reportData = generateReportForPatient(normalizedPatient)
                    setReport(reportData)
                } else {
                    router.push('/dashboard')
                    return
                }
            } catch (error) {
                console.error('❌ Erreur:', error)
                router.push('/')
            }

            setIsLoading(false)
        }

        loadData()
    }, [router, params])

    const generateReportForPatient = (patient: Patient): PatientReport => {
        // Simuler des résultats de tests
        const allTests = [
            { id: 'cookie_theft', name: 'Récit d\'image (Cookie Theft)', icon: '🖼️' },
            { id: 'fluency', name: 'Fluence verbale (Animaux)', icon: '🐾' },
            { id: 'recall', name: 'Rappel d\'informations', icon: '📝' },
            { id: 'sentence', name: 'Construction de phrases', icon: '✏️' },
            { id: 'naming', name: 'Nomination d\'objets', icon: '🔍' },
            { id: 'repetition', name: 'Répétition de phrases', icon: '🔊' },
            { id: 'comprehension', name: 'Compréhension', icon: '🧠' },
            { id: 'spontaneous', name: 'Discours spontané', icon: '💬' }
        ]

        const diagnoses: ('control' | 'mci' | 'ad')[] = ['control', 'mci', 'ad']
        const qualities: ('excellent' | 'good' | 'poor')[] = ['excellent', 'good', 'poor']
        
        // Simuler 3-5 tests complétés
        const completedCount = Math.floor(Math.random() * 5) + 3
        const completedTests = allTests.slice(0, completedCount).map((test, index) => ({
            testId: test.id,
            testName: test.name,
            date: new Date(Date.now() - (index * 3 * 24 * 60 * 60 * 1000)).toLocaleDateString('fr-FR'),
            duration: Math.floor(Math.random() * 120) + 60,
            score: Math.floor(Math.random() * 40) + 60,
            quality: qualities[index % qualities.length],
            diagnosis: diagnoses[index % diagnoses.length],
            confidence: Math.round((0.7 + Math.random() * 0.25) * 100) / 100,
            sessionId: `session-${Date.now()}-${index}`
        }))

        // Calculer le score global
        const overallScore = Math.round(completedTests.reduce((acc, t) => acc + t.score, 0) / completedTests.length)

        // Déterminer le diagnostic principal
        const diagnosisCounts = completedTests.reduce((acc, t) => {
            if (t.diagnosis) {
                acc[t.diagnosis] = (acc[t.diagnosis] || 0) + 1
            }
            return acc
        }, {} as Record<string, number>)

        let mainDiagnosis: 'control' | 'mci' | 'ad' | undefined
        let maxCount = 0
        for (const [diag, count] of Object.entries(diagnosisCounts)) {
            if (count > maxCount) {
                maxCount = count
                mainDiagnosis = diag as 'control' | 'mci' | 'ad'
            }
        }

        return {
            patientId: patient.id,
            patientName: patient.name,
            lastSession: new Date().toLocaleDateString('fr-FR'),
            totalTests: allTests.length,
            completedTests: completedTests.length,
            overallScore,
            diagnosis: mainDiagnosis,
            confidence: Math.round((0.7 + Math.random() * 0.25) * 100) / 100,
            tests: completedTests
        }
    }

    // ✅ Navigate to test result detail page
    const handleTestClick = (testId: string) => {
        if (patient) {
            router.push(`/test-result/${patient.id}/${testId}`)
        }
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

    const allTests = [
        { id: 'cookie_theft', name: 'Récit d\'image (Cookie Theft)', icon: '🖼️' },
        { id: 'fluency', name: 'Fluence verbale (Animaux)', icon: '🐾' },
        { id: 'recall', name: 'Rappel d\'informations', icon: '📝' },
        { id: 'sentence', name: 'Construction de phrases', icon: '✏️' },
        { id: 'naming', name: 'Nomination d\'objets', icon: '🔍' },
        { id: 'repetition', name: 'Répétition de phrases', icon: '🔊' },
        { id: 'comprehension', name: 'Compréhension', icon: '🧠' },
        { id: 'spontaneous', name: 'Discours spontané', icon: '💬' }
    ]

    if (isLoading || !user || !patient) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-4 text-gray-500">Chargement...</p>
                </div>
            </div>
        )
    }

    const diagnosisInfo = report?.diagnosis ? getDiagnosisLabel(report.diagnosis) : getDiagnosisLabel(undefined)
    const testResults = report?.tests || []

    return (
        <>
            <Header user={user} />
            <Navbar active="reports" />
            <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                
                {/* En-tête */}
                <div className="flex items-center justify-between mb-6">
                    <Link
                        href={`/patient/${patient.id}`}
                        className="text-sm text-gray-500 hover:text-gray-700 transition"
                    >
                        ← Retour au patient
                    </Link>
                    <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-400">
                            Rapport du {report?.lastSession || patient.lastSession}
                        </span>
                        <button
                            onClick={() => alert('📄 Export PDF en cours...')}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium"
                        >
                            📄 Exporter PDF
                        </button>
                    </div>
                </div>

                {/* Identité du patient */}
                <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm mb-6">
                    <div className="flex items-center gap-4">
                        <div
                            className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-xl flex-shrink-0"
                            style={{ backgroundColor: patient.color }}
                        >
                            {patient.initials}
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">{patient.name}</h1>
                            <div className="flex flex-wrap gap-4 text-sm text-gray-500">
                                <span>ID: {patient.id}</span>
                                <span>⭐ {patient.age} ans</span>
                                <span>📅 Né le {patient.birthDate}</span>
                                {patient.phone && <span>📞 {patient.phone}</span>}
                            </div>
                        </div>
                    </div>
                </div>

                {/* S - Subjective */}
                <div className="bg-white border-l-4 border-blue-500 rounded-2xl shadow-sm p-6 mb-6">
                    <div className="flex items-center gap-3 mb-4">
                        <span className="text-2xl">💬</span>
                        <h2 className="text-xl font-bold text-gray-900">S - Subjective</h2>
                        <span className="text-xs text-gray-400 font-medium">Ce que rapporte le patient / la famille</span>
                    </div>
                    <div className="space-y-3 text-gray-700">
                        <p className="text-sm italic bg-gray-50 p-4 rounded-xl">
                            "Le patient rapporte des difficultés de mémoire récentes, notamment pour retenir les noms 
                            et se souvenir d'événements récents. La famille mentionne des oublis fréquents (clés, rendez-vous) 
                            et une tendance à répéter les mêmes questions."
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                            <div className="bg-blue-50 p-3 rounded-lg">
                                <span className="font-medium text-blue-700">Symptômes rapportés</span>
                                <ul className="mt-1 text-gray-600 list-disc list-inside">
                                    <li>Troubles de mémoire (court terme)</li>
                                    <li>Difficultés de concentration</li>
                                    <li>Répétition de questions</li>
                                </ul>
                            </div>
                            <div className="bg-blue-50 p-3 rounded-lg">
                                <span className="font-medium text-blue-700">Durée / Évolution</span>
                                <p className="mt-1 text-gray-600">Installation progressive depuis 6 mois</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* O - Objective */}
                <div className="bg-white border-l-4 border-green-500 rounded-2xl shadow-sm p-6 mb-6">
                    <div className="flex items-center gap-3 mb-4">
                        <span className="text-2xl">📊</span>
                        <h2 className="text-xl font-bold text-gray-900">O - Objective</h2>
                        <span className="text-xs text-gray-400 font-medium">Données cliniques et tests</span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                        <div className="bg-gray-50 p-3 rounded-lg text-center">
                            <p className="text-sm text-gray-500">Tests réalisés</p>
                            <p className="text-lg font-bold text-blue-600">{testResults.length}</p>
                        </div>
                        <div className="bg-gray-50 p-3 rounded-lg text-center">
                            <p className="text-sm text-gray-500">Diagnostic</p>
                            <p className={`text-lg font-bold ${diagnosisInfo.color.split(' ')[0]}`}>
                                {diagnosisInfo.label}
                            </p>
                        </div>
                        <div className="bg-gray-50 p-3 rounded-lg text-center">
                            <p className="text-sm text-gray-500">Dernier test</p>
                            <p className="text-lg font-bold text-gray-700">
                                {testResults.length > 0 ? testResults[testResults.length - 1]?.date : '—'}
                            </p>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <h4 className="font-medium text-gray-700 text-sm">Résultats par test</h4>
                        {allTests.map((test) => {
                            const result = testResults.find(t => t.testId === test.id)
                            const isCompleted = !!result
                            const diag = result ? getDiagnosisLabel(result.diagnosis) : getDiagnosisLabel(undefined)

                            return (
                                <div
                                    key={test.id}
                                    onClick={() => isCompleted && handleTestClick(test.id)}
                                    className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl gap-2 transition cursor-pointer ${
                                        isCompleted 
                                            ? 'bg-green-50 border border-green-100 hover:bg-green-100 hover:shadow-md' 
                                            : 'bg-gray-50 border border-gray-100 cursor-not-allowed opacity-60'
                                    }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="text-xl">{test.icon}</span>
                                        <div>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-medium text-gray-900 text-sm">{test.name}</span>
                                                {isCompleted ? (
                                                    <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs">
                                                        ✅ Fait
                                                    </span>
                                                ) : (
                                                    <span className="px-2 py-0.5 bg-gray-100 text-gray-400 rounded-full text-xs">
                                                        ⏳ Non fait
                                                    </span>
                                                )}
                                            </div>
                                            {isCompleted && result && (
                                                <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                                                    <span>📅 {result.date}</span>
                                                    <span>⏱️ {formatDuration(result.duration)}</span>
                                                    <span>Score: <span className={`font-medium ${getScoreColor(result.score)}`}>
                                                        {result.score}%
                                                    </span></span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        {isCompleted && result && (
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${diag.color}`}>
                                                {diag.badge}
                                            </span>
                                        )}
                                        {isCompleted && (
                                            <span className="text-xs text-blue-600 hover:text-blue-800">
                                                Voir détails →
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* A - Assessment */}
                <div className="bg-white border-l-4 border-amber-500 rounded-2xl shadow-sm p-6 mb-6">
                    <div className="flex items-center gap-3 mb-4">
                        <span className="text-2xl">🧠</span>
                        <h2 className="text-xl font-bold text-gray-900">A - Assessment</h2>
                        <span className="text-xs text-gray-400 font-medium">Analyse et diagnostic</span>
                    </div>

                    <div className="space-y-4">
                        <div className="flex items-center gap-3 p-4 rounded-xl border-2 border-amber-200 bg-amber-50">
                            <span className="text-3xl">{diagnosisInfo.badge}</span>
                            <div>
                                <p className="font-bold text-gray-900">{diagnosisInfo.label}</p>
                                <p className="text-sm text-gray-600">
                                    Le patient présente des signes évocateurs d'un trouble cognitif.
                                    Une évaluation complète est recommandée.
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                            <div className="p-4 bg-gray-50 rounded-xl">
                                <span className="font-medium text-gray-700">Points clés</span>
                                <ul className="mt-2 text-gray-600 list-disc list-inside space-y-1">
                                    <li>{testResults.length}/{allTests.length} tests complétés</li>
                                    <li>Dernière évaluation: {report?.lastSession}</li>
                                </ul>
                            </div>
                            <div className="p-4 bg-gray-50 rounded-xl">
                                <span className="font-medium text-gray-700">Facteurs de risque</span>
                                <ul className="mt-2 text-gray-600 list-disc list-inside space-y-1">
                                    <li>Âge: {patient.age} ans</li>
                                    <li>Évolution progressive</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>

                {/* P - Plan */}
                <div className="bg-white border-l-4 border-purple-500 rounded-2xl shadow-sm p-6 mb-6">
                    <div className="flex items-center gap-3 mb-4">
                        <span className="text-2xl">📋</span>
                        <h2 className="text-xl font-bold text-gray-900">P - Plan</h2>
                        <span className="text-xs text-gray-400 font-medium">Prochaines étapes</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-4 bg-purple-50 rounded-xl">
                            <span className="font-medium text-purple-700">🔬 Examens complémentaires</span>
                            <ul className="mt-2 text-sm text-gray-600 list-disc list-inside space-y-1">
                                <li>Compléter les tests cognitifs restants</li>
                                <li>IRM cérébrale à discuter</li>
                                <li>Bilan biologique complet</li>
                            </ul>
                        </div>
                        <div className="p-4 bg-purple-50 rounded-xl">
                            <span className="font-medium text-purple-700">🗓️ Suivi</span>
                            <ul className="mt-2 text-sm text-gray-600 list-disc list-inside space-y-1">
                                <li>Consultation de suivi dans 3 mois</li>
                                <li>Évaluation neuropsychologique</li>
                                <li>Information de la famille</li>
                            </ul>
                        </div>
                        <div className="p-4 bg-purple-50 rounded-xl md:col-span-2">
                            <span className="font-medium text-purple-700">💊 Recommandations</span>
                            <ul className="mt-2 text-sm text-gray-600 list-disc list-inside space-y-1">
                                <li>Maintien des activités cognitives (lecture, puzzles)</li>
                                <li>Activité physique régulière</li>
                                <li>Suivi nutritionnel</li>
                            </ul>
                        </div>
                    </div>
                </div>

                <div className="mt-8">
                    <EthicsBanner />
                </div>
            </main>
        </>
    )
}