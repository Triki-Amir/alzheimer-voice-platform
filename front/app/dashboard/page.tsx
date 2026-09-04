// app/dashboard/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import Navbar from '@/components/Navbar'
import PatientCard from '@/components/PatientCard'
import SearchBar from '@/components/SearchBar'
import EthicsBanner from '@/components/EthicsBanner'
import PatientForm from '@/components/PatientForm'
import { patientsApi } from '@/lib/api'
import { getUser} from '@/lib/auth'
import type { Patient, User, PatientFormData } from '@/types'
import { verifySession } from '@/lib/auth'
// ==================== TYPES ====================
interface DashboardStats {
    totalPatients: number
    highRisk: number
    moderateRisk: number
    pendingTest: number
}

interface Appointment {
    id: string
    patientId: string
    patientName: string
    date: string
    time: string
    type: 'consultation' | 'test' | 'follow-up'
}

// ==================== COMPOSANT APERÇU CALENDRIER ====================
const CalendarPreview = ({ appointments }: { appointments: Appointment[] }) => {
    const weekDays = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
    const today = new Date()
    const currentDay = today.getDay()
    const startOfWeek = new Date(today)
    startOfWeek.setDate(today.getDate() - currentDay + 1)

    const getDayAppointments = (dayOffset: number) => {
        const date = new Date(startOfWeek)
        date.setDate(startOfWeek.getDate() + dayOffset)
        const dateStr = date.toISOString().split('T')[0]
        return appointments.filter(a => a.date === dateStr)
    }

    const getTypeColor = (type: string) => {
        switch (type) {
            case 'consultation': return 'bg-blue-100 text-blue-700 border-blue-200'
            case 'test': return 'bg-purple-100 text-purple-700 border-purple-200'
            case 'follow-up': return 'bg-green-100 text-green-700 border-green-200'
            default: return 'bg-gray-100 text-gray-700 border-gray-200'
        }
    }

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'consultation': return '💬'
            case 'test': return '🧪'
            case 'follow-up': return '📋'
            default: return '📅'
        }
    }

    return (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">📅 Rendez-vous de la semaine</h3>
                <Link
                    href="/calendar"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium flex items-center gap-2"
                >
                    📅 Voir le calendrier
                </Link>
            </div>

            <div className="grid grid-cols-7 gap-2">
                {weekDays.map((day, index) => {
                    const dayAppointments = getDayAppointments(index)
                    const isToday = index === currentDay - 1
                    return (
                        <div key={index} className="text-center">
                            <div className={`text-xs font-medium ${isToday ? 'text-blue-600' : 'text-gray-500'} mb-1`}>
                                {day}
                            </div>
                            <div className={`text-sm font-bold ${isToday ? 'text-blue-600' : 'text-gray-700'}`}>
                                {new Date(startOfWeek).getDate() + index}
                            </div>
                            <div className="mt-1 space-y-1">
                                {dayAppointments.slice(0, 2).map((apt) => (
                                    <div
                                        key={apt.id}
                                        className={`text-[10px] px-1 py-0.5 rounded border ${getTypeColor(apt.type)} truncate`}
                                        title={`${apt.patientName} - ${apt.time} - ${apt.type}`}
                                    >
                                        {apt.time}
                                    </div>
                                ))}
                                {dayAppointments.length > 2 && (
                                    <div className="text-[10px] text-blue-500 font-medium">
                                        +{dayAppointments.length - 2}
                                    </div>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>

            <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-gray-100">
                <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-blue-500"></span>
                    <span className="text-xs text-gray-500">Consultation</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-purple-500"></span>
                    <span className="text-xs text-gray-500">Test</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-green-500"></span>
                    <span className="text-xs text-gray-500">Suivi</span>
                </div>
            </div>

            <div className="mt-4 text-center">
                <Link href="/calendar" className="text-blue-600 hover:underline text-sm font-medium">
                    Voir tous les rendez-vous →
                </Link>
            </div>
        </div>
    )
}

// ==================== PAGE PRINCIPALE ====================
export default function DashboardPage() {
    const router = useRouter()
    const [searchTerm, setSearchTerm] = useState('')
    const [patients, setPatients] = useState<Patient[]>([])
    const [filteredPatients, setFilteredPatients] = useState<Patient[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [user, setUser] = useState<User | null>(null)
    const [isFormOpen, setIsFormOpen] = useState(false)
    const [stats, setStats] = useState<DashboardStats>({
        totalPatients: 0,
        highRisk: 0,
        moderateRisk: 0,
        pendingTest: 0
    })
    const [activeFilter, setActiveFilter] = useState<'all' | 'highRisk' | 'moderateRisk' | 'pendingTest'>('all')

    // États pour les rendez-vous (mockés pour l'aperçu)
    const [appointments] = useState<Appointment[]>([
        { id: '1', patientId: 'PAT_000123', patientName: 'Slim Selmi', date: '2026-08-07', time: '09:30', type: 'consultation' },
        { id: '2', patientId: 'PAT_000124', patientName: 'Khalil Hedili', date: '2026-08-07', time: '11:00', type: 'test' },
        { id: '3', patientId: 'PAT_000125', patientName: 'Amir Triki', date: '2026-08-08', time: '14:30', type: 'follow-up' },
        { id: '4', patientId: 'PAT_000126', patientName: 'Nadia Ayari', date: '2026-08-09', time: '10:00', type: 'consultation' },
        { id: '5', patientId: 'PAT_000127', patientName: 'Ahmed Aouadi', date: '2026-08-10', time: '15:00', type: 'test' },
    ])

    // ✅ Vérifier l'authentification via le cookie
    useEffect(() => {
        const loadData = async () => {
            try {
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
                await loadPatients()
            } catch (error) {
                console.error('❌ Erreur:', error)
                router.push('/')
            }
        }

        loadData()
    }, [router])

    const loadPatients = async () => {
        setIsLoading(true)
        const result = await patientsApi.getAll()
        if (result.success && result.data) {
            const normalizedPatients: Patient[] = result.data.map((patient) => {
                const normalizedGender: Patient['gender'] = patient.gender === 'Homme' || patient.gender === 'Femme'
                    ? patient.gender
                    : undefined

                return {
                    ...patient,
                    id: String(patient.id),
                    name: patient.name || `${patient.initials || ''}`.trim(),
                    initials: patient.initials || (patient.name || '').split(' ').map(part => part[0]?.toUpperCase() || '').join('').slice(0, 2),
                    age: Number(patient.age) || 0,
                    birthDate: patient.birthDate || '',
                    dmiId: patient.dmiId || '',
                    gender: normalizedGender,
                    lastSession: patient.lastSession || '',
                    color: patient.color || '#2563EB',
                }
            })

            setPatients(normalizedPatients)
            setStats(calculateStats(normalizedPatients))
        } else {
            console.error('Erreur chargement patients:', result.error)
        }
        setIsLoading(false)
    }

    // Filtrer les patients
    useEffect(() => {
        let filtered = patients

        if (activeFilter === 'highRisk') {
            filtered = filtered.filter(p => p.age > 75)
        } else if (activeFilter === 'moderateRisk') {
            filtered = filtered.filter(p => p.age > 65 && p.age <= 75)
        } else if (activeFilter === 'pendingTest') {
            filtered = filtered.filter(p => !p.lastSession || p.lastSession < '2026-07-01')
        }

        if (searchTerm) {
            filtered = filtered.filter(p =>
                p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                p.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                p.phone?.includes(searchTerm) ||
                p.dmiId?.includes(searchTerm)
            )
        }

        setFilteredPatients(filtered)
    }, [searchTerm, patients, activeFilter])

    const handleSelectPatient = (patientId: string) => {
        router.push(`/patient/${patientId}`)
    }

    const handleAddPatient = async (formData: PatientFormData) => {
        const newPatient = {
            first_name: formData.firstName,
            last_name: formData.lastName,
            date_of_birth: formData.birthDate,
            external_ref: formData.dmiId,
        }

        const result = await patientsApi.create(newPatient)
        if (result.success && result.data) {
            const normalizedNewPatient: Patient = {
                ...result.data,
                id: String(result.data.id),
                name: result.data.name || `${formData.firstName} ${formData.lastName}`.trim() || 'Nouveau patient',
                initials: result.data.initials || `${formData.firstName?.charAt(0)?.toUpperCase() || ''}${formData.lastName?.charAt(0)?.toUpperCase() || ''}`,
                age: Number(result.data.age) || 0,
                birthDate: result.data.birthDate || formData.birthDate,
                dmiId: result.data.dmiId || formData.dmiId || '',
                gender: result.data.gender === 'Homme' || result.data.gender === 'Femme'
                    ? result.data.gender
                    : undefined,
                lastSession: result.data.lastSession || '',
                color: result.data.color || '#2563EB',
            }

            const nextPatients = [normalizedNewPatient, ...patients]
            setPatients(nextPatients)
            setStats(calculateStats(nextPatients))
            alert(`✅ Patient ${normalizedNewPatient.name} ajouté avec succès !`)
            setIsFormOpen(false)
        } else {
            alert(`❌ Erreur: ${result.error || 'Impossible d\'ajouter le patient'}`)
        }
    }

    const calculateStats = (patients: Patient[]): DashboardStats => {
        return {
            totalPatients: patients.length,
            highRisk: patients.filter(p => p.age > 75).length,
            moderateRisk: patients.filter(p => p.age > 65 && p.age <= 75).length,
            pendingTest: patients.filter(p => !p.lastSession || p.lastSession < '2026-07-01').length
        }
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

    const statCards = [
        {
            label: 'Total Patients',
            value: stats.totalPatients,
            icon: '👥',
            color: 'bg-blue-500',
            textColor: 'text-blue-600',
            bgColor: 'bg-blue-50',
            filter: 'all' as const,
            description: 'Tous les patients'
        },
        {
            label: 'High Risk',
            value: stats.highRisk,
            icon: '🔴',
            color: 'bg-red-500',
            textColor: 'text-red-600',
            bgColor: 'bg-red-50',
            filter: 'highRisk' as const,
            description: 'Patients à haut risque'
        },
        {
            label: 'Moderate Risk',
            value: stats.moderateRisk,
            icon: '🟡',
            color: 'bg-amber-500',
            textColor: 'text-amber-600',
            bgColor: 'bg-amber-50',
            filter: 'moderateRisk' as const,
            description: 'Patients à risque modéré'
        },
        {
            label: 'Pending Test',
            value: stats.pendingTest,
            icon: '⏳',
            color: 'bg-purple-500',
            textColor: 'text-purple-600',
            bgColor: 'bg-purple-50',
            filter: 'pendingTest' as const,
            description: 'Tests en attente'
        }
    ]

    return (
        <>
            <Header user={user} />
            <Navbar active="dashboard" />
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                
                {/* Statistiques cliquables */}
                <section className="mb-8">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {statCards.map((stat, index) => (
                            <button
                                key={index}
                                onClick={() => setActiveFilter(stat.filter)}
                                className={`${stat.bgColor} rounded-2xl p-6 shadow-sm hover:shadow-md transition text-left w-full ${
                                    activeFilter === stat.filter ? 'ring-2 ring-blue-500 ring-offset-2' : ''
                                }`}
                            >
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-medium text-gray-500">{stat.label}</p>
                                        <p className={`text-3xl font-bold ${stat.textColor} mt-1`}>
                                            {stat.value}
                                        </p>
                                        <p className="text-xs text-gray-400 mt-1">{stat.description}</p>
                                    </div>
                                    <div className={`${stat.color} w-12 h-12 rounded-full flex items-center justify-center text-2xl flex-shrink-0`}>
                                        {stat.icon}
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>

                    {activeFilter !== 'all' && (
                        <div className="mt-3 flex items-center gap-3">
                            <span className="text-sm text-gray-500">Filtre actif :</span>
                            <span className="text-sm font-medium text-blue-600">
                                {statCards.find(s => s.filter === activeFilter)?.label}
                            </span>
                            <button
                                onClick={() => setActiveFilter('all')}
                                className="text-sm text-gray-400 hover:text-gray-600 underline"
                            >
                                Réinitialiser
                            </button>
                        </div>
                    )}
                </section>

                {/* Recherche */}
                <section className="mb-6">
                    <SearchBar
                        value={searchTerm}
                        onChange={setSearchTerm}
                        placeholder="🔍 Rechercher un patient (nom, ID, téléphone, DMI_ID...)"
                    />
                </section>

                {/* Liste des patients filtrée */}
                <section className="mb-8">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                        <h3 className="text-lg font-semibold text-gray-900">
                            👥 Patients 
                            {activeFilter !== 'all' && (
                                <span className="text-sm font-normal text-gray-500 ml-2">
                                    ({filteredPatients.length} résultats)
                                </span>
                            )}
                        </h3>
                        <button
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium"
                            onClick={() => setIsFormOpen(true)}
                        >
                            ➕ Nouveau patient
                        </button>
                    </div>

                    <div className="space-y-3">
                        {filteredPatients.length === 0 ? (
                            <div className="text-center py-12 bg-white rounded-xl border-2 border-dashed border-gray-300">
                                <span className="text-6xl block mb-4">📭</span>
                                <h3 className="text-xl font-semibold text-gray-700">
                                    {activeFilter !== 'all' ? 'Aucun patient dans cette catégorie' : 'Aucun patient'}
                                </h3>
                                <p className="text-gray-500 text-sm mt-2">
                                    {activeFilter !== 'all' 
                                        ? 'Aucun patient ne correspond à ce filtre.'
                                        : 'Commencez par créer une fiche patient.'
                                    }
                                </p>
                                {activeFilter !== 'all' && (
                                    <button
                                        onClick={() => setActiveFilter('all')}
                                        className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium"
                                    >
                                        Voir tous les patients
                                    </button>
                                )}
                                {activeFilter === 'all' && (
                                    <button
                                        onClick={() => setIsFormOpen(true)}
                                        className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium"
                                    >
                                        ➕ Créer un patient
                                    </button>
                                )}
                            </div>
                        ) : (
                            filteredPatients.slice(0, 10).map((patient) => (
                                <PatientCard
                                    key={patient.id}
                                    patient={patient}
                                    onSelect={handleSelectPatient}
                                />
                            ))
                        )}

                        {filteredPatients.length > 0 && (
                            <Link href="/patients">
                                <div className="flex items-center justify-center p-4 border-2 border-dashed border-gray-300 rounded-xl hover:border-blue-500 hover:bg-blue-50 cursor-pointer transition">
                                    <div className="text-center">
                                        <span className="text-2xl block text-blue-600">📋</span>
                                        <span className="text-blue-600 font-medium">Voir tous les patients</span>
                                        <span className="text-gray-400 block text-sm">
                                            {patients.length} patients au total ▼
                                        </span>
                                    </div>
                                </div>
                            </Link>
                        )}
                    </div>
                </section>

                {/* Aperçu Calendrier */}
                <section className="mb-8">
                    <CalendarPreview appointments={appointments} />
                </section>

                <EthicsBanner />
            </main>

            <PatientForm
                isOpen={isFormOpen}
                onClose={() => setIsFormOpen(false)}
                onSave={handleAddPatient}
            />
        </>
    )
}