'use client'

import { useEffect, useRef } from 'react'

interface VoiceVisualizerProps {
    analyser: AnalyserNode | null
    isRecording: boolean
    isPaused: boolean
    className?: string
}

export function VoiceVisualizer({ analyser, isRecording, isPaused, className = '' }: VoiceVisualizerProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const animationRef = useRef<number | null>(null)

    useEffect(() => {
        if (!canvasRef.current || !analyser || !isRecording || isPaused) {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current)
            }
            return
        }

        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        const bufferLength = analyser.frequencyBinCount
        const dataArray = new Uint8Array(bufferLength)
        const width = canvas.width
        const height = canvas.height

        const draw = () => {
            analyser.getByteTimeDomainData(dataArray)

            ctx.fillStyle = '#f0f4f8'
            ctx.fillRect(0, 0, width, height)

            ctx.lineWidth = 3
            ctx.strokeStyle = '#2563EB'
            ctx.beginPath()

            const sliceWidth = width / bufferLength
            let x = 0

            for (let i = 0; i < bufferLength; i++) {
                const v = dataArray[i] / 128.0
                const y = (v * height) / 2

                if (i === 0) {
                    ctx.moveTo(x, y)
                } else {
                    ctx.lineTo(x, y)
                }

                x += sliceWidth
            }

            ctx.lineTo(width, height / 2)
            ctx.stroke()

            animationRef.current = requestAnimationFrame(draw)
        }

        draw()

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current)
            }
        }
    }, [analyser, isRecording, isPaused])

    return (
        <canvas
            ref={canvasRef}
            width={400}
            height={100}
            className={`w-full h-[100px] rounded-xl bg-gray-50 border-2 border-gray-200 ${className}`}
        />
    )
}