// app/api/process/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData()
        const audio = formData.get('audio') as File
        const patientId = formData.get('patientId') as string
        const testType = formData.get('testType') as string
        const quality = JSON.parse(formData.get('quality') as string || '{}')

        if (!audio) {
            return NextResponse.json({ error: 'Aucun fichier audio' }, { status: 400 })
        }

        // Simuler le traitement backend
        const processId = `PROC_${Date.now()}`
        
        // Ici, le backend ferait :
        // 1. STT (Speech-to-Text)
        // 2. Extraction de features
        // 3. Classification
        // 4. Retour du diagnostic

        const mockResult = {
            processId,
            patientId,
            testType,
            status: 'processing',
            quality: quality,
            timestamp: new Date().toISOString()
        }

        return NextResponse.json({
            success: true,
            ...mockResult
        })

    } catch (error) {
        console.error('Erreur traitement:', error)
        return NextResponse.json(
            { error: 'Erreur lors du traitement' },
            { status: 500 }
        )
    }
}