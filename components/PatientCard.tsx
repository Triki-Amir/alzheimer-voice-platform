import type { Patient } from '@/types'

interface PatientCardProps {
    patient: Patient
    onSelect: (id: string) => void
}

export default function PatientCard({ patient, onSelect }: PatientCardProps) {
    return (
        <div
            className="flex items-center p-4 bg-white border border-gray-200 rounded-xl hover:border-blue-500 hover:shadow-md hover:-translate-y-0.5 cursor-pointer transition-all"
            onClick={() => onSelect(patient.id)}
        >
            <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold text-sm flex-shrink-0 mr-4"
                style={{ backgroundColor: patient.color }}
            >
                {patient.initials}
            </div>
            <div className="flex-1 min-w-0">
                <div className="font-semibold text-gray-900">{patient.name}</div>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm">
                    <span className="text-gray-500">ID: {patient.id}</span>
                    <span className="text-amber-500">⭐ {patient.age} ans</span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-gray-500">
                    <span>Né le {patient.birthDate}</span>
                    <span>Dernière session: {patient.lastSession}</span>
                </div>
            </div>
            <div className="text-2xl text-gray-400 hover:text-blue-600 hover:translate-x-1 transition ml-4">
                →
            </div>
        </div>
    )
}