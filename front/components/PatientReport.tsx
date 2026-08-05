import type { PatientReport } from '@/types'

interface PatientReportProps {
    report: PatientReport
}

export default function PatientReport({ report }: PatientReportProps) {
    const getDiagnosisLabel = (diagnosis?: string) => {
        switch (diagnosis) {
            case 'control': return { label: '✅ Normal', color: 'text-green-600 bg-green-50' }
            case 'mci': return { label: '⚠️ MCI (Léger)', color: 'text-amber-600 bg-amber-50' }
            case 'ad': return { label: '🔴 Alzheimer', color: 'text-red-600 bg-red-50' }
            default: return { label: 'Non évalué', color: 'text-gray-500 bg-gray-50' }
        }
    }

    const getScoreColor = (score: number) => {
        if (score >= 80) return 'text-green-600'
        if (score >= 60) return 'text-amber-500'
        return 'text-red-500'
    }

    const diagnosisInfo = getDiagnosisLabel(report.diagnosis)
    const completed = report.completedTests
    const total = report.totalTests
    const progress = total > 0 ? (completed / total) * 100 : 0

    return (
        <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6 shadow-sm">
            <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">
                📊 Rapport du patient
            </h3>

            {/* Score global */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <div className={`text-2xl font-bold ${getScoreColor(report.overallScore || 0)}`}>
                        {report.overallScore || '—'}%
                    </div>
                    <div className="text-xs text-gray-500">Score global</div>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">{completed}/{total}</div>
                    <div className="text-xs text-gray-500">Tests complétés</div>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <div className={`text-2xl font-bold ${diagnosisInfo.color.split(' ')[0]}`}>
                        {report.diagnosis ? diagnosisInfo.label : '—'}
                    </div>
                    <div className="text-xs text-gray-500">Diagnostic</div>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <div className="text-2xl font-bold text-purple-600">
                        {report.confidence ? `${Math.round(report.confidence * 100)}%` : '—'}
                    </div>
                    <div className="text-xs text-gray-500">Confiance</div>
                </div>
            </div>

            {/* Barre de progression */}
            <div className="mb-4">
                <div className="flex justify-between text-sm text-gray-600 mb-1">
                    <span>Progression des tests</span>
                    <span>{Math.round(progress)}%</span>
                </div>
                <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-blue-600 rounded-full transition-all duration-500"
                        style={{ width: `${progress}%` }}
                    />
                </div>
            </div>

            {/* Liste des tests */}
            <div className="space-y-2">
                <h4 className="text-sm font-medium text-gray-700">Derniers résultats</h4>
                {report.tests.map((test) => {
                    const diag = getDiagnosisLabel(test.diagnosis)
                    return (
                        <div key={test.testId} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <div className="flex items-center gap-3">
                                <span className="text-sm font-medium text-gray-900">{test.testName}</span>
                                <span className="text-xs text-gray-500">{test.date}</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className={`text-sm font-semibold ${getScoreColor(test.score)}`}>
                                    {test.score}%
                                </span>
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${diag.color}`}>
                                    {diag.label}
                                </span>
                                <span className="text-xs text-gray-400">{test.duration}s</span>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}