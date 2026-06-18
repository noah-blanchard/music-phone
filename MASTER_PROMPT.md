# Master Prompt: MusicPhone - Jeu Musical Collaboratif

## 1. CONCEPT DU PROJET

**MusicPhone** est un jeu web collaboratif inspiré par le concept de Gartic Phone, mais avec la musique comme médium.

### Mécanique Principale: "Continuer la Mélodie"

1. **Phase d'initialisation**: Chaque joueur crée **4 mesures** d'une mélodie
   - BPM fixe (à définir par la partie/session)
   - Gamme fixe (à définir par la partie/session)
   - Interface: Piano roll minimaliste verrouillé sur la gamme

2. **Phase de rotation**: Les mélodies tournent entre les joueurs
   - Chaque joueur reçoit la **dernière mesure** de la mélodie du joueur précédent
   - Crée **4 mesures supplémentaires** (continuation consciente ou subconsciente)
   - 4 mélodies originales → 4 sessions de 4 joueurs chacune

3. **Résultat final**: 4 mélodies complètes de **16 mesures** (4 mesures × 4 joueurs)

### Interaction Musicale

- **Piano roll**: Interface drag-and-drop minimaliste
- **Sons disponibles**: 4 timbres Tone.js au démarrage (ex: sine, triangle, saw, square ou voix synthétiques)
- **Notes**: Grille verrouillée sur la gamme sélectionnée
- **Combinaison**: Chaque son peut être utilisé sur plusieurs mesures et se combiner dans le piano roll
- **Temps**: Les 4 mesures à remplir, subdivision en 16e ou 8e notes (à déterminer)

---

## 2. STACK TECHNIQUE

### Frontend
- **Framework**: Next.js (App Router)
- **Audio**: Tone.js
- **Styling**: Minimal (Tailwind ou CSS custom, pas de librairie UI lourde)
- **État**: Considérer Zustand ou Context API
- **WebSocket**: Intégration native avec Elysia (Eden client)

### Backend
- **Framework**: Elysia (dernière version)
- **API Patterns**: Eden + Eden Treaty (type-safe end-to-end)
- **WebSocket**: Native Elysia WebSocket avec toutes les fonctionnalités
- **Base de données**: À déterminer (Supabase, MongoDB, SQLite, PostgreSQL)
- **Authentification**: À définir (simple session, JWT, anonyme avec cookies)
- **Validation**: Elysia built-in + Zod si nécessaire

---

## 3. LIVRABLES DEMANDÉS

Avant de coder, fournir:

1. **CLAUDE.md**: Résumé technique complet du projet
   - Architecture globale (frontend/backend/WebSocket)
   - Flows utilisateur principaux
   - Data models (mélodie, note, joueur, session/partie)
   - Endpoints/events WebSocket
   - Stratégies d'état et de synchronisation

2. **PROJECT.md**: Plan d'implémentation détaillé
   - Phase 0: Setup (Next.js + Elysia + Tone.js)
   - Phase 1: Core UI (Piano roll, sélection gamme/BPM, interface note)
   - Phase 2: WebSocket & sync (rooms, rotation, broadcasts)
   - Phase 3: Playback & export (écoute, export audio)
   - Optionnels/Phase 4: Stockage, variantes de mode jeu, UI polish
   - Dependencies à installer avec commandes exactes
   - Fichiers à créer avec structure proposée

3. **20+ Questions de Clarification** (brainstorm maximal)
   - Concernant les mécaniques de jeu
   - La UX/UI
   - Les constraints techniques
   - Les features futures

---

## 4. BRAINSTORM: 20+ QUESTIONS DE CLARIFICATION

Répondre à ces questions pour affiner le projet (même les réponses "pas décidé" sont utiles):

### Mécanique de Jeu

1. **Timing et rotation**: Faut-il une limite de temps pour créer les 4 mesures? (ex: 2 min, pas de limite, tour par tour avec timeout)
2. **Nombre de joueurs**: Minimum/maximum par partie? (4 joueurs fixe ou flexible 2-8?)
3. **Attribution des gammes/BPM**: Décidé avant ou pendant le jeu? (Admin choisi, vote, aléatoire)
4. **Preview de la dernière mesure**: Comment le joueur voit-il la mesure précédente? (Score, playback audio, piano roll grisé, notation textuelle)
5. **Contraint de continuité musicale**: Le joueur DOIT-il respecter la tonalité/harmonie ou c'est libre?
6. **Anonymat/pseudos**: Créditation des créateurs ou résultat anonyme?
7. **Rejeu de parties**: Peut-on rejouer le processus ou juste voir le résultat final?

### Interface & Interaction

8. **Grille temporelle**: Résolution en 16e notes, 8e notes, ou noires? (avec subdivision affichée ou pas)
9. **Feedback sonore**: Écouter chaque note au clic, métronome visible, playback en live?
10. **Sélection des sons**: Combobox, boutons, palette visuelle? Noms des sons ou symboles?
11. **Undo/Reset**: Possibilité d'annuler ou réinitialiser pendant la création?
12. **Édition de durée**: Les notes ont-elles une durée variable (noire, croche, etc) ou durée fixe?
13. **Gammes supportées**: Mineure/majeure seulement ou pentatonique, modes, etc?
14. **Piano roll taille**: Hauteur fixe ou scrollable? Nombre d'octaves visibles?

### Technique & Données

15. **Persistance des données**: Sauvegarder les parties? Format export (MIDI, audio WAV, JSON)?
16. **Historique visuel**: Afficher qui a créé quelle mesure pendant la lecture?
17. **Données du joueur**: Requis (pseudonyme min) ou totalement anon?
18. **Limites de ressources**: Max de parties concurrentes? Cache pour les audio rendu?

### Futures Extensions (hors scope immediate mais bon à savoir)

19. **Mode "Harmonie Parallèle"**: Plusieurs joueurs créent en parallèle et ça se merge (au lieu de rotation séquentielle)?
20. **Mode "Remixage"**: Prendre une mélodie finie, modifier 4 mesures aléatoires d'un autre joueur?
21. **Galerie publique**: Publier/lister les meilleures mélodies?
22. **Collectif libre**: N joueurs créent librement sans rotation, une session de 30min avec accumulation?
23. **Notation musicale**: Afficher partition visuelle (staff) à côté du piano roll?

---

## 5. INSTRUCTION FINALE

Tu es un expert en:
- **Architecture logicielle** (API design, WebSocket patterns, state management)
- **Audio web** (Tone.js, scheduling, timing)
- **UX minimaliste** (contraintes qui clarifies, pas de feature bloat)
- **Fullstack TypeScript** (Elysia + Next.js, type safety end-to-end)

**Tâche**:

1. Lire et assimiler ce brief entièrement.
2. **Brainstormer**: Poser les 20+ questions de clarification de manière structurée et intelligente. Grouper par thème. Identifier les assumptions critiques.
3. **Générer CLAUDE.md**: 
   - Vue d'ensemble architecture (diagrams ASCII ou listes imbriquées)
   - Data models avec types TypeScript (User, Melody, Note, Session, etc)
   - WebSocket events (client → server, server → client)
   - Flow d'une partie complète (création → rotation → playback)
   - Considérations Tone.js (scheduling, timing, polyphonie)
4. **Générer PROJECT.md**:
   - Phase 0-3 avec tâches détaillées et dépendances
   - Structure de fichiers proposée
   - Commandes npm/pnpm exactes
   - Hints d'implémentation pour les points épineux
5. **Créer un plan d'action**: Ordre d'exécution recommandé pour cloner ce repo et commencer.

**Tone**: Pragmatique, concis, assume l'utilisateur = Noah (ingénieur fullstack Polytechnique, à l'aise avec TypeScript, WebSocket, audio, préfère structure dense et directement actionnable).

---

## 6. OPTIONNEL: CONTEXTE UTILISATEUR

- Outil: Claude Code (terminal + éditeur)
- Env: Windows + PowerShell (Node.js, pnpm de préférence)
- Préférences: Code structure dense, comments minimaux, conventions TypeScript strictes, pas d'over-abstraction
- Autres projets actifs: VST JUCE, IA Hex game, coursework STS — partage parfois du code/patterns

Allé, c'est parti! 🎵
