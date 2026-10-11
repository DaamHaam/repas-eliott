# Repas des 18 ans d’Eliott — règles du projet

## Façon de travailler sur ce projet
- **Branche de travail** : `dev`. `main` recevra la version validée uniquement sur demande explicite.
- **Publication** : Vercel, projet `repas-eliott`, publication automatique à chaque push sur `dev` via la liaison GitHub `DaamHaam/repas-eliott` ; publication manuelle depuis le Mac également possible. Aucun site GitHub Pages publié. Base Convex de production déployée depuis ce Mac sur demande.
- **Tags de version** : aucun pour le moment.
- **Particularités** : invités sans compte ; liens personnels de modification ; accès organisateur par clé privée. Ne jamais versionner `.organisateur.local` ou un lien privé.

## Projet et commandes
Application React + Vite + Convex dans `repas-eliott/`. Depuis ce dossier : `npm run dev`, `npm run backend`, `npm test`, `npm run build`. Typecheck backend : `npx tsc --noEmit -p convex/tsconfig.json`.

## Architecture
- `repas-eliott/src/App.tsx` : formulaire public, tableau partagé et espace organisateur.
- `repas-eliott/convex/categories.ts` : catégories, consignes et limites.
- `repas-eliott/convex/meal.ts` : inscriptions et réservations atomiques, résultats protégés.
- `repas-eliott/convex/schema.ts` : familles et places.
- `.github/workflows/ci.yml` : tests et build (CI).

## Invariants métier
- Une réponse par famille : prénom, nombre de convives (la personne qui répond comprise), contributions.
- Les places sont strictement limitées. L’ouverture à des contributions supplémentaires reste en suspens.
- Aucun champ numérique de quantité pour les plats ; les quantités sont des consignes affichées.
- Chacun peut voir les prénoms et les contributions déjà réservées, puis sélectionner les places libres.
- Réservations et modifications dans une seule transaction Convex ; aucune double réservation.
- Les commentaires sont réservés aux organisateurs. Ne jamais exposer les empreintes de liens dans les requêtes publiques.
- Les essais utilisent le déploiement de développement, distinct de la production.

## Base Convex
Lire `repas-eliott/convex/_generated/ai/guidelines.md` avant toute modification backend.
`npx convex dev` déploie le développement ; `npx convex deploy` déploie la production sur demande uniquement.

## Règles communes (catalogue WORKFLOW)

- **Instructions** : ce fichier est l'unique source des règles ; `CLAUDE.md` se limite à `@AGENTS.md`. Ne jamais dupliquer une règle ailleurs. Les singularités du projet (branche, publication, versions) sont dans « Façon de travailler sur ce projet » et priment sur ce bloc.
- **Comptes et services** : voir `ACCOUNTS.md` (GitHub, hébergement, base de données, API, emplacement des secrets), avec pour chaque service **l'identifiant de connexion** (e-mail exact ou méthode). Le mettre à jour dès qu'un compte, un service ou un secret change ; sur le Mac, reporter aussi tout nouveau compte dans `WORKFLOW/COMPTES.md`. Aucune valeur secrète dedans.
- **Avant de coder** : pour une demande non triviale, reformuler ce qui a été compris et poser les questions utiles avant de coder.
- **Faire plutôt que guider** : une étape dans un service (Vercel, Convex, Supabase, GitHub…) se fait avec son CLI ou son MCP, pas en me guidant écran par écran. Si l'outil manque ou n'est pas connecté, le dire d'emblée et proposer de le brancher une fois ; ne guider à la main qu'en dernier recours.
- **Git** : travailler sur la **branche de travail** déclarée plus haut, sans créer d'autre branche durable ni changer ce modèle sans demande explicite. Pas de pull request. Ne jamais réécrire l'historique de la branche de travail ou de `main`. En cloud, si l'outil impose une branche de session, fusionner le travail dans la branche de travail et la pousser avant de terminer.
- **Trace de l'agent** : terminer chaque message de commit par une ligne `Agent: Claude` ou `Agent: Codex`, selon l'agent qui a réellement fait le travail.
- **GitHub** : le compte est fixé par la configuration git (voir `ACCOUNTS.md`). Ne pas utiliser `gh auth switch` ; en cas d'erreur d'accès, le signaler.
- **Automatisations GitHub** (`.github/workflows/agents.yml`) : GitHub pose lui-même les tags (`revue-ok`, `vX.Y.Z`) et envoie les notifications Telegram de clôture et de version, ce qui fonctionne aussi depuis le cloud. Ne pas pousser ces tags soi-même : il suffit de pousser les commits.
- **Notification de fin** : si la tâche a demandé plus de 2 minutes, lancer juste avant la réponse finale `tg-notify "<résumé en quelques phrases>"`, ou `tg-notify --bloque "<raison>"` en cas de blocage après un travail significatif. Une seule notification par tâche, sans donnée sensible. Si l'envoi échoue, le signaler sans considérer la tâche comme échouée. (Chemin complet : `/opt/homebrew/bin/tg-notify`.) En cloud, `tg-notify` n'existe pas : ne rien envoyer, la clôture et les versions sont notifiées par GitHub.
- **Revue de code** (demande « revue », sans PR) : examiner en lecture seule les commits déjà poussés sur la branche de travail depuis le tag `revue-ok` (à défaut depuis `origin/main`), ou le commit / la plage indiqués. Rendre : résumé des fonctionnalités couvertes, problèmes classés par gravité avec `fichier:ligne` et correction proposée, plan de correction. Ne rien corriger sans accord.
- **Clôture** (demande « clôture » ou « fin de session », une fois les corrections validées et poussées) : ajouter en tête de `JOURNAL.md` (titre `# Journal des clôtures` s'il n'existe pas) une entrée courte, sans donnée sensible :
  ```
  ## AAAA-MM-JJ — Claude|Codex · local|cloud
  - Livré : <fonctionnalités revues et testées>
  - Tests : <vérifications lancées et résultat>
  - Corrigé à la revue : <corrections, ou « rien »>
  - En attente : <points reportés, ou « rien »>
  - Prochaine étape : <…>
  ```
  La commiter avec un message qui **commence par `Clôture`** (ex. `Clôture : journal`) et la pousser sur la branche de travail : l'Action GitHub déplace alors `revue-ok` sur ce commit et envoie l'entrée sur Telegram (pas de `tg-notify` en plus). Si le MCP Notion est disponible, mettre aussi à jour la ligne du projet dans la base Notion « État de reprise projets » (Branche, Dernier agent, Environnement, Dernier commit, Dernière session, Où on en est, Prochaine étape). Terminer par un récapitulatif et la ligne « ✅ CONVERSATION CLÔTURÉE — développé, testé, revu ».
- **Reprise** (premier message d'une conversation) : `git fetch origin --tags`, puis donner l'état en une ligne avant de traiter la demande : « ✅ Tout est clôturé (dernière entrée de `JOURNAL.md` : date, agent, prochaine étape) » si `revue-ok` et `origin/<branche de travail>` pointent le même commit, sinon « ⚠️ N commits poussés depuis la dernière clôture, non revus » avec leur liste courte (`git log --oneline revue-ok..origin/<branche de travail>`). Sans tag `revue-ok` : « Aucune clôture enregistrée ». Rappeler la branche de travail, signaler les modifications locales non commitées, puis ajouter la ligne : « Raccourcis : *réfléchis* (reformuler avant de coder) · *revue* (revue de code) · *clôture* ou *fin de session* (journal, tag, notification) · *initialise ce projet* (mise aux normes du workflow) ».
- Maintenir ce fichier quand les commandes, l'architecture, les invariants, la façon de travailler ou le déploiement évoluent.
