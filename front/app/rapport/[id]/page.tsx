'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import Navbar from '@/components/Navbar'
import EthicsBanner from '@/components/EthicsBanner'
import { mockPatients, mockPatientReports } from '@/lib/data'
import type { User, Patient, PatientReport } from '@/types'

interface RapportPageProps {
    params: Promise<{
        id: string
    }>
}

export default function RapportPage({ params }: RapportPageProps) {
    const router = useRouter()
    const [user, setUser] = useState<User | null>(null)
    const [patient, setPatient] = useState<Patient | null>(null)
    const [report, setReport] = useState<PatientReport | null>(null)
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        const loadData = async () => {
            const userData = localStorage.getItem('user')
            if (!userData) {
                router.push('/')
                return
            }
            setUser(JSON.parse(userData))

            const { id } = await params

            if (!id) {
                router.push('/dashboard')
                return
            }

            const foundPatient = mockPatients.find(p => p.id === id)
            if (foundPatient) {
                setPatient(foundPatient)
            } else {
                router.push('/dashboard')
                return
            }

            const patientReport = mockPatientReports[id]
            if (patientReport) {
                setReport(patientReport)
            }

            setIsLoading(false)
        }

        loadData()
    }, [router, params])

    const getDiagnosisLabel = (diagnosis?: string) => {
        switch (diagnosis) {
            case 'control': return { label: '✅ Normal', color: 'text-green-600 bg-green-50', bg: 'bg-green-500' }
            case 'mci': return { label: '⚠️ MCI (Léger)', color: 'text-amber-600 bg-amber-50', bg: 'bg-amber-500' }
            case 'ad': return { label: '🔴 Alzheimer', color: 'text-red-600 bg-red-50', bg: 'bg-red-500' }
            default: return { label: 'Non évalué', color: 'text-gray-500 bg-gray-50', bg: 'bg-gray-400' }
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

    // Définition des tests pour l'affichage
    const allTests = [
        { id: 'cookie_theft', name: 'Récit d\'image (Cookie Theft)', icon: '🖼️' },
        { id: 'fluency', name: 'Fluence verbale (Animaux)', icon: '🐾' },
        { id: 'recall', name: 'Rappel d\'informations', icon: '📝' },
        { id: 'sentence', name: 'Construction de phrases', icon: '✏️' }
    ]

    // Mapper les résultats des tests
    const testResults = report?.tests || []
    const completedTestIds = testResults.map(t => t.testId)
    const completedCount = completedTestIds.length
    const totalCount = allTests.length
    const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0

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

    return (
        <>
            <Header user={user} />
            <Navbar active="reports" />
            <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                {/* Bouton retour */}
                <Link
                    href={`/patient/${patient.id}`}
                    className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-6 transition"
                >
                    ← Retour au patient
                </Link>

                {/* En-tête */}
                <div className="mb-6">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">📊 Rapport de {patient.name}</h1>
                            <p className="text-gray-500 text-sm">
                                Dernière mise à jour: {report?.lastSession || patient.lastSession}
                            </p>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-sm text-gray-500">
                                {completedCount}/{totalCount} tests complétés
                            </span>
                            <Link
                                href={`/tests`}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium"
                                onClick={() => localStorage.setItem('selectedPatient', patient.id)}
                            >
                                ▶️ Commencer un test
                            </Link>
                        </div>
                    </div>
                </div>

                {/* Score global et stats */}
                <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm mb-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="text-center p-4 bg-gray-50 rounded-xl">
                            <div className={`text-3xl font-bold ${getScoreColor(report?.overallScore || 0)}`}>
                                {report?.overallScore || '—'}%
                            </div>
                            <div className="text-sm text-gray-500">Score global</div>
                        </div>
                        <div className="text-center p-4 bg-gray-50 rounded-xl">
                            <div className="text-3xl font-bold text-blue-600">
                                {completedCount}/{totalCount}
                            </div>
                            <div className="text-sm text-gray-500">Tests complétés</div>
                        </div>
                        <div className="text-center p-4 bg-gray-50 rounded-xl">
                            <div className={`text-3xl font-bold ${diagnosisInfo.color.split(' ')[0]}`}>
                                {diagnosisInfo.label}
                            </div>
                            <div className="text-sm text-gray-500">Diagnostic</div>
                        </div>
                        <div className="text-center p-4 bg-gray-50 rounded-xl">
                            <div className="text-3xl font-bold text-purple-600">
                                {report?.confidence ? `${Math.round(report.confidence * 100)}%` : '—'}
                            </div>
                            <div className="text-sm text-gray-500">Confiance</div>
                        </div>
                    </div>
                </div>

                {/* Barre de progression */}
                <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm mb-6">
                    <div className="flex justify-between text-sm text-gray-600 mb-2">
                        <span>Progression des tests</span>
                        <span>{Math.round(progress)}%</span>
                    </div>
                    <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-blue-600 rounded-full transition-all duration-500"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                </div>

                {/* Liste complète des tests avec statut */}
                <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">📋 Résultats par test</h3>
                    
                    {allTests.map((test) => {
                        const result = testResults.find(t => t.testId === test.id)
                        const isCompleted = !!result
                        const diag = result ? getDiagnosisLabel(result.diagnosis) : getDiagnosisLabel(undefined)
                        
                        return (
                            <div
                                key={test.id}
                                className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl gap-3 mb-3 transition ${
                                    isCompleted 
                                        ? 'bg-green-50 border border-green-200' 
                                        : 'bg-gray-50 border border-gray-200'
                                }`}
                            >
                                <div className="flex items-center gap-3 flex-1">
                                    <span className="text-2xl">{test.icon}</span>
                                    <div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-medium text-gray-900">{test.name}</span>
                                            {isCompleted ? (
                                                <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                                                    ✅ Complété
                                                </span>
                                            ) : (
                                                <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-xs font-medium">
                                                    ⏳ En attente
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap gap-3 text-sm text-gray-500">
                                            {isCompleted ? (
                                                <>
                                                    <span>📅 {result.date}</span>
                                                    <span>⏱️ {formatDuration(result.duration)}</span>
                                                    <span>🎤 Qualité: {result.quality}</span>
                                                </>
                                            ) : (
                                                <span>Test non encore réalisé</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                
                                {isCompleted ? (
                                    <div className="flex items-center gap-3 flex-wrap">
                                        <span className={`text-lg font-bold ${getScoreColor(result.score)}`}>
                                            {result.score}%
                                        </span>
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${diag.color}`}>
                                            {diag.label}
                                        </span>
                                        {result.confidence && (
                                            <span className="text-xs text-gray-400">
                                                🎯 {Math.round(result.confidence * 100)}%
                                            </span>
                                        )}
                                    </div>
                                ) : (
                                    <Link
                                        href={`/recording?test=${test.id}&patient=${patient.id}`}
                                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium"
                                    >
                                        ▶️ Commencer
                                    </Link>
                                )}
                            </div>
                        )
                    })}
                </div>

                {/* Boutons d'action */}
                <div className="mt-6 flex flex-col sm:flex-row gap-3">
                    <button
                        className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition"
                        onClick={() => alert('📄 Export PDF en cours...')}
                    >
                        📄 Exporter en PDF
                    </button>
                    <button
                        className="flex-1 px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition"
                        onClick={() => router.push(`/patient/${patient.id}`)}
                    >
                        ← Retour au patient
                    </button>
                </div>

                <div className="mt-8">
                    <EthicsBanner />
                </div>
            </main>
        </>
    )
}