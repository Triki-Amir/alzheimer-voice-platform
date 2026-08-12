// components/VoiceRecorder/DoctorVoiceRecorder.tsx
'use client'

import { useState, useRef } from 'react'

interface DoctorVoiceRecorderProps {
    onRecordingComplete: (blob: Blob, duration: number) => void
    onRecordingStart?: () => void
    onRecordingStop?: () => void
}

const REFERENCE_TEXT = "Je m'appelle [Nom], je suis médecin. Ceci est mon enregistrement de référence pour l'application eHealthBridge."

export default function DoctorVoiceRecorder({
    onRecordingComplete,
    onRecordingStart,
    onRecordingStop
}: DoctorVoiceRecorderProps) {
    const [isRecording, setIsRecording] = useState(false)
    const [isPaused, setIsPaused] = useState(false)
    const [duration, setDuration] = useState(0)
    const [audioUrl, setAudioUrl] = useState<string | null>(null)
    const [isComplete, setIsComplete] = useState(false)

    const mediaRecorderRef = useRef<MediaRecorder | null>(null)
    const streamRef = useRef<MediaStream | null>(null)
    const audioChunksRef = useRef<BlobPart[]>([])
    const timerRef = useRef<NodeJS.Timeout | null>(null)
    // mediaRecorder.onstop is a closure created once per recording; it would
    // otherwise capture the `duration` state value from the instant
    // startRecording() ran (i.e. 0), never seeing the interval's later
    // updates. Reading a ref instead always gets the live value.
    const durationRef = useRef(0)

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60)
        const s = seconds % 60
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    }

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            })
            streamRef.current = stream

            const mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=opus'
            })
            mediaRecorderRef.current = mediaRecorder
            audioChunksRef.current = []

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data)
                }
            }

            mediaRecorder.onstop = () => {
                const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
                const url = URL.createObjectURL(blob)
                setAudioUrl(url)
                setIsComplete(true)
                setIsRecording(false)
                onRecordingComplete(blob, durationRef.current)
                if (onRecordingStop) onRecordingStop()
            }

            mediaRecorder.start(1000)
            setIsRecording(true)
            setIsPaused(false)
            setIsComplete(false)
            setDuration(0)
            durationRef.current = 0

            // Timer
            timerRef.current = setInterval(() => {
                setDuration(prev => {
                    const next = prev + 1
                    durationRef.current = next
                    return next
                })
            }, 1000)

            if (onRecordingStart) onRecordingStart()

        } catch (error) {
            console.error('Erreur microphone:', error)
            alert('Impossible d\'accéder au microphone. Veuillez vérifier les permissions.')
        }
    }

    const togglePause = () => {
        if (!mediaRecorderRef.current) return

        if (isPaused) {
            mediaRecorderRef.current.resume()
            timerRef.current = setInterval(() => {
                setDuration(prev => {
                    const next = prev + 1
                    durationRef.current = next
                    return next
                })
            }, 1000)
        } else {
            mediaRecorderRef.current.pause()
            if (timerRef.current) {
                clearInterval(timerRef.current)
            }
        }
        setIsPaused(!isPaused)
    }

    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop()
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop())
        }
        if (timerRef.current) {
            clearInterval(timerRef.current)
        }
        setIsRecording(false)
        setIsPaused(false)
    }

    const resetRecording = () => {
        setAudioUrl(null)
        setIsComplete(false)
        setDuration(0)
        durationRef.current = 0
        audioChunksRef.current = []
    }

    return (
        <div className="bg-white border-4 border-gray-200 rounded-3xl p-6 shadow-xl">
            <h3 className="text-xl font-bold text-gray-700 mb-4 text-center">
                🎤 Enregistrement vocal de référence
            </h3>

            <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 mb-4">
                <p className="text-sm text-blue-800 font-medium">📋 Phrase de référence :</p>
                <p className="text-base text-blue-700 mt-1 italic">
                    "Je m'appelle [Votre Nom], je suis médecin. Ceci est mon enregistrement de référence."
                </p>
            </div>

            {/* Timer */}
            <div className="text-center mb-4">
                <div className="text-4xl font-bold text-blue-600 font-mono">
                    {formatTime(duration)}
                </div>
                {isRecording && (
                    <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium mt-1 ${
                        isPaused ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                    }`}>
                        {isPaused ? '⏸️ En pause' : '🔴 Enregistrement'}
                    </span>
                )}
            </div>

            {/* Contrôles */}
            {!isComplete ? (
                <div className="space-y-3">
                    {!isRecording ? (
                        <button
                            onClick={startRecording}
                            className="w-full py-4 bg-red-600 text-white text-xl font-bold rounded-2xl hover:bg-red-700 transition shadow-lg"
                        >
                            🎙️ Démarrer l'enregistrement
                        </button>
                    ) : (
                        <div className="flex gap-3">
                            <button
                                onClick={togglePause}
                                className="flex-1 py-4 bg-amber-500 text-white text-xl font-bold rounded-2xl hover:bg-amber-600 transition"
                            >
                                {isPaused ? '▶️ Reprendre' : '⏸️ Pause'}
                            </button>
                            <button
                                onClick={stopRecording}
                                className="flex-1 py-4 bg-gray-600 text-white text-xl font-bold rounded-2xl hover:bg-gray-700 transition"
                            >
                                ⏹️ Arrêter
                            </button>
                        </div>
                    )}
                </div>
            ) : (
                <div className="space-y-3">
                    <div className="text-center text-green-600 font-bold text-lg">
                        ✅ Enregistrement terminé !
                    </div>
                    {audioUrl && (
                        <div className="space-y-2">
                            <p className="text-sm text-gray-600">▶️ Écouter :</p>
                            <audio controls className="w-full rounded-xl" src={audioUrl} />
                        </div>
                    )}
                    <button
                        onClick={resetRecording}
                        className="w-full py-3 bg-amber-500 text-white text-lg font-bold rounded-2xl hover:bg-amber-600 transition"
                    >
                        🔄 Recommencer
                    </button>
                </div>
            )}
        </div>
    )
}