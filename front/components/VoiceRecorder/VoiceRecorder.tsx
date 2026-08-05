'use client'

import { useRef } from 'react'
import { useVoiceRecorder } from './useVoiceRecorder'
import { VoiceVisualizer } from './VoiceVisualiser'
import type { VoiceRecorderOptions } from './types'

interface VoiceRecorderProps extends VoiceRecorderOptions {
    className?: string
    showVisualizer?: boolean
    showMetrics?: boolean
}

export function VoiceRecorder({ 
    className = '',
    showVisualizer = true,
    showMetrics = true,
    onMetricsUpdate,
    onRecordingStart,
    onRecordingStop,
    onSilenceDetected,
    silenceThreshold = 0.02,
    silenceTimeout = 3
}: VoiceRecorderProps) {
    const visualizerRef = useRef<HTMLCanvasElement>(null)
    
    const {
        metrics,
        recordingState,
        startRecording,
        togglePause,
        stopRecording,
        resetRecording,
        isRecording,
        isPaused,
        isComplete,
        duration,
        audioUrl
    } = useVoiceRecorder({
        onMetricsUpdate,
        onRecordingStart,
        onRecordingStop,
        onSilenceDetected,
        silenceThreshold,
        silenceTimeout
    })

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60)
        const s = seconds % 60
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    }

    const getStatusColor = (status: 'good' | 'warning' | 'error') => {
        switch (status) {
            case 'good': return 'text-green-600'
            case 'warning': return 'text-amber-500'
            case 'error': return 'text-red-500'
            default: return 'text-gray-500'
        }
    }

    const getStatusBg = (status: 'good' | 'warning' | 'error') => {
        switch (status) {
            case 'good': return 'bg-green-50 border-green-300'
            case 'warning': return 'bg-amber-50 border-amber-300'
            case 'error': return 'bg-red-50 border-red-300'
            default: return 'bg-gray-50 border-gray-300'
        }
    }

    const getStatusIcon = (status: 'good' | 'warning' | 'error') => {
        switch (status) {
            case 'good': return '✅'
            case 'warning': return '⚠️'
            case 'error': return '❌'
            default: return '⚪'
        }
    }

    const getBarColor = (status: 'good' | 'warning' | 'error') => {
        switch (status) {
            case 'good': return 'bg-green-500'
            case 'warning': return 'bg-amber-500'
            case 'error': return 'bg-red-500'
            default: return 'bg-gray-400'
        }
    }

    return (
        <div className={`bg-white border-4 border-gray-200 rounded-3xl p-6 shadow-xl ${className}`}>
            {/* Timer et état */}
            <div className="text-center mb-4">
                <div className="text-5xl font-bold text-blue-600 font-mono">
                    {formatTime(duration)}
                </div>
                <div className="text-sm text-gray-500 mt-1">
                    {isRecording && !isPaused && '🎙️ Enregistrement en cours'}
                    {isPaused && '⏸️ En pause'}
                    {!isRecording && !isComplete && 'Prêt à enregistrer'}
                    {isComplete && '✅ Enregistrement terminé'}
                </div>
            </div>

            {/* Visualisation audio */}
            {showVisualizer && (
                <div className="mb-4">
                    <VoiceVisualizer
                        analyser={null} // TODO: Passer l'analyser depuis le hook
                        isRecording={isRecording}
                        isPaused={isPaused}
                    />
                </div>
            )}

            {/* Boutons de contrôle */}
            <div className="flex gap-3 mb-4">
                {!isRecording && !isComplete && (
                    <button
                        onClick={startRecording}
                        className="flex-1 py-4 bg-red-600 text-white text-2xl font-bold rounded-2xl hover:bg-red-700 transition"
                    >
                        🔴 Démarrer
                    </button>
                )}
                
                {isRecording && (
                    <>
                        <button
                            onClick={togglePause}
                            className="flex-1 py-4 bg-amber-500 text-white text-2xl font-bold rounded-2xl hover:bg-amber-600 transition"
                        >
                            {isPaused ? '▶️ Reprendre' : '⏸️ Pause'}
                        </button>
                        <button
                            onClick={stopRecording}
                            className="flex-1 py-4 bg-gray-600 text-white text-2xl font-bold rounded-2xl hover:bg-gray-700 transition"
                        >
                            ⏹️ Arrêter
                        </button>
                    </>
                )}
                
                {isComplete && (
                    <>
                        <button
                            onClick={resetRecording}
                            className="flex-1 py-4 bg-amber-500 text-white text-2xl font-bold rounded-2xl hover:bg-amber-600 transition"
                        >
                            🔄 Recommencer
                        </button>
                        {audioUrl && (
                            <audio controls className="flex-1" src={audioUrl} />
                        )}
                    </>
                )}
            </div>

            {/* Métriques de qualité */}
            {showMetrics && isRecording && (
                <div className="grid grid-cols-2 gap-3">
                    <div className={`p-3 rounded-xl border-2 ${getStatusBg(metrics.volumeStatus)}`}>
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">Volume</span>
                            <div className="flex items-center gap-2">
                                <span className={`text-sm font-bold ${getStatusColor(metrics.volumeStatus)}`}>
                                    {metrics.volumeLevel}
                                </span>
                                <span>{getStatusIcon(metrics.volumeStatus)}</span>
                            </div>
                        </div>
                        <div className="w-full h-2 bg-gray-200 rounded-full mt-1 overflow-hidden">
                            <div
                                className={`h-full ${getBarColor(metrics.volumeStatus)} rounded-full transition-all duration-500`}
                                style={{ width: `${metrics.volume}%` }}
                            />
                        </div>
                    </div>

                    <div className={`p-3 rounded-xl border-2 ${getStatusBg(metrics.noiseStatus)}`}>
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">Bruit</span>
                            <div className="flex items-center gap-2">
                                <span className={`text-sm font-bold ${getStatusColor(metrics.noiseStatus)}`}>
                                    {metrics.noiseLevel}
                                </span>
                                <span>{getStatusIcon(metrics.noiseStatus)}</span>
                            </div>
                        </div>
                        <div className="w-full h-2 bg-gray-200 rounded-full mt-1 overflow-hidden">
                            <div
                                className={`h-full ${getBarColor(metrics.noiseStatus)} rounded-full transition-all duration-500`}
                                style={{ width: `${metrics.noise}%` }}
                            />
                        </div>
                    </div>

                    <div className={`p-3 rounded-xl border-2 ${getStatusBg(metrics.clarityStatus)}`}>
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">Clarté</span>
                            <div className="flex items-center gap-2">
                                <span className={`text-sm font-bold ${getStatusColor(metrics.clarityStatus)}`}>
                                    {metrics.clarityLevel}
                                </span>
                                <span>{getStatusIcon(metrics.clarityStatus)}</span>
                            </div>
                        </div>
                        <div className="w-full h-2 bg-gray-200 rounded-full mt-1 overflow-hidden">
                            <div
                                className={`h-full ${getBarColor(metrics.clarityStatus)} rounded-full transition-all duration-500`}
                                style={{ width: `${metrics.clarity}%` }}
                            />
                        </div>
                    </div>

                    <div className={`p-3 rounded-xl border-2 ${getStatusBg(metrics.silenceStatus)}`}>
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">Silence</span>
                            <div className="flex items-center gap-2">
                                <span className={`text-sm font-bold ${getStatusColor(metrics.silenceStatus)}`}>
                                    {metrics.isSilent ? `⚠️ ${Math.floor(metrics.silenceDuration)}s` : '✅ Normal'}
                                </span>
                                <span>{metrics.isSilent ? '🔇' : '🗣️'}</span>
                            </div>
                        </div>
                        <div className="w-full h-2 bg-gray-200 rounded-full mt-1 overflow-hidden">
                            <div
                                className={`h-full ${getBarColor(metrics.silenceStatus)} rounded-full transition-all duration-500`}
                                style={{ width: `${Math.min(metrics.silenceDuration / 3 * 100, 100)}%` }}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Alerte silence */}
            {metrics.isSilent && metrics.silenceDuration > 2 && (
                <div className="mt-3 p-3 bg-red-100 border-2 border-red-300 rounded-xl text-center">
                    <span className="text-red-700 font-bold text-lg">
                        ⚠️ Silence détecté depuis {Math.floor(metrics.silenceDuration)} secondes
                    </span>
                    <p className="text-red-600 text-sm">
                        Parlez plus fort ou vérifiez le microphone
                    </p>
                </div>
            )}
        </div>
    )
}

export default VoiceRecorder