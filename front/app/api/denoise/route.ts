// app/api/denoise/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'
import { writeFile, unlink, readFile, mkdir } from 'fs/promises'
import path from 'path'

const execAsync = promisify(exec)

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData()
        const audio = formData.get('audio') as File
        const patientId = formData.get('patientId') as string || 'unknown'
        const testType = formData.get('testType') as string || 'unknown'

        if (!audio) {
            return NextResponse.json(
                { error: 'Aucun fichier audio' },
                { status: 400 }
            )
        }

        // 1. Créer les dossiers temporaires
        const tempDir = path.join(process.cwd(), 'tmp')
        await mkdir(tempDir, { recursive: true })

        const timestamp = Date.now()
        const inputPath = path.join(tempDir, `input_${timestamp}.webm`)
        const outputPath = path.join(tempDir, `output_${timestamp}_denoised.wav`)
        
        // 2. Sauvegarder le fichier audio
        const buffer = Buffer.from(await audio.arrayBuffer())
        await writeFile(inputPath, buffer)

        console.log(`🎙️ Nettoyage audio: ${inputPath}`)

        // 3. Appeler le script Python
        const pythonScript = path.join(process.cwd(), 'scripts', 'denoise__alternative.py')
        const cmd = `python "${pythonScript}" "${inputPath}" -o "${outputPath}" --json`

        const { stdout, stderr } = await execAsync(cmd, { timeout: 120000 })

        if (stderr) {
            console.warn('⚠️ Python stderr:', stderr)
        }

        // 4. Parser les métriques
        let metrics = {}
        try {
            metrics = JSON.parse(stdout)
        } catch (e) {
            console.error('❌ Erreur parsing JSON:', stdout)
            metrics = { error: 'Erreur parsing' }
        }

        // 5. Lire le fichier nettoyé
        const cleanedAudio = await readFile(outputPath)
        const cleanedBase64 = cleanedAudio.toString('base64')

        // 6. Sauvegarder une copie dans public/recordings/
        const recordingsDir = path.join(process.cwd(), 'public', 'recordings')
        await mkdir(recordingsDir, { recursive: true })
        
        const finalFilename = `${patientId}_${testType}_${new Date().toISOString().replace(/[:.]/g, '-')}_cleaned.wav`
        const finalPath = path.join(recordingsDir, finalFilename)
        await writeFile(finalPath, cleanedAudio)

        // 7. Nettoyer les fichiers temporaires
        await unlink(inputPath).catch(() => {})
        await unlink(outputPath).catch(() => {})

        console.log(`✅ Audio nettoyé sauvegardé: ${finalFilename}`)

        return NextResponse.json({
            success: true,
            metrics: metrics,
            filename: finalFilename,
            path: `/recordings/${finalFilename}`,
            audioBase64: cleanedBase64
        })

    } catch (error) {
        console.error('❌ Erreur:', error)
        return NextResponse.json(
            { error: 'Erreur interne du serveur' },
            { status: 500 }
        )
    }
}