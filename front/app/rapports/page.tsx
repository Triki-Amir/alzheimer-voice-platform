// app/rapports/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import Navbar from '@/components/Navbar'
import EthicsBanner from '@/components/EthicsBanner'
import { patientsApi } from '@/lib/api'
import { getToken } from '@/lib/auth'
import type { User, Patient } from '@/types'

// ==================== TYPES ====================
interface ReportSummary {
    patientId: string
    patientName: string
    patientInitials: string
    patientColor: string
    date: string
    diagnosis: 'control' | 'mci' | 'ad'
    confidence: number
    testsCompleted: number
    totalTests: number
}

const getDiagnosisLabel = (diagnosis: string) => {
    switch (diagnosis) {
        case 'control': return { label: '✅ Normal', color: 'text-green-600 bg-green-50' }
        case 'mci': return { label: '⚠️ MCI (Léger)', color: 'text-amber-600 bg-amber-50' }
        case 'ad': return { label: '🔴 Alzheimer', color: 'text-red-600 bg-red-50' }
        default: return { label: 'Non évalué', color: 'text-gray-500 bg-gray-50' }
    }
}

export default function RapportsPage() {
    const router = useRouter()
    const [user, setUser] = useState<User | null>(null)
    const [patients, setPatients] = useState<Patient[]>([])
    const [reports, setReports] = useState<ReportSummary[]>([])
    const [searchTerm, setSearchTerm] = useState('')
    const [filteredReports, setFilteredReports] = useState<ReportSummary[]>([])
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        const token = getToken()
        if (!token) {
            router.push('/')
            return
        }

        const userData = localStorage.getItem('user')
        if (userData) {
            setUser(JSON.parse(userData))
        }

        loadPatients()
    }, [router])

    const loadPatients = async () => {
        setIsLoading(true)
        const result = await patientsApi.getAll()
        if (result.success && result.data) {
            const normalizedPatients: Patient[] = result.data.map((patient) => {
                const normalizedGender: Patient['gender'] =
                    patient.gender === 'Homme' || patient.gender === 'Femme'
                        ? patient.gender
                        : undefined

                return {
                    ...patient,
                    id: String(patient.id ?? ''),
                    gender: normalizedGender
                }
            })
            setPatients(normalizedPatients)
            // Transformer les patients en rapports (simulé)
            const reportsData: ReportSummary[] = normalizedPatients.map((patient) => ({
                patientId: String(patient.id ?? ''),
                patientName: patient.name,
                patientInitials: patient.initials,
                patientColor: patient.color,
                date: patient.lastSession || new Date().toLocaleDateString('fr-FR'),
                diagnosis: getRandomDiagnosis(),
                confidence: Math.round((0.7 + Math.random() * 0.25) * 100) / 100,
                testsCompleted: Math.floor(Math.random() * 8),
                totalTests: 8
            }))
            setReports(reportsData)
            setFilteredReports(reportsData)
        } else {
            console.error('Erreur chargement patients:', result.error)
        }
        setIsLoading(false)
    }

    // Fonction pour générer un diagnostic aléatoire (simulation)
    const getRandomDiagnosis = (): 'control' | 'mci' | 'ad' => {
        const diagnoses: ('control' | 'mci' | 'ad')[] = ['control', 'control', 'mci', 'mci', 'ad']
        return diagnoses[Math.floor(Math.random() * diagnoses.length)]
    }

    useEffect(() => {
        const filtered = reports.filter(r =>
            r.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            r.patientId.toLowerCase().includes(searchTerm.toLowerCase())
        )
        setFilteredReports(filtered)
    }, [searchTerm, reports])

    const handleViewReport = (patientId: string) => {
        router.push(`/rapport/${patientId}`)
    }

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-4 text-gray-500">Chargement...</p>
                </div>
            </div>
        )
    }

    if (!user) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-4 text-gray-500">Redirection...</p>
                </div>
            </div>
        )
    }

    return (
        <>
            <Header user={user} />
            <Navbar active="reports" />
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                
                {/* En-tête */}
                <div className="mb-6">
                    <h1 className="text-2xl font-bold text-gray-900">📊 Rapports</h1>
                    <p className="text-gray-500 text-sm">
                        Consultez les rapports des patients
                    </p>
                </div>

                {/* Barre de recherche */}
                <div className="mb-6">
                    <div className="flex gap-3">
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="flex-1 h-12 px-4 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none bg-white"
                            placeholder="🔍 Rechercher un patient par nom ou ID..."
                        />
                        <button
                            onClick={() => setSearchTerm('')}
                            className="px-4 py-2 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition text-sm font-medium"
                        >
                            ✕ Effacer
                        </button>
                    </div>
                </div>

                {/* Rapports récents */}
                <section>
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-lg font-semibold text-gray-900">
                            📋 Rapports récents
                            {filteredReports.length > 0 && (
                                <span className="text-sm font-normal text-gray-500 ml-2">
                                    ({filteredReports.length} patients)
                                </span>
                            )}
                        </h2>
                        <span className="text-sm text-gray-400">
                            Derniers rapports
                        </span>
                    </div>

                    {filteredReports.length === 0 ? (
                        <div className="text-center py-12 bg-white rounded-xl border-2 border-dashed border-gray-300">
                            <span className="text-6xl block mb-4">📭</span>
                            <h3 className="text-xl font-semibold text-gray-700">Aucun rapport trouvé</h3>
                            <p className="text-gray-500 text-sm mt-2">
                                {searchTerm 
                                    ? 'Aucun patient ne correspond à votre recherche.'
                                    : 'Aucun rapport disponible pour le moment. Commencez par effectuer des tests.'
                                }
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {filteredReports.map((report) => {
                                const diagnosis = getDiagnosisLabel(report.diagnosis)
                                const progress = Math.round((report.testsCompleted / report.totalTests) * 100)
                                
                                return (
                                    <div
                                        key={report.patientId}
                                        onClick={() => handleViewReport(report.patientId)}
                                        className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-md hover:border-blue-300 cursor-pointer transition"
                                    >
                                        {/* En-tête */}
                                        <div className="flex items-center gap-3 mb-4">
                                            <div
                                                className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-base flex-shrink-0"
                                                style={{ backgroundColor: report.patientColor }}
                                            >
                                                {report.patientInitials}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h3 className="font-semibold text-gray-900 truncate">
                                                    {report.patientName}
                                                </h3>
                                                <p className="text-sm text-gray-500 truncate">
                                                    ID: {report.patientId}
                                                </p>
                                            </div>
                                            <div className="text-2xl text-gray-300 hover:text-blue-500 transition">
                                                →
                                            </div>
                                        </div>

                                        {/* Métriques */}
                                        <div className="grid grid-cols-2 gap-3 mb-3">
                                            <div className="bg-gray-50 rounded-lg p-2 text-center">
                                                <p className="text-xs text-gray-500">Date</p>
                                                <p className="text-sm font-medium text-gray-700">{report.date}</p>
                                            </div>
                                            <div className="bg-gray-50 rounded-lg p-2 text-center">
                                                <p className="text-xs text-gray-500">Progression</p>
                                                <p className="text-sm font-medium text-gray-700">
                                                    {report.testsCompleted}/{report.totalTests}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Barre de progression */}
                                        <div className="mb-3">
                                            <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-blue-500 rounded-full transition-all duration-500"
                                                    style={{ width: `${progress}%` }}
                                                />
                                            </div>
                                            <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                                                <span>Tests complétés</span>
                                                <span>{progress}%</span>
                                            </div>
                                        </div>

                                        {/* Diagnostic */}
                                        <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${diagnosis.color}`}>
                                                {diagnosis.label}
                                            </span>
                                            
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </section>

                <div className="mt-8">
                    <EthicsBanner />
                </div>
            </main>
        </>
    )
}