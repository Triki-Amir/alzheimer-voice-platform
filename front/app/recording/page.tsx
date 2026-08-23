// app/recording/page.tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import EthicsBanner from '@/components/EthicsBanner'
import { patientsApi } from '@/lib/api'
import { ingestionApi } from '@/lib/ingestion_service_api'
<<<<<<< HEAD
import { isAuthenticated, verifySession } from '@/lib/auth'
import type { User, Patient } from '@/types'
=======
import { getUser, verifySession , AuthUser } from '@/lib/auth'
import type { Patient } from '@/types'
>>>>>>> b056e8f36ec665af29dbd0b03746f8c8dc046b34

type TestType = 
    | 'cookie_theft' 
    | 'fluency' 
    | 'recall' 
    | 'sentence'
    | 'naming'
    | 'repetition'
    | 'comprehension'
    | 'spontaneous'

interface TestConfig {
    id: TestType
    title: string
    subtitle: string
    description: string
    instructions: string[]
    duration: number
    icon: string
    imagePath?: string
    showWordList?: boolean
}

const testConfigs: Record<TestType, TestConfig> = {
    cookie_theft: {
        id: 'cookie_theft',
        title: 'Récit d\'image',
        subtitle: 'Cookie Theft',
        description: 'Décrivez l\'image en détail avec vos propres mots.',
        icon: '🖼️',
        duration: 180,
        imagePath: '/images/cookie-theft.jpg',
        instructions: ['Observez attentivement l\'image', 'Décrivez-la en détail']
    },
    fluency: {
        id: 'fluency',
        title: 'Fluence Verbale',
        subtitle: 'Animaux',
        description: 'Citez le plus d\'animaux possible en 1 minute.',
        icon: '🐾',
        duration: 60,
        instructions: ['Citez le plus d\'animaux possible en 1 minute'],
        showWordList: true
    },
    recall: {
        id: 'recall',
        title: 'Rappel d\'informations',
        subtitle: 'Mémoire',
        description: 'Écoutez puis rappelez le maximum d\'informations.',
        icon: '📝',
        duration: 120,
        instructions: ['Écoutez le texte', 'Rappelez le maximum d\'informations'],
        showWordList: true
    },
    sentence: {
        id: 'sentence',
        title: 'Construction de phrases',
        subtitle: 'Syntaxe',
        description: 'Construisez des phrases complexes.',
        icon: '✏️',
        duration: 120,
        instructions: ['Construisez des phrases complexes']
    },
    naming: {
        id: 'naming',
        title: 'Nomination d\'objets',
        subtitle: 'Vocabulaire',
        description: 'Nommez les objets que vous voyez.',
        icon: '🔍',
        duration: 180,
        imagePath: '/images/naming-objects.jpg',
        instructions: ['Nommez les objets que vous voyez']
    },
    repetition: {
        id: 'repetition',
        title: 'Répétition de phrases',
        subtitle: 'Mémoire à court terme',
        description: 'Répétez les phrases que vous allez entendre.',
        icon: '🔊',
        duration: 120,
        instructions: ['Répétez les phrases'],
        showWordList: true
    },
    comprehension: {
        id: 'comprehension',
        title: 'Compréhension',
        subtitle: 'Auditive',
        description: 'Répondez aux questions sur le texte.',
        icon: '🧠',
        duration: 180,
        instructions: ['Écoutez le texte', 'Répondez aux questions']
    },
    spontaneous: {
        id: 'spontaneous',
        title: 'Discours spontané',
        subtitle: 'Langage',
        description: 'Parlez librement sur un sujet proposé.',
        icon: '💬',
        duration: 300,
        instructions: ['Parlez librement sur le sujet proposé']
    }
}

interface VoiceMetric {
    level: string
    status: 'good' | 'warning' | 'error'
    percentage: number
}

interface VoiceMetrics {
    noise: VoiceMetric
    volume: VoiceMetric
    clarity: VoiceMetric
    rhythm: VoiceMetric
    isSilent: boolean
    silenceDuration: number
}

// ===================== QUALITY CHECK INTERFACES =====================

interface PreprocessingQualityCheck {
    passed: boolean
    score: number
    warnings: string[]
    errors: string[]
    details: {
        duration: { value: number; status: 'good' | 'warning' | 'error'; message: string }
        volume: { value: number; status: 'good' | 'warning' | 'error'; message: string }
        noise: { value: number; status: 'good' | 'warning' | 'error'; message: string }
        clarity: { value: number; status: 'good' | 'warning' | 'error'; message: string }
        silenceRatio: { value: number; status: 'good' | 'warning' | 'error'; message: string }
        twoSpeakers: { status: 'good' | 'warning' | 'error'; message: string }
    }
}

// ===================== QUALITY CHECK FUNCTIONS =====================

const checkPreprocessingQuality = (
    metrics: VoiceMetrics, 
    duration: number
): PreprocessingQualityCheck => {
    const errors: string[] = []
    const warnings: string[] = []
    
    // 1. Vérifier la durée (le preprocessing attend > 3s)
    let durationStatus: 'good' | 'warning' | 'error'
    let durationMessage: string
    if (duration < 3) {
        durationStatus = 'error'
        durationMessage = `⏱️ Audio trop court (${duration}s). Minimum 3 secondes.`
        errors.push('Audio trop court')
    } else if (duration < 5) {
        durationStatus = 'warning'
        durationMessage = `⏱️ Audio court (${duration}s). Idéal > 5 secondes.`
        warnings.push('Audio court')
    } else if (duration < 10) {
        durationStatus = 'warning'
        durationMessage = `⏱️ Durée acceptable (${duration}s). Idéal > 10 secondes.`
        warnings.push('Durée acceptable mais pas optimale')
    } else {
        durationStatus = 'good'
        durationMessage = `✅ Durée correcte (${duration}s)`
    }

    // 2. Vérifier le volume (le preprocessing attend > 10%)
    const volumeValue = metrics.volume.percentage
    let volumeStatus: 'good' | 'warning' | 'error'
    let volumeMessage: string
    if (volumeValue < 2) {
        volumeStatus = 'error'
        volumeMessage = '🔇 Volume trop faible (inaudible)'
        errors.push('Volume trop faible')
    } else if (volumeValue < 5) {
        volumeStatus = 'error'
        volumeMessage = '🔇 Volume très faible'
        errors.push('Volume très faible')
    } else if (volumeValue < 10) {
        volumeStatus = 'warning'
        volumeMessage = '🔊 Volume faible, mais acceptable'
        warnings.push('Volume faible')
    } else if (volumeValue < 30) {
        volumeStatus = 'good'
        volumeMessage = '✅ Volume optimal'
    } else {
        volumeStatus = 'warning'
        volumeMessage = '📢 Volume élevé (risque de saturation)'
        warnings.push('Volume élevé')
    }

    // 3. Vérifier le bruit (le preprocessing attend < 30%)
    const noiseValue = metrics.noise.percentage
    let noiseStatus: 'good' | 'warning' | 'error'
    let noiseMessage: string
    if (noiseValue < 10) {
        noiseStatus = 'good'
        noiseMessage = '✅ Bruit de fond faible'
    } else if (noiseValue < 25) {
        noiseStatus = 'warning'
        noiseMessage = '🔊 Bruit modéré, mais acceptable'
        warnings.push('Bruit modéré')
    } else if (noiseValue < 40) {
        noiseStatus = 'warning'
        noiseMessage = '⚠️ Bruit élevé'
        warnings.push('Bruit élevé')
    } else {
        noiseStatus = 'error'
        noiseMessage = '❌ Bruit excessif'
        errors.push('Bruit excessif')
    }

    // 4. Vérifier la clarté (SNR)
    const clarityValue = metrics.clarity.percentage
    let clarityStatus: 'good' | 'warning' | 'error'
    let clarityMessage: string
    if (clarityValue > 30) {
        clarityStatus = 'good'
        clarityMessage = '✅ Excellente clarté'
    } else if (clarityValue > 20) {
        clarityStatus = 'good'
        clarityMessage = '✅ Bonne clarté'
    } else if (clarityValue > 15) {
        clarityStatus = 'warning'
        clarityMessage = '⚠️ Clarté acceptable'
        warnings.push('Clarté moyenne')
    } else {
        clarityStatus = 'error'
        clarityMessage = '❌ Mauvaise clarté'
        errors.push('Mauvaise clarté')
    }

    // 5. Vérifier le ratio de silence
    const silenceRatio = metrics.silenceDuration / (duration + 0.001)
    let silenceStatus: 'good' | 'warning' | 'error'
    let silenceMessage: string
    if (silenceRatio < 0.15) {
        silenceStatus = 'good'
        silenceMessage = '✅ Peu de silence'
    } else if (silenceRatio < 0.4) {
        silenceStatus = 'warning'
        silenceMessage = `⚠️ ${Math.round(silenceRatio * 100)}% de silence`
        warnings.push('Silence important')
    } else {
        silenceStatus = 'error'
        silenceMessage = `❌ ${Math.round(silenceRatio * 100)}% de silence (trop)`
        errors.push('Trop de silence')
    }

    // 6. Vérifier la présence de deux locuteurs
    const twoSpeakersStatus = metrics.isSilent ? 'error' : 'warning'
    const twoSpeakersMessage = metrics.isSilent 
        ? '❌ Aucune parole détectée' 
        : '⚠️ Vérifiez que vous et le patient parlez (le preprocessing attend 2 locuteurs)'

    // 7. Calculer le score global
    let score = 100
    score -= errors.length * 25
    score -= warnings.length * 10
    const finalScore = Math.max(0, Math.min(100, score))
    const passed = finalScore >= 60 && errors.length === 0

    return {
        passed,
        score: finalScore,
        warnings,
        errors,
        details: {
            duration: { value: duration, status: durationStatus, message: durationMessage },
            volume: { value: volumeValue, status: volumeStatus, message: volumeMessage },
            noise: { value: noiseValue, status: noiseStatus, message: noiseMessage },
            clarity: { value: clarityValue, status: clarityStatus, message: clarityMessage },
            silenceRatio: { value: silenceRatio, status: silenceStatus, message: silenceMessage },
            twoSpeakers: { status: twoSpeakersStatus, message: twoSpeakersMessage }
        }
    }
}

// ===================== QUALITY RESULT DISPLAY =====================

const QualityResultDisplay = ({ 
    result, 
    onAccept, 
    onReject 
}: { 
    result: PreprocessingQualityCheck
    onAccept: () => void
    onReject: () => void
}) => {
    const getStatusColor = (status: 'good' | 'warning' | 'error') => {
        switch (status) {
            case 'good': return 'text-green-600 border-green-300 bg-green-50'
            case 'warning': return 'text-amber-600 border-amber-300 bg-amber-50'
            case 'error': return 'text-red-600 border-red-300 bg-red-50'
        }
    }

    const getStatusIcon = (status: 'good' | 'warning' | 'error') => {
        switch (status) {
            case 'good': return '✅'
            case 'warning': return '⚠️'
            case 'error': return '❌'
        }
    }

    const getScoreColor = (score: number) => {
        if (score >= 80) return 'text-green-600'
        if (score >= 60) return 'text-amber-600'
        return 'text-red-600'
    }

    return (
        <div className="bg-white rounded-2xl border-2 border-gray-200 p-6 shadow-lg mb-4">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-gray-900">🎯 Qualité pour le traitement</h3>
                <div className="text-right">
                    <div className={`text-3xl font-bold ${getScoreColor(result.score)}`}>
                        {result.score}%
                    </div>
                    <div className="text-sm text-gray-500">Score global</div>
                </div>
            </div>

            {result.errors.length > 0 && (
                <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 mb-4">
                    <p className="font-bold text-red-700">❌ Problèmes bloquants</p>
                    <ul className="mt-1 space-y-1">
                        {result.errors.map((err, i) => (
                            <li key={i} className="text-sm text-red-600">• {err}</li>
                        ))}
                    </ul>
                </div>
            )}

            {result.warnings.length > 0 && (
                <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-4 mb-4">
                    <p className="font-bold text-amber-700">⚠️ Avertissements</p>
                    <ul className="mt-1 space-y-1">
                        {result.warnings.map((warn, i) => (
                            <li key={i} className="text-sm text-amber-600">• {warn}</li>
                        ))}
                    </ul>
                </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                {Object.entries(result.details).map(([key, detail]) => (
                    <div key={key} className={`p-3 rounded-xl border-2 ${getStatusColor(detail.status)}`}>
                        <div className="flex justify-between items-center">
                            <span className="text-sm font-medium capitalize">{key}</span>
                            <span className={`text-sm font-bold ${
                                detail.status === 'good' ? 'text-green-600' :
                                detail.status === 'warning' ? 'text-amber-600' :
                                'text-red-600'
                            }`}>
                                {getStatusIcon(detail.status)}
                            </span>
                        </div>
                        
                    </div>
                ))}
            </div>

            <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 mb-4">
                <p className="text-sm text-blue-700 font-medium">💡 Le preprocessing attend :</p>
                <ul className="mt-1 text-xs text-blue-600 space-y-0.5">
                    <li>• Durée {'>'} 3 secondes (idéal {'>'} 10s)</li>
                    <li>• Volume {'>'} 10%</li>
                    <li>• Bruit {'<'} 30%</li>
                    <li>• Clarté {'>'} 15 dB</li>
                    <li>• 2 locuteurs (médecin + patient)</li>
                </ul>
            </div>

            <div className="flex gap-3">
                <button
                    onClick={onAccept}
                    className={`flex-1 py-3 rounded-xl font-bold transition ${
                        result.passed 
                            ? 'bg-green-600 text-white hover:bg-green-700' 
                            : 'bg-amber-600 text-white hover:bg-amber-700'
                    }`}
                >
                    {result.passed ? '📤 Uploader' : '📤 Uploader quand même'}
                </button>
                <button
                    onClick={onReject}
                    className="flex-1 py-3 bg-gray-200 text-gray-700 rounded-xl font-bold hover:bg-gray-300 transition"
                >
                    🔄 Ré-enregistrer
                </button>
            </div>
        </div>
    )
}

// ===================== AUDIO CONVERSION UTILITIES =====================

const convertToWav = async (webmBlob: Blob): Promise<Blob> => {
    return new Promise((resolve, reject) => {
        if (!webmBlob || webmBlob.size === 0) {
            reject(new Error('Fichier audio vide'))
            return
        }

        const reader = new FileReader()
        reader.onload = async (event) => {
            try {
                const arrayBuffer = event.target?.result as ArrayBuffer
                if (!arrayBuffer || arrayBuffer.byteLength === 0) {
                    reject(new Error('Buffer audio vide'))
                    return
                }

                const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
                    sampleRate: 16000
                })

                let audioBuffer
                try {
                    audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
                } catch (decodeError) {
                    console.error('❌ Erreur de décodage:', decodeError)
                    reject(new Error('Format audio non supporté'))
                    return
                }

                if (!audioBuffer) {
                    reject(new Error('Impossible de décoder l\'audio'))
                    return
                }

                const wavBlob = audioBufferToWav(audioBuffer)
                await audioContext.close()
                resolve(wavBlob)
            } catch (error) {
                reject(error)
            }
        }
        reader.onerror = () => reject(new Error('Erreur de lecture du fichier'))
        reader.readAsArrayBuffer(webmBlob)
    })
}

const audioBufferToWav = (audioBuffer: AudioBuffer): Blob => {
    const numberOfChannels = audioBuffer.numberOfChannels
    const sampleRate = audioBuffer.sampleRate
    const length = audioBuffer.length * numberOfChannels * 2
    const buffer = new ArrayBuffer(44 + length)
    const view = new DataView(buffer)

    const writeString = (view: DataView, offset: number, string: string) => {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i))
        }
    }

    writeString(view, 0, 'RIFF')
    view.setUint32(4, 36 + length, true)
    writeString(view, 8, 'WAVE')
    writeString(view, 12, 'fmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, numberOfChannels, true)
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, sampleRate * numberOfChannels * 2, true)
    view.setUint16(32, numberOfChannels * 2, true)
    view.setUint16(34, 16, true)
    writeString(view, 36, 'data')
    view.setUint32(40, length, true)

    const channelData = audioBuffer.getChannelData(0)
    let offset = 44
    for (let i = 0; i < audioBuffer.length; i++) {
        const sample = Math.max(-1, Math.min(1, channelData[i]))
        view.setInt16(offset, sample * 0x7FFF, true)
        offset += 2
    }

    return new Blob([buffer], { type: 'audio/wav' })
}

// ===================== MAIN COMPONENT =====================

export default function RecordingPage() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [user, setUser] = useState<AuthUser | null>(null)
    const [patient, setPatient] = useState<Patient | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isRecording, setIsRecording] = useState(false)
    const [isPaused, setIsPaused] = useState(false)
    const [time, setTime] = useState(0)
    const [testType, setTestType] = useState<TestType>('cookie_theft')
    const [words, setWords] = useState<string[]>([])
    const [currentWord, setCurrentWord] = useState('')
    const [isComplete, setIsComplete] = useState(false)
    const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
    const [audioUrl, setAudioUrl] = useState<string | null>(null)
    const [isUploading, setIsUploading] = useState(false)
    const [uploadStatus, setUploadStatus] = useState<string | null>(null)
    const [sessionId, setSessionId] = useState<string | null>(null)

    // ✅ Quality check states
    const [showQualityCheck, setShowQualityCheck] = useState(false)
    const [qualityResult, setQualityResult] = useState<PreprocessingQualityCheck | null>(null)

    const [voiceMetrics, setVoiceMetrics] = useState<VoiceMetrics>({
        noise: { level: 'Faible', status: 'good', percentage: 12 },
        volume: { level: 'Bon', status: 'good', percentage: 78 },
        clarity: { level: 'Excellente', status: 'good', percentage: 92 },
        rhythm: { level: 'Bon', status: 'good', percentage: 72 },
        isSilent: false,
        silenceDuration: 0
    })

    const mediaRecorderRef = useRef<MediaRecorder | null>(null)
    const audioContextRef = useRef<AudioContext | null>(null)
    const analyserRef = useRef<AnalyserNode | null>(null)
    const streamRef = useRef<MediaStream | null>(null)
    const animationFrameRef = useRef<number | null>(null)
    const audioChunksRef = useRef<BlobPart[]>([])
    const timerRef = useRef<NodeJS.Timeout | null>(null)

    const testConfig = testConfigs[testType]

    useEffect(() => {
<<<<<<< HEAD
        const checkAuth = async () => {
            const valid = await verifySession()
            if (!valid) {
                router.push('/')
                return
            }

            const userData = localStorage.getItem('user')
            if (!userData) {
                router.push('/')
                return
            }
            setUser(JSON.parse(userData))

            const patientId = searchParams?.get('patient')
            const testId = searchParams?.get('test') as TestType || 'cookie_theft'

            if (patientId) {
                loadPatient(patientId)
            }

            if (testId && testConfigs[testId]) {
                setTestType(testId)
            }

            setIsLoading(false)
        }
        checkAuth()

        return () => {
            cleanupResources()
        }
=======
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
                setUser(userData as AuthUser)

                const patientId = searchParams?.get('patient')
                const testId = searchParams?.get('test') as TestType || 'cookie_theft'

                if (patientId) {
                    await loadPatient(patientId)
                }

                if (testId && testConfigs[testId]) {
                    setTestType(testId)
                }

                setIsLoading(false)
            } catch (error) {
                console.error('❌ Erreur de chargement:', error)
                router.push('/')
            }

            return () => {
                cleanupResources()
            }
        }

        loadData()
>>>>>>> b056e8f36ec665af29dbd0b03746f8c8dc046b34
    }, [router, searchParams])

    const loadPatient = async (patientId: string) => {
        const result = await patientsApi.getById(patientId)
        if (result.success && result.data) {
            setPatient(result.data)
        }
    }

    useEffect(() => {
        if (isRecording && !isPaused) {
            timerRef.current = setInterval(() => {
                setTime(prev => {
                    if (prev >= testConfig.duration) {
                        stopRecording()
                        return testConfig.duration
                    }
                    return prev + 1
                })
            }, 1000)
        } else if (timerRef.current) {
            clearInterval(timerRef.current)
        }

        return () => {
            if (timerRef.current) {
                clearInterval(timerRef.current)
            }
        }
    }, [isRecording, isPaused, testConfig.duration])

    const cleanupResources = () => {
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current)
        }
        if (timerRef.current) {
            clearInterval(timerRef.current)
        }
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            audioContextRef.current.close()
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop())
        }
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop()
        }
    }

    const calculateRMS = (dataArray: Uint8Array): number => {
        let sum = 0
        for (let i = 0; i < dataArray.length; i++) {
            const value = (dataArray[i] - 128) / 128
            sum += value * value
        }
        const rms = Math.sqrt(sum / dataArray.length)
        return Math.min(rms * 100, 100)
    }

    const analyzeAudio = () => {
        const analyser = analyserRef.current
        if (!analyser) return

        if (!streamRef.current) return

        // ================================
        // 1. GET REAL-TIME AUDIO DATA
        // ================================

        const timeDataArray = new Uint8Array(analyser.fftSize)
        analyser.getByteTimeDomainData(timeDataArray)

        // ================================
        // 2. CALCULATE RMS VOLUME
        // ================================

        let sumSquares = 0
        for (let i = 0; i < timeDataArray.length; i++) {
            const normalized = (timeDataArray[i] - 128) / 128
            sumSquares += normalized * normalized
        }

        const rms = Math.sqrt(sumSquares / timeDataArray.length)
        const rmsPercentage = Math.min(rms * 100, 100)

        // ================================
        // 3. FREQUENCY DATA (pour le bruit)
        // ================================

        const frequencyData = new Uint8Array(analyser.frequencyBinCount)
        analyser.getByteFrequencyData(frequencyData)

        let totalFrequencyEnergy = 0
        for (let i = 0; i < frequencyData.length; i++) {
            totalFrequencyEnergy += frequencyData[i]
        }

        const averageFrequencyEnergy = totalFrequencyEnergy / frequencyData.length
        const audioEnergyPercentage = Math.min((averageFrequencyEnergy / 255) * 100, 100)

        // ================================
        // 4. THRESHOLDS - ALIGNÉES AVEC LE PREPROCESSING
        // ================================

        const SILENCE_THRESHOLD = 2.0
        const LOW_VOLUME_THRESHOLD = 5.0
        const GOOD_VOLUME_THRESHOLD = 10.0
        const HIGH_VOLUME_THRESHOLD = 30.0

        const isSilent = rmsPercentage < SILENCE_THRESHOLD

        // ================================
        // 5. UPDATE REACT STATE
        // ================================

        setVoiceMetrics(prevMetrics => {
            let newSilenceDuration = prevMetrics.silenceDuration
            const frameDuration = 1 / 60

            if (isSilent) {
                newSilenceDuration += frameDuration
            } else {
                newSilenceDuration = 0
            }

            // Volume
            let volumeLevel: string
            let volumeStatus: 'good' | 'warning' | 'error'
            let volumePercentage: number

            if (rmsPercentage < SILENCE_THRESHOLD) {
                volumeLevel = '🔇 Silence'
                volumeStatus = 'error'
                volumePercentage = 0
            } else if (rmsPercentage < LOW_VOLUME_THRESHOLD) {
                volumeLevel = 'Très faible'
                volumeStatus = 'error'
                volumePercentage = Math.round(rmsPercentage * 3)
            } else if (rmsPercentage < GOOD_VOLUME_THRESHOLD) {
                volumeLevel = 'Faible'
                volumeStatus = 'warning'
                volumePercentage = Math.round(rmsPercentage * 4)
            } else if (rmsPercentage < HIGH_VOLUME_THRESHOLD) {
                volumeLevel = 'Bon'
                volumeStatus = 'good'
                volumePercentage = Math.min(Math.round(rmsPercentage * 3), 100)
            } else {
                volumeLevel = 'Élevé'
                volumeStatus = 'good'
                volumePercentage = Math.min(Math.round(rmsPercentage * 2.5), 100)
            }

            // Noise
            let noiseLevel: string
            let noiseStatus: 'good' | 'warning' | 'error'
            let noisePercentage: number

            if (audioEnergyPercentage < 10) {
                noiseLevel = 'Faible'
                noiseStatus = 'good'
                noisePercentage = Math.round(audioEnergyPercentage * 3)
            } else if (audioEnergyPercentage < 25) {
                noiseLevel = 'Moyen'
                noiseStatus = 'warning'
                noisePercentage = Math.round(audioEnergyPercentage * 2)
            } else if (audioEnergyPercentage < 40) {
                noiseLevel = 'Élevé'
                noiseStatus = 'warning'
                noisePercentage = Math.min(Math.round(audioEnergyPercentage * 1.5), 100)
            } else {
                noiseLevel = 'Excessif'
                noiseStatus = 'error'
                noisePercentage = Math.min(Math.round(audioEnergyPercentage * 1.2), 100)
            }

            // Clarity
            let clarityLevel: string
            let clarityStatus: 'good' | 'warning' | 'error'
            let clarityPercentage: number

            if (rmsPercentage > GOOD_VOLUME_THRESHOLD) {
                clarityLevel = 'Excellente'
                clarityStatus = 'good'
                clarityPercentage = Math.min(Math.round(rmsPercentage * 3), 100)
            } else if (rmsPercentage > LOW_VOLUME_THRESHOLD) {
                clarityLevel = 'Bonne'
                clarityStatus = 'warning'
                clarityPercentage = Math.round(rmsPercentage * 2.5)
            } else {
                clarityLevel = 'Moyenne'
                clarityStatus = 'error'
                clarityPercentage = Math.round(rmsPercentage * 2)
            }

            // Rhythm
            let rhythmLevel: string
            let rhythmStatus: 'good' | 'warning' | 'error'
            let rhythmPercentage: number

            if (rmsPercentage > GOOD_VOLUME_THRESHOLD) {
                rhythmLevel = 'Bon'
                rhythmStatus = 'good'
                rhythmPercentage = Math.min(Math.round(rmsPercentage * 3), 100)
            } else if (rmsPercentage > LOW_VOLUME_THRESHOLD) {
                rhythmLevel = 'Moyen'
                rhythmStatus = 'warning'
                rhythmPercentage = Math.round(rmsPercentage * 2.5)
            } else {
                rhythmLevel = 'Irrégulier'
                rhythmStatus = 'error'
                rhythmPercentage = Math.round(rmsPercentage * 2)
            }

            return {
                noise: {
                    level: noiseLevel,
                    status: noiseStatus,
                    percentage: noisePercentage
                },
                volume: {
                    level: volumeLevel,
                    status: volumeStatus,
                    percentage: volumePercentage
                },
                clarity: {
                    level: clarityLevel,
                    status: clarityStatus,
                    percentage: clarityPercentage
                },
                rhythm: {
                    level: rhythmLevel,
                    status: rhythmStatus,
                    percentage: rhythmPercentage
                },
                isSilent,
                silenceDuration: newSilenceDuration
            }
        })

        animationFrameRef.current = requestAnimationFrame(analyzeAudio)
    }

    // ✅ Upload with WAV conversion
    const uploadToIngestion = async (blob: Blob) => {
        if (!blob || !patient) return

        setIsUploading(true)
        setUploadStatus('📤 Upload vers le service d\'ingestion...')

        try {
            setUploadStatus('🔄 Conversion en WAV...')
            const wavBlob = await convertToWav(blob)
            
            console.log('🎵 Conversion réussie:', {
                originalSize: blob.size,
                wavSize: wavBlob.size,
                originalType: blob.type,
                wavType: wavBlob.type
            })

            setUploadStatus('📤 Upload vers le service...')

            const result = await ingestionApi.uploadAudio(
                patient.id,
                wavBlob,
                testType
            )

            console.log('📥 Upload result:', result)

            if (result.success && result.data) {
                setSessionId(result.data.session_id)
                setUploadStatus(`✅ Session créée avec succès ! (ID: ${result.data.session_id.slice(0, 12)}...)`)
            } else {
                setUploadStatus(`❌ Erreur: ${result.error || 'Échec de l\'upload'}`)
            }
        } catch (error) {
            console.error('❌ Upload error:', error)
            setUploadStatus(`❌ Erreur: ${error instanceof Error ? error.message : 'Erreur inconnue'}`)
        } finally {
            setIsUploading(false)
        }
    }

    // ✅ Handle quality check result
    const handleAcceptAudio = () => {
        if (audioBlob) {
            setShowQualityCheck(false)
            uploadToIngestion(audioBlob)
        }
    }

    const handleRejectAudio = () => {
        setShowQualityCheck(false)
        setQualityResult(null)
        handleRetry()
    }

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                    sampleRate: 16000,
                    channelCount: 1
                }
            })
            streamRef.current = stream

            const audioContext = new AudioContext()
            audioContextRef.current = audioContext

            const source = audioContext.createMediaStreamSource(stream)

            const analyser = audioContext.createAnalyser()
            analyser.fftSize = 2048
            analyserRef.current = analyser
            source.connect(analyser)

            const mimeTypes = [
                'audio/webm;codecs=opus',
                'audio/webm',
                'audio/ogg;codecs=opus'
            ]

            let selectedMimeType = null
            for (const type of mimeTypes) {
                if (MediaRecorder.isTypeSupported(type)) {
                    selectedMimeType = type
                    console.log('✅ Using MIME type:', type)
                    break
                }
            }

            if (!selectedMimeType) {
                console.warn('⚠️ No supported MIME type found, using default')
                selectedMimeType = 'audio/webm;codecs=opus'
            }

            const mediaRecorder = new MediaRecorder(stream, {
                mimeType: selectedMimeType
            })
            
            mediaRecorderRef.current = mediaRecorder
            audioChunksRef.current = []

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data)
                }
            }

            mediaRecorder.onstop = () => {
                const blob = new Blob(audioChunksRef.current, { 
                    type: 'audio/webm'
                })

                console.log('📦 Blob created:', {
                    size: blob.size,
                    type: blob.type,
                    chunks: audioChunksRef.current.length
                })

                const url = URL.createObjectURL(blob)
                setAudioBlob(blob)
                setAudioUrl(url)
                setIsComplete(true)
                
                // ✅ Perform quality check BEFORE upload
                const result = checkPreprocessingQuality(voiceMetrics, time)
                setQualityResult(result)
                setShowQualityCheck(true)
            }

            mediaRecorder.start(1000)
            analyzeAudio()
            
            setIsRecording(true)
            setIsPaused(false)
            setIsComplete(false)
            setTime(0)
            setWords([])
            setUploadStatus(null)
            setSessionId(null)
            setShowQualityCheck(false)
            setQualityResult(null)

        } catch (error) {
            console.error('❌ Erreur microphone:', error)
            alert('Impossible d\'accéder au microphone.')
        }
    }

    const togglePause = () => {
        if (!mediaRecorderRef.current) return

        if (isPaused) {
            mediaRecorderRef.current.resume()
            if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
                audioContextRef.current.resume()
            }
            analyzeAudio()
        } else {
            mediaRecorderRef.current.pause()
            if (audioContextRef.current && audioContextRef.current.state === 'running') {
                audioContextRef.current.suspend()
            }
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current)
            }
        }

        setIsPaused(!isPaused)
    }

    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop()
        }

        cleanupResources()
        setIsRecording(false)
        setIsPaused(false)
    }

    const handleRetry = () => {
        cleanupResources()
        setIsRecording(false)
        setIsPaused(false)
        setIsComplete(false)
        setTime(0)
        setWords([])
        setAudioBlob(null)
        setAudioUrl(null)
        setUploadStatus(null)
        setSessionId(null)
        setShowQualityCheck(false)
        setQualityResult(null)
        setVoiceMetrics({
            noise: { level: 'Faible', status: 'good', percentage: 12 },
            volume: { level: 'Bon', status: 'good', percentage: 78 },
            clarity: { level: 'Excellente', status: 'good', percentage: 92 },
            rhythm: { level: 'Bon', status: 'good', percentage: 72 },
            isSilent: false,
            silenceDuration: 0
        })
    }

    const handleNextTest = () => {
        router.push('/tests')
    }

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60)
        const s = seconds % 60
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    }

    const handleAddWord = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && currentWord.trim()) {
            setWords([...words, currentWord.trim()])
            setCurrentWord('')
        }
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
            case 'good': return 'bg-green-100'
            case 'warning': return 'bg-amber-100'
            case 'error': return 'bg-red-100'
            default: return 'bg-gray-100'
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

    if (isLoading || !user) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-4 text-gray-500 text-lg">Chargement...</p>
                </div>
            </div>
        )
    }

   
    return (
        <>
            <Navbar active="tests" />
            <main className="max-w-7xl mx-auto px-4 py-4">
                
                {/* En-tête */}
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                    <div className="flex items-center gap-3">
                        <Link href="/tests" className="text-blue-600 hover:underline text-sm font-medium">
                            ← Retour aux tests
                        </Link>
                        <span className="text-gray-300">|</span>
                        <span className="text-sm text-gray-500">
                            Patient: <span className="font-medium text-gray-700">{patient?.name}</span>
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-2xl">{testConfig.icon}</span>
                        <h1 className="text-xl font-bold text-gray-900">{testConfig.title}</h1>
                        <span className="text-sm text-gray-500">/ {testConfig.subtitle}</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-2xl font-mono font-bold text-blue-600">
                            ⏱️ {formatTime(time)}
                        </span>
                        <span className="text-base text-gray-400">/ {formatTime(testConfig.duration)}</span>
                    </div>
                </div>

                {/* Métriques en temps réel */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    <div className={`p-3 rounded-xl border-2 ${getStatusBg(voiceMetrics.volume.status)}`}>
                        <div className="flex justify-between items-center">
                            <span className="text-sm font-medium text-gray-600">Volume</span>
                            <span className={`text-sm font-bold ${getStatusColor(voiceMetrics.volume.status)}`}>
                                {voiceMetrics.volume.level}
                            </span>
                        </div>
                        <div className="w-full h-2 bg-gray-200 rounded-full mt-1 overflow-hidden">
                            <div className={`h-full ${getBarColor(voiceMetrics.volume.status)} rounded-full transition-all duration-500`} style={{ width: `${voiceMetrics.volume.percentage}%` }} />
                        </div>
                    </div>

                    <div className={`p-3 rounded-xl border-2 ${getStatusBg(voiceMetrics.noise.status)}`}>
                        <div className="flex justify-between items-center">
                            <span className="text-sm font-medium text-gray-600">Bruit</span>
                            <span className={`text-sm font-bold ${getStatusColor(voiceMetrics.noise.status)}`}>
                                {voiceMetrics.noise.level}
                            </span>
                        </div>
                        <div className="w-full h-2 bg-gray-200 rounded-full mt-1 overflow-hidden">
                            <div className={`h-full ${getBarColor(voiceMetrics.noise.status)} rounded-full transition-all duration-500`} style={{ width: `${voiceMetrics.noise.percentage}%` }} />
                        </div>
                    </div>

                    <div className={`p-3 rounded-xl border-2 ${getStatusBg(voiceMetrics.clarity.status)}`}>
                        <div className="flex justify-between items-center">
                            <span className="text-sm font-medium text-gray-600">Clarté</span>
                            <span className={`text-sm font-bold ${getStatusColor(voiceMetrics.clarity.status)}`}>
                                {voiceMetrics.clarity.level}
                            </span>
                        </div>
                        <div className="w-full h-2 bg-gray-200 rounded-full mt-1 overflow-hidden">
                            <div className={`h-full ${getBarColor(voiceMetrics.clarity.status)} rounded-full transition-all duration-500`} style={{ width: `${voiceMetrics.clarity.percentage}%` }} />
                        </div>
                    </div>

                    <div className={`p-3 rounded-xl border-2 ${getStatusBg(voiceMetrics.rhythm.status)}`}>
                        <div className="flex justify-between items-center">
                            <span className="text-sm font-medium text-gray-600">Rythme</span>
                            <span className={`text-sm font-bold ${getStatusColor(voiceMetrics.rhythm.status)}`}>
                                {voiceMetrics.rhythm.level}
                            </span>
                        </div>
                        <div className="w-full h-2 bg-gray-200 rounded-full mt-1 overflow-hidden">
                            <div className={`h-full ${getBarColor(voiceMetrics.rhythm.status)} rounded-full transition-all duration-500`} style={{ width: `${voiceMetrics.rhythm.percentage}%` }} />
                        </div>
                    </div>
                </div>

                {/* Quality Check Display */}
                {showQualityCheck && qualityResult && (
                    <QualityResultDisplay
                        result={qualityResult}
                        onAccept={handleAcceptAudio}
                        onReject={handleRejectAudio}
                    />
                )}

                {/* Rest of the content - hidden during quality check */}
                {!showQualityCheck && (
                    <>
                        {/* Image */}
                        <div className="w-full bg-white border-4 border-gray-200 rounded-2xl p-2 shadow-xl mb-4">
                            {testConfig.imagePath ? (
                                <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-gray-100">
                                    <img
                                        src={testConfig.imagePath}
                                        alt={testConfig.title}
                                        className="object-contain w-full h-full"
                                        onError={(e) => {
                                            const target = e.target as HTMLImageElement
                                            target.style.display = 'none'
                                        }}
                                    />
                                </div>
                            ) : (
                                <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-gray-100 flex items-center justify-center">
                                    <div className="text-center text-gray-400">
                                        <span className="text-8xl block mb-4">{testConfig.icon}</span>
                                        <p className="text-2xl font-semibold text-gray-600">{testConfig.title}</p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Upload Status */}
                        {uploadStatus && (
                            <div className={`mb-4 p-3 rounded-xl text-center ${
                                uploadStatus.includes('✅') ? 'bg-green-100 text-green-700 border-2 border-green-300' :
                                uploadStatus.includes('❌') ? 'bg-red-100 text-red-700 border-2 border-red-300' :
                                uploadStatus.includes('⏰') ? 'bg-amber-100 text-amber-700 border-2 border-amber-300' :
                                'bg-blue-100 text-blue-700 border-2 border-blue-300'
                            }`}>
                                {uploadStatus}
                                {sessionId && (
                                    <span className="block text-xs font-mono mt-1">
                                        Session: {sessionId}
                                    </span>
                                )}
                            </div>
                        )}

                        {/* Boutons */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                            <div className="md:col-span-1">
                                <div className="bg-white border-4 border-gray-200 rounded-2xl p-4 shadow-xl h-full">
                                    <div className="text-center mb-3">
                                        <div className="text-4xl font-bold text-blue-600 font-mono">
                                            {formatTime(time)}
                                        </div>
                                        <div className="text-xs text-gray-500">/ {formatTime(testConfig.duration)}</div>
                                    </div>

                                    {isComplete ? (
                                        <button onClick={handleRetry} className="w-full py-3 bg-amber-500 text-white text-lg font-bold rounded-xl hover:bg-amber-600 transition">
                                            🔄 Recommencer
                                        </button>
                                    ) : !isRecording ? (
                                        <button onClick={startRecording} className="w-full py-3 bg-red-600 text-white text-xl font-bold rounded-xl hover:bg-red-700 transition shadow">
                                            🔴 Démarrer
                                        </button>
                                    ) : (
                                        <div className="space-y-2">
                                            <div className="text-center">
                                                <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${isPaused ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                                                    🎙️ {isPaused ? 'Pause' : 'Enregistrement'}
                                                </span>
                                            </div>
                                            <div className="flex gap-2">
                                                <button onClick={togglePause} className="flex-1 py-2.5 bg-amber-500 text-white text-lg font-bold rounded-xl hover:bg-amber-600 transition">
                                                    {isPaused ? '▶️' : '⏸️'}
                                                </button>
                                                <button onClick={stopRecording} className="flex-1 py-2.5 bg-gray-600 text-white text-lg font-bold rounded-xl hover:bg-gray-700 transition">
                                                    ⏹️
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="md:col-span-3">
                                <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-4 h-full flex flex-col justify-between">
                                    <div>
                                        <p className="text-xs font-medium text-blue-600">📋 Consignes</p>
                                        <p className="text-sm text-blue-800 mt-1">
                                            {testConfig.instructions?.join(' • ') || 'Suivez les instructions'}
                                        </p>
                                    </div>
                                    <div className="flex gap-3 mt-3">
                                        <button onClick={() => router.push('/tests')} className="flex-1 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-200 transition">
                                            ← Tests
                                        </button>
                                        <button onClick={handleNextTest} className="flex-1 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition">
                                            Suivant →
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Alerte silence */}
                        {voiceMetrics.isSilent && voiceMetrics.silenceDuration > 3 && (
                            <div className="mt-3 p-3 bg-amber-100 border-2 border-amber-300 rounded-xl text-center">
                                <span className="text-amber-700 font-bold text-sm">🗣️ Silence prolongé</span>
                                <p className="text-amber-600 text-xs">Patient ne parle pas depuis {voiceMetrics.silenceDuration}s</p>
                            </div>
                        )}

                        {/* Mots (si showWordList) */}
                        {testConfig.showWordList && (
                            <div className="mt-4 bg-white border-4 border-gray-200 rounded-2xl p-4 shadow-xl">
                                <div className="flex justify-between items-center mb-3">
                                    <h3 className="text-sm font-bold text-gray-700">📝 Mots cités</h3>
                                    <span className="text-xl font-bold text-blue-600">{words.length}</span>
                                </div>
                                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                                    {words.map((word, index) => (
                                        <span key={index} className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                                            {index + 1}. {word}
                                        </span>
                                    ))}
                                    {isRecording && !isPaused && (
                                        <input
                                            type="text"
                                            value={currentWord}
                                            onChange={(e) => setCurrentWord(e.target.value)}
                                            onKeyDown={handleAddWord}
                                            placeholder="Ajouter..."
                                            className="flex-1 min-w-[100px] px-3 py-1 border-2 border-blue-300 rounded-full focus:border-blue-500 focus:outline-none text-sm"
                                            autoFocus
                                        />
                                    )}
                                </div>
                                {words.length === 0 && !isRecording && (
                                    <p className="text-sm text-gray-400 text-center">Commencez l'enregistrement</p>
                                )}
                            </div>
                        )}
                    </>
                )}

                <div className="mt-6">
                    <EthicsBanner />
                </div>
            </main>
        </>
    )
}