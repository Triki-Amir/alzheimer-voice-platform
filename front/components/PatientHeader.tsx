import type { Patient } from '@/types'

interface PatientHeaderProps {
    patient: Patient
    onBack?: () => void
}

export default function PatientHeader({ patient, onBack }: PatientHeaderProps) {
    const getAge = (birthDate: string) => {
        const birth = new Date(birthDate)
        const today = new Date()
        return today.getFullYear() - birth.getFullYear()
    }

    return (
        <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                {/* Avatar */}
                <div
                    className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-xl flex-shrink-0"
                    style={{ backgroundColor: patient.color }}
                >
                    {patient.initials}
                </div>

                {/* Info Patient */}
                <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                        <h2 className="text-xl font-bold text-gray-900">{patient.name}</h2>
                        <span className="text-sm text-gray-500">ID: {patient.id}</span>
                        <span className="text-sm text-amber-500">⭐ {getAge(patient.birthDate)} ans</span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
                        <span>Né le {patient.birthDate}</span>
                        {patient.phone && <span>📞 {patient.phone}</span>}
                        {patient.gender && <span>⚥ {patient.gender}</span>}
                    </div>
                </div>

                {/* Bouton Retour */}
                {onBack && (
                    <button
                        onClick={onBack}
                        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition text-sm font-medium"
                    >
                        ← Retour
                    </button>
                )}
            </div>
        </div>
    )
}