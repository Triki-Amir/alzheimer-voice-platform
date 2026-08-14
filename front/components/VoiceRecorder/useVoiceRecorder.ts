'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { VoiceMetrics, RecordingState, VoiceRecorderOptions } from '../../types/index.ts'
import { ingestionApi } from '../../lib/ingestion_service_api'

// Valeurs par défaut pour les métriques
const defaultMetrics: VoiceMetrics = {
    volume: 0,
    volumeStatus: 'good',
    volumeLevel: 'Faible',
    noise: 0,
    noiseStatus: 'good',
    noiseLevel: 'Faible',
    clarity: 0,
    clarityStatus: 'good',
    clarityLevel: 'Bonne',
    isSilent: false,
    silenceDuration: 0,
    silenceStatus: 'good'
}

export function useVoiceRecorder(options: VoiceRecorderOptions = {}) {
    const {
        onMetricsUpdate,
        onRecordingStart,
        onRecordingStop,
        onSilenceDetected,
        onUploadComplete,
        onUploadError,
        silenceThreshold = 0.02,
        silenceTimeout = 3,
        patientId,
        testType = 'cognitive'
    } = options

    // État
    const [metrics, setMetrics] = useState<VoiceMetrics>(defaultMetrics)
    const [recordingState, setRecordingState] = useState<RecordingState>({
        isRecording: false,
        isPaused: false,
        isComplete: false,
        duration: 0,
        audioBlob: null,
        audioUrl: null
    })
    const [isUploading, setIsUploading] = useState(false)
    const [uploadError, setUploadError] = useState<string | null>(null)

    // Refs pour les objets audio
    const mediaRecorderRef = useRef<MediaRecorder | null>(null)
    const audioContextRef = useRef<AudioContext | null>(null)
    const analyserRef = useRef<AnalyserNode | null>(null)
    const streamRef = useRef<MediaStream | null>(null)
    const animationFrameRef = useRef<number | null>(null)
    const silenceTimerRef = useRef<NodeJS.Timeout | null>(null)
    const audioChunksRef = useRef<BlobPart[]>([])
    const durationTimerRef = useRef<NodeJS.Timeout | null>(null)

    // Calcul du RMS (Root Mean Square) - mesure du volume
    const calculateRMS = useCallback((dataArray: Uint8Array): number => {
        let sum = 0
        for (let i = 0; i < dataArray.length; i++) {
            const value = (dataArray[i] - 128) / 128 // Normalisation
            sum += value * value
        }
        const rms = Math.sqrt(sum / dataArray.length)
        return Math.min(rms * 100, 100) // Convertir en pourcentage 0-100
    }, [])

    // Calcul du SNR (Signal-to-Noise Ratio) - mesure de la clarté
    const calculateSNR = useCallback((dataArray: Uint8Array): number => {
        let sum = 0
        let sumSquares = 0
        const n = dataArray.length
        
        for (let i = 0; i < n; i++) {
            const value = dataArray[i] / 128
            sum += value
            sumSquares += value * value
        }
        
        const mean = sum / n
        const variance = (sumSquares / n) - (mean * mean)
        const rms = Math.sqrt(Math.max(variance, 0))
        
        // Convertir en pourcentage avec un seuil
        const snrPercent = Math.min((rms * 100) + 20, 100)
        return Math.max(snrPercent, 0)
    }, [])

    // Détection de silence
    const detectSilence = useCallback((rms: number) => {
        const isSilent = rms < silenceThreshold * 100
        
        setMetrics(prev => {
            let silenceDuration = prev.silenceDuration
            let silenceStatus: 'good' | 'warning' | 'error' = 'good'
            
            if (isSilent) {
                silenceDuration += 0.1 // ~100ms d'analyse
                
                if (silenceDuration >= silenceTimeout) {
                    silenceStatus = 'error'
                    if (onSilenceDetected && silenceDuration === Math.floor(silenceDuration)) {
                        onSilenceDetected(Math.floor(silenceDuration))
                    }
                } else if (silenceDuration >= silenceTimeout * 0.5) {
                    silenceStatus = 'warning'
                }
            } else {
                silenceDuration = 0
            }
            
            return {
                ...prev,
                isSilent,
                silenceDuration,
                silenceStatus
            }
        })
    }, [silenceThreshold, silenceTimeout, onSilenceDetected])

    // Analyse audio en temps réel
    const analyzeAudio = useCallback(() => {
        if (!analyserRef.current) return

        const analyser = analyserRef.current
        const dataArray = new Uint8Array(analyser.frequencyBinCount)
        analyser.getByteFrequencyData(dataArray)

        // Calcul des métriques
        const rms = calculateRMS(dataArray)
        const snr = calculateSNR(dataArray)
        
        // Déterminer le niveau de bruit (analyse des basses fréquences)
        let noiseSum = 0
        for (let i = 0; i < Math.min(10, dataArray.length); i++) {
            noiseSum += dataArray[i] / 128
        }
        const noiseLevel = Math.min((noiseSum / 10) * 30, 100)
        
        // Détection de silence
        detectSilence(rms)

        // Mettre à jour les métriques
        setMetrics(prev => {
            const newMetrics: VoiceMetrics = {
                volume: Math.round(rms),
                volumeStatus: rms > 15 ? 'good' : rms > 5 ? 'warning' : 'error',
                volumeLevel: rms > 30 ? 'Élevé' : rms > 10 ? 'Bon' : 'Faible',
                
                noise: Math.round(noiseLevel),
                noiseStatus: noiseLevel < 30 ? 'good' : noiseLevel < 60 ? 'warning' : 'error',
                noiseLevel: noiseLevel < 30 ? 'Faible' : noiseLevel < 60 ? 'Moyen' : 'Élevé',
                
                clarity: Math.round(snr),
                clarityStatus: snr > 50 ? 'good' : snr > 30 ? 'warning' : 'error',
                clarityLevel: snr > 60 ? 'Excellente' : snr > 35 ? 'Bonne' : 'Faible',
                
                isSilent: prev.isSilent,
                silenceDuration: prev.silenceDuration,
                silenceStatus: prev.silenceStatus
            }
            
            // Appel du callback si fourni
            if (onMetricsUpdate) {
                onMetricsUpdate(newMetrics)
            }
            
            return newMetrics
        })

        // Continuer l'analyse
        animationFrameRef.current = requestAnimationFrame(analyzeAudio)
    }, [calculateRMS, calculateSNR, detectSilence, onMetricsUpdate])

    // Démarrer l'enregistrement
    const startRecording = useCallback(async () => {
        setUploadError(null)
        try {
            // Demander l'accès au microphone
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                }
            })
            streamRef.current = stream

            // Créer le contexte audio
            const audioContext = new AudioContext()
            audioContextRef.current = audioContext

            // Créer le nœud source
            const source = audioContext.createMediaStreamSource(stream)

            // Créer l'analyseur
            const analyser = audioContext.createAnalyser()
            analyser.fftSize = 2048
            analyserRef.current = analyser

            source.connect(analyser)

            // Créer le MediaRecorder
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
                
                setRecordingState(prev => ({
                    ...prev,
                    audioBlob: blob,
                    audioUrl: url,
                    isComplete: true
                }))
                
                if (onRecordingStop) {
                    onRecordingStop(blob)
                }
            }

            // Démarrer l'enregistrement
            mediaRecorder.start(1000) // Récupérer les données toutes les secondes
            
            // Démarrer l'analyse audio
            analyzeAudio()
            
            // Démarrer le timer de durée
            durationTimerRef.current = setInterval(() => {
                setRecordingState(prev => ({
                    ...prev,
                    duration: prev.duration + 1
                }))
            }, 1000)

            setRecordingState(prev => ({
                ...prev,
                isRecording: true,
                isPaused: false,
                isComplete: false,
                duration: 0
            }))

            if (onRecordingStart) {
                onRecordingStart()
            }

        } catch (error) {
            console.error('Erreur lors de l\'accès au microphone:', error)
            alert('Impossible d\'accéder au microphone. Veuillez vérifier les permissions.')
        }
    }, [analyzeAudio, onRecordingStart, onRecordingStop])

    // Mettre en pause / reprendre
    const togglePause = useCallback(() => {
        if (!mediaRecorderRef.current) return

        if (recordingState.isPaused) {
            mediaRecorderRef.current.resume()
            // Reprendre l'analyse
            analyzeAudio()
            durationTimerRef.current = setInterval(() => {
                setRecordingState(prev => ({
                    ...prev,
                    duration: prev.duration + 1
                }))
            }, 1000)
        } else {
            mediaRecorderRef.current.pause()
            // Mettre en pause l'analyse
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current)
            }
            if (durationTimerRef.current) {
                clearInterval(durationTimerRef.current)
            }
        }

        setRecordingState(prev => ({
            ...prev,
            isPaused: !prev.isPaused
        }))
    }, [recordingState.isPaused, analyzeAudio])

    // Arrêter l'enregistrement
    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current && recordingState.isRecording) {
            mediaRecorderRef.current.stop()
        }

        // Nettoyer les ressources
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current)
        }
        if (durationTimerRef.current) {
            clearInterval(durationTimerRef.current)
        }
        if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current)
        }

        // Fermer le contexte audio
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            audioContextRef.current.close()
        }

        // Arrêter toutes les pistes du flux
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop())
        }

        setRecordingState(prev => ({
            ...prev,
            isRecording: false,
            isPaused: false,
            isComplete: true
        }))
    }, [recordingState.isRecording])
     const resetRecording = useCallback(() => {
        // Nettoyer les ressources
        if (mediaRecorderRef.current && recordingState.isRecording) {
            mediaRecorderRef.current.stop()
        }
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current)
        }
        if (durationTimerRef.current) {
            clearInterval(durationTimerRef.current)
        }
        if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current)
        }
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            audioContextRef.current.close()
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop())
        }

        // Réinitialiser l'état
        setRecordingState({
            isRecording: false,
            isPaused: false,
            isComplete: false,
            duration: 0,
            audioBlob: null,
            audioUrl: null
        })
        setMetrics(defaultMetrics)
        setUploadError(null)
        audioChunksRef.current = []
    }, [recordingState.isRecording])
    // ✅ NOUVEAU: Uploader l'audio vers le service d'ingestion
    const uploadRecording = useCallback(async () => {
        const { audioBlob, audioUrl } = recordingState
        
        if (!audioBlob && !audioUrl) {
            const errorMsg = 'Aucun audio à uploader'
            setUploadError(errorMsg)
            onUploadError?.(errorMsg)
            return
        }

        if (!patientId) {
            const errorMsg = 'Aucun patient sélectionné'
            setUploadError(errorMsg)
            onUploadError?.(errorMsg)
            return
        }

        setIsUploading(true)
        setUploadError(null)

        try {
            // Si on a un audioUrl mais pas de blob, récupérer le blob
            let blob = audioBlob
            if (!blob && audioUrl) {
                const response = await fetch(audioUrl)
                blob = await response.blob()
            }

            if (!blob) {
                throw new Error('Impossible de récupérer l\'audio')
            }

            // Upload via l'API d'ingestion
            const result = await ingestionApi.uploadAudio(patientId, blob, testType)

            if (result.success && result.data) {
                // Succès
                if (onUploadComplete) {
                    onUploadComplete(result.data.session_id)
                }
                // Réinitialiser après upload réussi
                resetRecording()
            } else {
                throw new Error(result.error || 'Erreur lors de l\'upload')
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Erreur lors de l\'upload'
            setUploadError(errorMessage)
            if (onUploadError) {
                onUploadError(errorMessage)
            }
        } finally {
            setIsUploading(false)
        }
    }, [recordingState, patientId, testType, onUploadComplete, onUploadError, resetRecording])

   

    // Nettoyage à la destruction du composant
    useEffect(() => {
        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current)
            }
            if (durationTimerRef.current) {
                clearInterval(durationTimerRef.current)
            }
            if (silenceTimerRef.current) {
                clearTimeout(silenceTimerRef.current)
            }
            if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
                audioContextRef.current.close()
            }
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop())
            }
        }
    }, [])

    return {
        metrics,
        recordingState,
        startRecording,
        togglePause,
        stopRecording,
        resetRecording,
        uploadRecording, // ✅ NOUVEAU
        isRecording: recordingState.isRecording,
        isPaused: recordingState.isPaused,
        isComplete: recordingState.isComplete,
        isUploading,
        uploadError,
        duration: recordingState.duration,
        audioBlob: recordingState.audioBlob,
        audioUrl: recordingState.audioUrl
    }
}

export default useVoiceRecorder