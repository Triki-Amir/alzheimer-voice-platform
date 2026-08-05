This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev

```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

---

## 🛠️ Stack Technique

| Technologie           | Version | Utilisation                       |
| --------------------- | ------- | --------------------------------- |
| **Next.js**           | 16.2.10 | Framework React avec App Router   |
| **TypeScript**        | 5.0+    | Typage statique pour la fiabilité |
| **Tailwind CSS**      | 3.4+    | Styling et accessibilité          |
| **React**             | 19.0+   | UI Components                     |
| **Web Audio API**     | -       | Analyse audio en temps réel       |
| **MediaRecorder API** | -       | Enregistrement audio              |
| **noisereduce**       | Python  | Nettoyage audio (hors-ligne)      |

---

## ✨ Fonctionnalités

### 👥 Gestion des Patients

- 🔍 Recherche de patients par nom, ID, téléphone
- ➕ Création de nouvelles fiches patients
- 📋 Liste complète des patients avec statistiques
- 👤 Page patient dédiée avec 2 actions principales

### 🧪 Tests Cognitifs (8 Tests)

| #   | Test                         | Icône | Durée | Catégorie       |
| --- | ---------------------------- | ----- | ----- | --------------- |
| 1   | Récit d'image (Cookie Theft) | 🖼️    | 3 min | Langage         |
| 2   | Fluence verbale              | 🐾    | 1 min | Langage         |
| 3   | Rappel d'informations        | 📝    | 2 min | Mémoire         |
| 4   | Construction de phrases      | ✏️    | 2 min | Langage         |
| 5   | Nomination d'objets          | 🔍    | 3 min | Langage         |
| 6   | Répétition de phrases        | 🔊    | 2 min | Langage/Mémoire |
| 7   | Compréhension                | 🧠    | 3 min | Compréhension   |
| 8   | Discours spontané            | 💬    | 5 min | Langage         |

### 🎙️ Enregistrement Vocal

- 🔴 Enregistrement audio avec MediaRecorder API
- ⏸️ Pause et reprise
- 📊 Métriques en temps réel adaptées aux patients âgés
  - Volume (seuils: 3% silence, 6% faible, 15% bon)
  - Bruit ambiant
  - Clarté
  - Rythme
- 🔇 Détection de silence (alerte > 3s)
- 📈 Jauges avec pourcentage

### 🧹 Nettoyage Audio Automatique

- 🌐 Appel API `/api/denoise` (Python noisereduce)
- 📊 Métriques après nettoyage : SNR, RMS, réduction bruit
- 💾 Sauvegarde locale dans `public/recordings/`
- 🎵 Lecture audio original + nettoyé
- 💾 Téléchargement audio original/nettoyé

### 📊 Rapports

- 📈 Score global et progression
- 📋 Résultats détaillés par test
- 🎯 Diagnostic et confiance
- 📄 Export PDF (simulé)
- 📊 Statistiques globales

### 🔒 Sécurité & Confidentialité

- 🔐 Authentification sécurisée
- 🔒 Conformité INPDP & RGPD
- 🛡️ Pseudonymisation des données
- 📝 Traçabilité des accès

---

## 🔄 Flux de Données

### Enregistrement Audio
