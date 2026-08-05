export interface VoiceMetrics {
    volume: number       
    volumeStatus: 'good' | 'warning' | 'error'
    volumeLevel: 'Faible' | 'Bon' | 'Élevé'
    
    noise: number          
    noiseStatus: 'good' | 'warning' | 'error'
    noiseLevel: 'Faible' | 'Moyen' | 'Élevé'
    
    clarity: number    
    clarityStatus: 'good' | 'warning' | 'error'
    clarityLevel: 'Faible' | 'Bonne' | 'Excellente'
    
    isSilent: boolean      
    silenceDuration: number 
    silenceStatus: 'good' | 'warning' | 'error'
}

export interface RecordingState {
    isRecording: boolean
    isPaused: boolean
    isComplete: boolean
    duration: number      
    audioBlob: Blob | null
    audioUrl: string | null
}

export interface VoiceRecorderOptions {
    onMetricsUpdate?: (metrics: VoiceMetrics) => void
    onRecordingStart?: () => void
    onRecordingStop?: (blob: Blob) => void
    onSilenceDetected?: (duration: number) => void
    silenceThreshold?: number  
    silenceTimeout?: number    
}