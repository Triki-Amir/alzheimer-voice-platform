// app/calendar/page.tsx
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

interface Appointment {
    id: string
    patientId: string
    patientName: string
    date: string
    time: string
    type: 'consultation' | 'test' | 'follow-up'
    notes?: string
}

interface CalendarDay {
    date: Date
    isCurrentMonth: boolean
    appointments: Appointment[]
}

export default function CalendarPage() {
    const router = useRouter()
    const [user, setUser] = useState<User | null>(null)
    const [patients, setPatients] = useState<Patient[]>([])
    const [currentDate, setCurrentDate] = useState(new Date())
    const [appointments, setAppointments] = useState<Appointment[]>([
        { id: '1', patientId: 'PAT_000123', patientName: 'Slim Selmi', date: '2026-08-07', time: '09:30', type: 'consultation' },
        { id: '2', patientId: 'PAT_000124', patientName: 'Khalil Hedili', date: '2026-08-07', time: '11:00', type: 'test' },
        { id: '3', patientId: 'PAT_000125', patientName: 'Amir Triki', date: '2026-08-08', time: '14:30', type: 'follow-up' },
        { id: '4', patientId: 'PAT_000126', patientName: 'Nadia Ayari', date: '2026-08-09', time: '10:00', type: 'consultation' },
        { id: '5', patientId: 'PAT_000127', patientName: 'Ahmed Aouadi', date: '2026-08-10', time: '15:00', type: 'test' },
        { id: '6', patientId: 'PAT_000128', patientName: 'Sarra Ben Salem', date: '2026-08-12', time: '08:30', type: 'consultation' },
        { id: '7', patientId: 'PAT_000129', patientName: 'Mohamed Ali', date: '2026-08-15', time: '13:00', type: 'test' },
    ])
    const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [isLoading, setIsLoading] = useState(true)
    const [viewMode, setViewMode] = useState<'month' | 'week'>('month')

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

                const result = await patientsApi.getAll()
                if (result.success && result.data) {
                    setPatients(result.data)
                }

                setIsLoading(false)
            } catch (error) {
                console.error('❌ Erreur:', error)
                router.push('/')
            }
        }

        loadData()
    }, [router])

    const getDaysInMonth = (year: number, month: number): CalendarDay[] => {
        const firstDay = new Date(year, month, 1)
        const lastDay = new Date(year, month + 1, 0)
        const days: CalendarDay[] = []
        
        // Jours du mois précédent
        const firstDayOfWeek = firstDay.getDay()
        const prevMonthLastDay = new Date(year, month, 0).getDate()
        for (let i = firstDayOfWeek - 1; i >= 0; i--) {
            const date = new Date(year, month - 1, prevMonthLastDay - i)
            days.push({ date, isCurrentMonth: false, appointments: [] })
        }

        // Jours du mois courant
        for (let i = 1; i <= lastDay.getDate(); i++) {
            const date = new Date(year, month, i)
            const dayAppointments = appointments.filter(a => a.date === date.toISOString().split('T')[0])
            days.push({ date, isCurrentMonth: true, appointments: dayAppointments })
        }

        // Jours du mois suivant
        const remainingDays = 42 - days.length // 6 lignes de 7 jours
        for (let i = 1; i <= remainingDays; i++) {
            const date = new Date(year, month + 1, i)
            days.push({ date, isCurrentMonth: false, appointments: [] })
        }

        return days
    }

    const getTypeColor = (type: string) => {
        switch (type) {
            case 'consultation': return 'bg-blue-500'
            case 'test': return 'bg-purple-500'
            case 'follow-up': return 'bg-green-500'
            default: return 'bg-gray-500'
        }
    }

    const getTypeBg = (type: string) => {
        switch (type) {
            case 'consultation': return 'bg-blue-50 border-blue-200 text-blue-700'
            case 'test': return 'bg-purple-50 border-purple-200 text-purple-700'
            case 'follow-up': return 'bg-green-50 border-green-200 text-green-700'
            default: return 'bg-gray-50 border-gray-200 text-gray-700'
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

    const handlePrevMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))
    }

    const handleNextMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))
    }

    const handleToday = () => {
        setCurrentDate(new Date())
    }

    const handleAppointmentClick = (appointment: Appointment) => {
        setSelectedAppointment(appointment)
        setIsModalOpen(true)
    }

    const handleAddAppointment = () => {
        setSelectedAppointment(null)
        setIsModalOpen(true)
    }

    const handleSaveAppointment = (data: any) => {
        if (selectedAppointment) {
            setAppointments(appointments.map(a => 
                a.id === selectedAppointment.id ? { ...a, ...data } : a
            ))
        } else {
            const newAppointment: Appointment = {
                id: `apt_${Date.now()}`,
                ...data
            }
            setAppointments([...appointments, newAppointment])
        }
        setIsModalOpen(false)
        setSelectedAppointment(null)
    }

    const handleDeleteAppointment = (id: string) => {
        if (confirm('Voulez-vous vraiment supprimer ce rendez-vous ?')) {
            setAppointments(appointments.filter(a => a.id !== id))
            setIsModalOpen(false)
            setSelectedAppointment(null)
        }
    }

    const monthDays = getDaysInMonth(currentDate.getFullYear(), currentDate.getMonth())
    const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

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

    return (
        <>
            <Header user={user} />
            <Navbar active="calendar" />
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                
                {/* En-tête */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">📅 Calendrier des rendez-vous</h1>
                        <p className="text-gray-500 text-sm">
                            {appointments.length} rendez-vous au total
                        </p>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                        <button
                            onClick={handleAddAppointment}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium flex items-center gap-2"
                        >
                            ➕ Nouveau rendez-vous
                        </button>
                        <Link
                            href="/dashboard"
                            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition text-sm font-medium"
                        >
                            ← Retour
                        </Link>
                    </div>
                </div>

                {/* Navigation du calendrier */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={handlePrevMonth}
                            className="p-2 hover:bg-gray-100 rounded-lg transition"
                        >
                            ◀
                        </button>
                        <h2 className="text-xl font-semibold text-gray-900">
                            {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
                        </h2>
                        <button
                            onClick={handleNextMonth}
                            className="p-2 hover:bg-gray-100 rounded-lg transition"
                        >
                            ▶
                        </button>
                    </div>
                    <button
                        onClick={handleToday}
                        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition text-sm font-medium"
                    >
                        Aujourd'hui
                    </button>
                </div>

                {/* Grille du calendrier */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                    {/* Jours de la semaine */}
                    <div className="grid grid-cols-7 gap-px bg-gray-200">
                        {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((day, index) => (
                            <div key={index} className="bg-gray-50 p-3 text-center text-sm font-semibold text-gray-600">
                                {day}
                            </div>
                        ))}
                    </div>

                    {/* Jours du mois */}
                    <div className="grid grid-cols-7 gap-px bg-gray-200">
                        {monthDays.map((day, index) => {
                            const isToday = day.date.toDateString() === new Date().toDateString()
                            const hasAppointments = day.appointments.length > 0

                            return (
                                <div
                                    key={index}
                                    className={`bg-white p-2 min-h-[100px] ${
                                        !day.isCurrentMonth ? 'bg-gray-50' : ''
                                    }`}
                                >
                                    <div className={`text-sm font-medium ${
                                        !day.isCurrentMonth ? 'text-gray-400' :
                                        isToday ? 'text-blue-600' : 'text-gray-700'
                                    }`}>
                                        {day.date.getDate()}
                                        {isToday && (
                                            <span className="ml-1 inline-block w-2 h-2 bg-blue-600 rounded-full"></span>
                                        )}
                                    </div>
                                    <div className="mt-1 space-y-1">
                                        {day.appointments.slice(0, 3).map((appointment) => (
                                            <button
                                                key={appointment.id}
                                                onClick={() => handleAppointmentClick(appointment)}
                                                className={`w-full text-[10px] px-1.5 py-0.5 rounded text-left truncate ${getTypeBg(appointment.type)} border hover:opacity-80 transition cursor-pointer`}
                                                title={`${appointment.patientName} - ${appointment.time}`}
                                            >
                                                {appointment.time} {getTypeIcon(appointment.type)}
                                            </button>
                                        ))}
                                        {day.appointments.length > 3 && (
                                            <div className="text-[10px] text-blue-500 font-medium">
                                                +{day.appointments.length - 3} autres
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* Légende */}
                <div className="mt-4 flex flex-wrap gap-4">
                    <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-blue-500"></span>
                        <span className="text-sm text-gray-600">Consultation</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-purple-500"></span>
                        <span className="text-sm text-gray-600">Test</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-green-500"></span>
                        <span className="text-sm text-gray-600">Suivi</span>
                    </div>
                </div>

                <div className="mt-6">
                    <EthicsBanner />
                </div>
            </main>

            {/* Modal de rendez-vous */}
            <AppointmentModal
                isOpen={isModalOpen}
                onClose={() => {
                    setIsModalOpen(false)
                    setSelectedAppointment(null)
                }}
                onSave={handleSaveAppointment}
                onDelete={handleDeleteAppointment}
                appointment={selectedAppointment}
                patients={patients}
            />
        </>
    )
}

// ==================== MODAL DE RENDEZ-VOUS ====================
const AppointmentModal = ({ 
    isOpen, 
    onClose, 
    onSave,
    onDelete,
    appointment,
    patients 
}: {
    isOpen: boolean
    onClose: () => void
    onSave: (data: any) => void
    onDelete: (id: string) => void
    appointment: Appointment | null
    patients: Patient[]
}) => {
    const [formData, setFormData] = useState({
        patientId: '',
        date: '',
        time: '',
        type: 'consultation' as 'consultation' | 'test' | 'follow-up',
        notes: ''
    })

    useEffect(() => {
        if (appointment) {
            setFormData({
                patientId: appointment.patientId,
                date: appointment.date,
                time: appointment.time,
                type: appointment.type,
                notes: appointment.notes || ''
            })
        } else {
            const today = new Date()
            setFormData({
                patientId: '',
                date: today.toISOString().split('T')[0],
                time: '09:00',
                type: 'consultation',
                notes: ''
            })
        }
    }, [appointment])

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        const patient = patients.find(p => p.id === formData.patientId)
        onSave({
            ...formData,
            patientName: patient?.name || 'Patient inconnu'
        })
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-gray-900">
                        {appointment ? '✏️ Modifier le rendez-vous' : '➕ Nouveau rendez-vous'}
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">
                        ✕
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Patient <span className="text-red-500">*</span>
                        </label>
                        <select
                            value={formData.patientId}
                            onChange={(e) => setFormData({ ...formData, patientId: e.target.value })}
                            className="w-full h-12 px-4 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
                            required
                        >
                            <option value="">Sélectionnez un patient</option>
                            {patients.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.name} ({p.id})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Date <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="date"
                            value={formData.date}
                            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                            className="w-full h-12 px-4 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Heure <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="time"
                            value={formData.time}
                            onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                            className="w-full h-12 px-4 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Type <span className="text-red-500">*</span>
                        </label>
                        <select
                            value={formData.type}
                            onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                            className="w-full h-12 px-4 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
                            required
                        >
                            <option value="consultation">💬 Consultation</option>
                            <option value="test">🧪 Test</option>
                            <option value="follow-up">📋 Suivi</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Notes
                        </label>
                        <textarea
                            value={formData.notes}
                            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
                            rows={3}
                            placeholder="Notes supplémentaires..."
                        />
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button
                            type="submit"
                            className="flex-1 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition"
                        >
                            {appointment ? '💾 Mettre à jour' : '➕ Ajouter'}
                        </button>
                        {appointment && (
                            <button
                                type="button"
                                onClick={() => onDelete(appointment.id)}
                                className="px-6 py-3 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 transition"
                            >
                                🗑️ Supprimer
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-6 py-3 bg-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-300 transition"
                        >
                            Annuler
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}